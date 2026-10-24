import re
import time
from importlib import import_module
from unittest.mock import patch

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from rest_framework import status

from apps.accounts import email_verification

User = get_user_model()


@pytest.fixture(autouse=True)
def _loose_verification_throttles(settings, monkeypatch):
    # DRF throttles hold a reference to this exact dict, so patch its keys
    # (restored at teardown) instead of swapping in a new dict.
    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    monkeypatch.setitem(rates, "auth_email_verify", "10000/hour")
    monkeypatch.setitem(rates, "auth_email_verification_resend", "10000/hour")


@pytest.fixture(autouse=True)
def _run_queued_tasks_inline(monkeypatch):
    # django-q reads Q_CLUSTER at import time, so the conftest "sync" setting
    # does not reach views.async_task. Run the real task in place instead.
    def run_now(func_path, *args, **kwargs):
        module_path, name = func_path.rsplit(".", 1)
        return getattr(import_module(module_path), name)(*args, **kwargs)

    monkeypatch.setattr("apps.accounts.views.async_task", run_now)


@pytest.fixture
def new_user(db):
    return User.objects.create_user(
        username="verify_me",
        email="verify_me@example.com",
        password="SecurePassword123!",
    )


def _expired_key(user):
    hours = email_verification.timeout_hours()
    with patch(
        "django.core.signing.time.time",
        return_value=time.time() - (hours + 1) * 3600,
    ):
        return email_verification.make_key(user)


def _verify(api_client, key):
    return api_client.get(reverse("verify-email", kwargs={"key": key}))


def _key_from_outbox():
    match = re.search(r"/verify-email/(\S+)", mail.outbox[-1].body)
    assert match, mail.outbox[-1].body
    return match.group(1)


@pytest.mark.django_db
class TestSignupSendsVerification:
    def test_signup_emails_a_link_that_verifies(self, api_client):
        response = api_client.post(
            reverse("signup"),
            {
                "username": "fresh_user",
                "email": "Fresh@Example.com",
                "password": "SecurePassword123!",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["fresh@example.com"]
        user = User.objects.get(username="fresh_user")
        assert not email_verification.is_verified(user)

        response = _verify(api_client, _key_from_outbox())
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"status": "verified"}
        assert email_verification.is_verified(user)

    def test_mail_failure_does_not_fail_signup(self, api_client):
        with patch(
            "apps.accounts.views.send_verification_email",
            side_effect=ConnectionError("smtp down"),
        ):
            response = api_client.post(
                reverse("signup"),
                {
                    "username": "unlucky",
                    "email": "unlucky@example.com",
                    "password": "SecurePassword123!",
                },
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(username="unlucky").exists()


@pytest.mark.django_db
class TestVerifyEmail:
    def test_second_visit_reports_already_verified(self, api_client, new_user):
        key = email_verification.make_key(new_user)
        assert _verify(api_client, key).data == {"status": "verified"}

        response = _verify(api_client, key)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"status": "already_verified"}
        assert EmailAddress.objects.filter(user=new_user).count() == 1

    def test_expired_link(self, api_client, new_user):
        response = _verify(api_client, _expired_key(new_user))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "expired_key"
        assert not email_verification.is_verified(new_user)

    def test_expired_link_for_verified_address_is_not_an_error(
        self, api_client, new_user
    ):
        email_verification.mark_verified(new_user)
        response = _verify(api_client, _expired_key(new_user))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"status": "already_verified"}

    def test_tampered_link(self, api_client, new_user):
        key = email_verification.make_key(new_user)
        response = _verify(api_client, key[:-2] + "xx")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "invalid_key"

    def test_link_for_previous_address_is_rejected(self, api_client, new_user):
        key = email_verification.make_key(new_user)
        new_user.email = "changed@example.com"
        new_user.save()

        response = _verify(api_client, key)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "invalid_key"
        assert not email_verification.is_verified(new_user)

    def test_existing_unverified_address_is_updated_not_duplicated(
        self, api_client, new_user
    ):
        EmailAddress.objects.create(
            user=new_user, email=new_user.email, verified=False, primary=True
        )
        _verify(api_client, email_verification.make_key(new_user))

        address = EmailAddress.objects.get(user=new_user)
        assert address.verified and address.primary

    def test_concurrent_verify_does_not_500(self, api_client, new_user, monkeypatch):
        # Another request (double click, mail client prefetch) inserted the
        # row after our lookup missed it, so our create hits the unique
        # (user, email) constraint.
        EmailAddress.objects.create(
            user=new_user, email=new_user.email, verified=True, primary=True
        )
        real_filter = EmailAddress.objects.filter
        stale = {"done": False}

        def filter_with_stale_lookup(*args, **kwargs):
            qs = real_filter(*args, **kwargs)
            lookup = "email__iexact" in kwargs and "verified" not in kwargs
            if lookup and not stale["done"]:
                stale["done"] = True
                return qs.none()
            return qs

        monkeypatch.setattr(EmailAddress.objects, "filter", filter_with_stale_lookup)
        response = _verify(api_client, email_verification.make_key(new_user))

        assert stale["done"]
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"status": "already_verified"}
        assert EmailAddress.objects.filter(user=new_user).count() == 1


@pytest.mark.django_db
class TestResendVerification:
    url = "/api/auth/resend-verification/"

    def test_resend_by_email(self, api_client, new_user):
        response = api_client.post(self.url, {"email": "VERIFY_ME@example.com"})
        assert response.status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 1
        assert _verify(api_client, _key_from_outbox()).data == {"status": "verified"}

    def test_resend_from_expired_link(self, api_client, new_user):
        response = api_client.post(self.url, {"key": _expired_key(new_user)})
        assert response.status_code == status.HTTP_200_OK
        assert mail.outbox[-1].to == [new_user.email]

    def test_same_answer_for_unknown_or_verified_accounts(self, api_client, new_user):
        email_verification.mark_verified(new_user)
        known = api_client.post(self.url, {"email": new_user.email})
        unknown = api_client.post(self.url, {"email": "nobody@example.com"})
        forged = api_client.post(self.url, {"key": "not-a-real-key"})

        for response in (known, unknown, forged):
            assert response.status_code == status.HTTP_200_OK
            assert response.data == known.data
        assert mail.outbox == []

    def test_queue_failure_still_returns_generic_response(
        self, api_client, new_user, monkeypatch
    ):
        def boom(*args, **kwargs):
            raise ConnectionError("queue down")

        monkeypatch.setattr("apps.accounts.views.async_task", boom)
        known = api_client.post(self.url, {"email": new_user.email})
        unknown = api_client.post(self.url, {"email": "nobody@example.com"})
        assert known.status_code == status.HTTP_200_OK
        assert known.data == unknown.data

    def test_requires_email_or_key(self, api_client):
        response = api_client.post(self.url, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_resend_from_expired_link_is_counted_once_per_request(
    api_client, new_user, settings, monkeypatch
):
    from django.core.cache import cache

    cache.clear()
    monkeypatch.setitem(
        settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "auth_email_verification_resend",
        "3/hour",
    )
    key = _expired_key(new_user)

    statuses = [
        api_client.post("/api/auth/resend-verification/", {"key": key}).status_code
        for _ in range(4)
    ]
    assert statuses == [200, 200, 200, 429]
