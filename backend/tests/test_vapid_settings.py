"""Regression tests for #3105: VAPID_* values that only live in backend/.env
must reach Django settings, and both push code paths must send the same
``sub`` claim.

The settings cases import config.settings in a fresh subprocess so module-level
code runs again. load_dotenv is redirected to a temp file, so a real
backend/.env on the dev machine is never read or written.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.notifications.channels.push_channel import PushChannel
from apps.notifications.models import PushSubscription
from apps.notifications.tasks import send_web_push_notification
from apps.notifications.vapid import build_vapid_claims

BACKEND_DIR = Path(__file__).resolve().parent.parent

VAPID_VARS = ("VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "VAPID_ADMIN_EMAIL")

SETTINGS_PROBE = """
import json
import os

import dotenv

_real_load_dotenv = dotenv.load_dotenv


def _load_test_dotenv(*args, **kwargs):
    return _real_load_dotenv(os.environ["TEST_DOTENV_PATH"], **kwargs)


dotenv.load_dotenv = _load_test_dotenv

from config import settings

print(
    json.dumps(
        {
            "VAPID_PRIVATE_KEY": settings.VAPID_PRIVATE_KEY,
            "VAPID_PUBLIC_KEY": settings.VAPID_PUBLIC_KEY,
            "VAPID_ADMIN_EMAIL": settings.VAPID_ADMIN_EMAIL,
        }
    )
)
"""


def _load_settings(tmp_path, dotenv_text, extra_env=None):
    dotenv_file = tmp_path / ".env"
    dotenv_file.write_text(dotenv_text)

    env = {k: v for k, v in os.environ.items() if k not in VAPID_VARS}
    env["TEST_DOTENV_PATH"] = str(dotenv_file)
    env.update(extra_env or {})

    result = subprocess.run(
        [sys.executable, "-c", SETTINGS_PROBE],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_vapid_values_are_read_from_dotenv(tmp_path):
    values = _load_settings(
        tmp_path,
        "VAPID_PRIVATE_KEY=priv_from_dotenv\n"
        "VAPID_PUBLIC_KEY=pub_from_dotenv\n"
        "VAPID_ADMIN_EMAIL=mailto:admin@example.com\n",
    )

    assert values["VAPID_PRIVATE_KEY"] == "priv_from_dotenv"
    assert values["VAPID_PUBLIC_KEY"] == "pub_from_dotenv"
    assert values["VAPID_ADMIN_EMAIL"] == "mailto:admin@example.com"


def test_real_env_var_wins_over_dotenv(tmp_path):
    values = _load_settings(
        tmp_path,
        "VAPID_PRIVATE_KEY=priv_from_dotenv\n",
        extra_env={"VAPID_PRIVATE_KEY": "priv_from_shell"},
    )

    assert values["VAPID_PRIVATE_KEY"] == "priv_from_shell"


def test_blank_or_missing_vapid_values_stay_falsy(tmp_path):
    blank = _load_settings(
        tmp_path,
        "VAPID_PRIVATE_KEY=\nVAPID_PUBLIC_KEY=   \nVAPID_ADMIN_EMAIL=\n",
    )
    missing = _load_settings(tmp_path, "")

    for values in (blank, missing):
        assert not values["VAPID_PRIVATE_KEY"]
        assert not values["VAPID_PUBLIC_KEY"]
        assert not values["VAPID_ADMIN_EMAIL"]


@pytest.mark.parametrize(
    "admin_email, expected",
    [
        ("admin@example.com", "mailto:admin@example.com"),
        ("mailto:admin@example.com", "mailto:admin@example.com"),
        ("MAILTO:admin@example.com", "mailto:admin@example.com"),
        ("  mailto:admin@example.com  ", "mailto:admin@example.com"),
        ("https://example.com/contact", "https://example.com/contact"),
    ],
)
def test_build_vapid_claims_normalises_sub(admin_email, expected):
    assert build_vapid_claims(admin_email) == {"sub": expected}


def _make_subscribed_user():
    user = get_user_model().objects.create_user(
        username="vapid_claim_user", password="test-password"
    )
    PushSubscription.objects.create(
        user=user,
        endpoint="https://push.example.test/subscription/1",
        p256dh="p256dh-1",
        auth="auth-1",
    )
    return user


def _send_via_task(user):
    with patch("apps.notifications.tasks.webpush") as webpush:
        send_web_push_notification(user.id, "Title", "Message")
    return webpush


def _send_via_channel(user):
    delivery = SimpleNamespace(id=1)
    payload = {"title": "Title", "message": "Message"}
    with patch("apps.notifications.channels.push_channel.webpush") as webpush:
        assert PushChannel().deliver(delivery, user, payload) is True
    return webpush


@pytest.mark.django_db
@pytest.mark.parametrize("send", [_send_via_task, _send_via_channel])
@pytest.mark.parametrize(
    "admin_email", ["admin@example.com", "mailto:admin@example.com"]
)
def test_both_push_paths_send_the_same_sub_claim(send, admin_email):
    user = _make_subscribed_user()

    with override_settings(
        VAPID_PRIVATE_KEY="test-private-key", VAPID_ADMIN_EMAIL=admin_email
    ):
        webpush = send(user)

    webpush.assert_called_once()
    kwargs = webpush.call_args.kwargs
    assert kwargs["vapid_private_key"] == "test-private-key"
    assert kwargs["vapid_claims"] == {"sub": "mailto:admin@example.com"}


@pytest.mark.django_db
def test_channel_falls_back_to_default_contact_when_email_blank():
    user = _make_subscribed_user()

    with override_settings(VAPID_PRIVATE_KEY="test-private-key", VAPID_ADMIN_EMAIL=""):
        webpush = _send_via_channel(user)

    assert webpush.call_args.kwargs["vapid_claims"] == {
        "sub": "mailto:admin@atelier.dev"
    }


@pytest.mark.django_db
@pytest.mark.parametrize("send", [_send_via_task, _send_via_channel])
def test_blank_private_key_keeps_push_mocked(send):
    user = _make_subscribed_user()

    with override_settings(
        VAPID_PRIVATE_KEY="", VAPID_ADMIN_EMAIL="mailto:admin@example.com"
    ):
        webpush = send(user)

    webpush.assert_not_called()
    assert PushSubscription.objects.filter(user=user).exists()
