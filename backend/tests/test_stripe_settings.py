"""Regression tests for #3104: Stripe keys that only live in backend/.env
must reach Django settings and stripe.api_key.

Each case imports config.settings in a fresh subprocess so module-level code
runs again. load_dotenv is redirected to a temp file, so a real backend/.env
on the dev machine is never read or written.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

STRIPE_VARS = ("STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET")

SETTINGS_PROBE = """
import json
import os

import dotenv

_real_load_dotenv = dotenv.load_dotenv


def _load_test_dotenv(*args, **kwargs):
    return _real_load_dotenv(os.environ["TEST_DOTENV_PATH"], **kwargs)


dotenv.load_dotenv = _load_test_dotenv

import stripe

from config import settings

print(
    json.dumps(
        {
            "STRIPE_PUBLISHABLE_KEY": settings.STRIPE_PUBLISHABLE_KEY,
            "STRIPE_SECRET_KEY": settings.STRIPE_SECRET_KEY,
            "STRIPE_WEBHOOK_SECRET": settings.STRIPE_WEBHOOK_SECRET,
            "stripe.api_key": stripe.api_key,
        }
    )
)
"""


def _load_settings(tmp_path, dotenv_text, extra_env=None):
    dotenv_file = tmp_path / ".env"
    dotenv_file.write_text(dotenv_text)

    env = {k: v for k, v in os.environ.items() if k not in STRIPE_VARS}
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


def test_stripe_keys_are_read_from_dotenv(tmp_path):
    values = _load_settings(
        tmp_path,
        "STRIPE_PUBLISHABLE_KEY=pk_test_from_dotenv\n"
        "STRIPE_SECRET_KEY=sk_test_from_dotenv\n"
        "STRIPE_WEBHOOK_SECRET=whsec_from_dotenv\n",
    )

    assert values["STRIPE_PUBLISHABLE_KEY"] == "pk_test_from_dotenv"
    assert values["STRIPE_SECRET_KEY"] == "sk_test_from_dotenv"
    assert values["STRIPE_WEBHOOK_SECRET"] == "whsec_from_dotenv"
    assert values["stripe.api_key"] == "sk_test_from_dotenv"


def test_real_env_var_wins_over_dotenv(tmp_path):
    values = _load_settings(
        tmp_path,
        "STRIPE_SECRET_KEY=sk_test_from_dotenv\n",
        extra_env={"STRIPE_SECRET_KEY": "sk_test_from_shell"},
    )

    assert values["STRIPE_SECRET_KEY"] == "sk_test_from_shell"
    assert values["stripe.api_key"] == "sk_test_from_shell"


def test_stripe_keys_stay_unset_without_any_config(tmp_path):
    values = _load_settings(tmp_path, "")

    assert values["STRIPE_PUBLISHABLE_KEY"] is None
    assert values["STRIPE_SECRET_KEY"] is None
    assert values["STRIPE_WEBHOOK_SECRET"] is None
    assert values["stripe.api_key"] is None
