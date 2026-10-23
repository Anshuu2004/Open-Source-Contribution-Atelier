"""
Email verification for password signups.

The link carries a signed, timestamped key instead of a stored token, so
nothing needs cleaning up afterwards. The key includes the address it was
sent to, which means a link for an old address stops working once the
user changes their email.

Verified state is kept on allauth's ``EmailAddress`` (already installed and
used by the OAuth logins) rather than a new field on the user.
"""

import logging
from typing import Optional

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing

logger = logging.getLogger(__name__)
User = get_user_model()

_SALT = "apps.accounts.email-verification"


class VerificationKeyError(Exception):
    """The key is malformed, tampered with, or points at no current user."""


class VerificationKeyExpired(VerificationKeyError):
    """The key is genuine but older than EMAIL_VERIFICATION_TIMEOUT_HOURS."""

    def __init__(self, user):
        super().__init__("Verification link expired")
        self.user = user


def timeout_hours() -> int:
    return getattr(settings, "EMAIL_VERIFICATION_TIMEOUT_HOURS", 24)


def make_key(user) -> str:
    return signing.dumps({"u": user.pk, "e": user.email.lower()}, salt=_SALT)


def _user_for_payload(payload) -> Optional[object]:
    if not isinstance(payload, dict):
        return None
    user = User.objects.filter(pk=payload.get("u")).first()
    # A key minted for a previous address must not verify the new one.
    if user is None or (user.email or "").lower() != payload.get("e"):
        return None
    return user


def user_for_key(key: str):
    """
    Return the user a current key belongs to.

    Raises ``VerificationKeyExpired`` (carrying the user, so a fresh link can
    be offered) when the signature is valid but too old, and
    ``VerificationKeyError`` for anything else.
    """
    try:
        payload = signing.loads(key, salt=_SALT, max_age=timeout_hours() * 3600)
    except signing.SignatureExpired:
        # Signature is genuine, only the age is wrong.
        user = _user_for_payload(signing.loads(key, salt=_SALT))
        if user is None:
            raise VerificationKeyError("Verification link is no longer valid")
        raise VerificationKeyExpired(user)
    except signing.BadSignature:
        raise VerificationKeyError("Verification link is invalid")

    user = _user_for_payload(payload)
    if user is None:
        raise VerificationKeyError("Verification link is no longer valid")
    return user


def user_for_expired_key(key: str):
    """Return the user behind a genuine key regardless of age, else None."""
    try:
        return _user_for_payload(signing.loads(key, salt=_SALT))
    except signing.BadSignature:
        return None


def is_verified(user) -> bool:
    return EmailAddress.objects.filter(
        user=user, email__iexact=user.email, verified=True
    ).exists()


def mark_verified(user) -> bool:
    """Mark the user's current address verified. Returns False if it already was."""
    address = EmailAddress.objects.filter(user=user, email__iexact=user.email).first()
    if address is None:
        EmailAddress.objects.create(
            user=user,
            email=user.email,
            verified=True,
            primary=not EmailAddress.objects.filter(user=user, primary=True).exists(),
        )
        return True
    if address.verified:
        return False
    address.verified = True
    address.save(update_fields=["verified"])
    return True
