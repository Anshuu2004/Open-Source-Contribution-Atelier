"""Shared helpers for building VAPID claims for Web Push."""

DEFAULT_VAPID_ADMIN_EMAIL = "admin@atelier.dev"


def build_vapid_claims(admin_email):
    """Return the ``vapid_claims`` dict for pywebpush.

    VAPID_ADMIN_EMAIL may be a bare address or already carry the ``mailto:``
    prefix (that is how .env.example ships it), so strip it before adding it
    back once. An https:// contact URL is passed through untouched.
    """
    contact = (admin_email or "").strip()
    if contact.lower().startswith("https://"):
        return {"sub": contact}
    if contact.lower().startswith("mailto:"):
        contact = contact[len("mailto:") :].strip()
    return {"sub": f"mailto:{contact}"}
