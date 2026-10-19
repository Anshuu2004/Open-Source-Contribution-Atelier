import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.throttles import SignupThrottle


@pytest.mark.django_db
def test_debug_signup_throttle():
    cache.clear()
    t = SignupThrottle()
    print("RATE:", t.rate, "NUM:", t.num_requests, "DUR:", t.duration)
    print("MRO:", [c.__name__ for c in SignupThrottle.__mro__[:6]])
    c = APIClient()
    c.defaults["REMOTE_ADDR"] = "203.0.113.99"
    codes = []
    for i in range(12):
        r = c.post(
            "/api/auth/signup/",
            {"username": f"zz{i}", "email": f"zz{i}@x.com", "password": "Aa1!aaaa"},
            format="json",
        )
        codes.append(r.status_code)
    print("CODES:", codes)
    print("CACHE:", {k: v for k, v in cache._cache.items() if b"signup" in k or "signup" in k})
    assert False, "debug"
