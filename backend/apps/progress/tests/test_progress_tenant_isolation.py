"""
Cross-tenant regression tests for progress endpoints (issue #3144).

A signed-in member of Org A must not be able to read progress, help
requests, bookmarks, submissions or private leaderboard data belonging to
a member of Org B. Uses the shared tenant fixtures from ``backend/conftest.py``.
"""

from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache

from apps.content.models import Exercise, Lesson
from apps.progress.models import (
    CodeSubmission,
    ExerciseAttempt,
    HelpRequest,
    LessonBookmark,
    LessonProgress,
    PeerReview,
)

User = get_user_model()

PRIVATE_USER_FIELDS = {"email", "first_name", "last_name", "organization"}


def _results(data):
    return data.get("results") if isinstance(data, dict) else data


@pytest.fixture(autouse=True)
def _clear_cache():
    # Several progress views cache per org/user id, and ids repeat across tests.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def lesson(db):
    return Lesson.objects.create(
        title="Tenant lesson",
        slug="tenant-lesson",
        summary="Tenant isolation fixture",
        content="Fixture content",
        difficulty="beginner",
    )


@pytest.fixture
def exercise(lesson):
    return Exercise.objects.create(
        lesson=lesson,
        title="Tenant exercise",
        prompt="Run git status",
        expected_command="git status",
    )


@pytest.fixture
def tenant_b_activity(user_b, org_b, lesson, exercise):
    """Progress-related rows owned by user_b in org_b."""
    return SimpleNamespace(
        progress=LessonProgress.objects.create(
            user=user_b, lesson=lesson, organization=org_b, completed=True, score=100
        ),
        help_request=HelpRequest.objects.create(
            user=user_b,
            lesson=lesson,
            organization=org_b,
            message="Bob's private question",
        ),
        bookmark=LessonBookmark.objects.create(user=user_b, lesson=lesson),
        submission=CodeSubmission.objects.create(
            user=user_b, title="Bob's submission", code_snippet="print('bob')"
        ),
        attempt=ExerciseAttempt.objects.create(
            user=user_b, exercise=exercise, organization=org_b, is_correct=False
        ),
    )


# ---------------------------------------------------------------------------
# List endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProgressListEndpointsExcludeOtherTenant:
    def test_my_progress_excludes_other_tenant(
        self, authed_client_a, user_a, tenant_b_activity
    ):
        response = authed_client_a.get("/api/progress/me/")
        assert response.status_code == 200
        ids = [row["id"] for row in response.data]
        assert tenant_b_activity.progress.id not in ids
        assert all(row["user"] == user_a.id for row in response.data)

    def test_help_requests_exclude_other_tenant(
        self, authed_client_a, tenant_b_activity
    ):
        response = authed_client_a.get("/api/progress/help-requests/")
        assert response.status_code == 200
        ids = [row["id"] for row in response.data]
        assert tenant_b_activity.help_request.id not in ids

    def test_community_feed_excludes_other_tenant(
        self, authed_client_a, user_a, org_a, lesson, user_b, tenant_b_activity
    ):
        own = HelpRequest.objects.create(
            user=user_a, lesson=lesson, organization=org_a, message="Alice asks"
        )
        response = authed_client_a.get("/api/progress/feed/")
        assert response.status_code == 200
        entries = _results(response.data)
        assert f"hr_{own.id}" in [e["id"] for e in entries]
        assert user_b.id not in [e["user_id"] for e in entries]

    def test_community_stats_scoped_to_own_tenant(
        self, authed_client_a, user_a, org_a, lesson, tenant_b_activity
    ):
        HelpRequest.objects.create(
            user=user_a, lesson=lesson, organization=org_a, message="Alice asks"
        )
        response = authed_client_a.get("/api/progress/community-stats/")
        assert response.status_code == 200
        # Only Alice's open request in Org A is counted, not Bob's in Org B.
        assert response.data["open_requests"] == 1

    def test_timeline_counts_only_own_activity(
        self, authed_client_a, tenant_b_activity
    ):
        response = authed_client_a.get("/api/progress/timeline/")
        assert response.status_code == 200
        assert response.data["completed_lessons"] == 0
        assert response.data["exercise_attempts"] == 0
        assert response.data["help_requests"] == 0

    def test_heatmap_shows_only_own_activity(self, authed_client_a, tenant_b_activity):
        response = authed_client_a.get("/api/progress/heatmap/")
        assert response.status_code == 200
        assert response.data == []

    def test_bookmarks_exclude_other_tenant(self, authed_client_a, tenant_b_activity):
        response = authed_client_a.get("/api/progress/bookmarks/")
        assert response.status_code == 200
        assert tenant_b_activity.bookmark.id not in [b["id"] for b in response.data]


# ---------------------------------------------------------------------------
# Object-level endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProgressObjectEndpointsRejectOtherTenant:
    def test_bookmark_detail_does_not_expose_other_tenant(
        self, authed_client_a, lesson, tenant_b_activity
    ):
        response = authed_client_a.get(f"/api/progress/bookmarks/{lesson.slug}/")
        assert response.status_code == 200
        assert tenant_b_activity.bookmark.id not in [b["id"] for b in response.data]

    def test_cannot_delete_other_tenant_bookmark(
        self, authed_client_a, lesson, tenant_b_activity
    ):
        response = authed_client_a.delete(f"/api/progress/bookmarks/{lesson.slug}/")
        assert response.status_code == 404
        assert LessonBookmark.objects.filter(pk=tenant_b_activity.bookmark.pk).exists()

    def test_cannot_review_other_tenant_submission(
        self, authed_client_a, tenant_b_activity
    ):
        submission = tenant_b_activity.submission
        response = authed_client_a.post(
            f"/api/progress/code-submissions/{submission.id}/reviews/",
            {"is_approved": True, "comment": "Looks good"},
            format="json",
        )
        assert response.status_code in (403, 404)
        assert not PeerReview.objects.filter(submission=submission).exists()


# ---------------------------------------------------------------------------
# Leaderboard: public ranking only, no private per-user fields
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProgressLeaderboardPrivacy:
    def test_leaderboard_hides_other_tenant_private_fields(
        self, authed_client_a, user_a, org_a, lesson, user_b, tenant_b_activity
    ):
        other_lesson = Lesson.objects.create(
            title="Alice lesson",
            slug="alice-lesson",
            summary="Fixture",
            content="Fixture content",
            difficulty="beginner",
        )
        LessonProgress.objects.create(
            user=user_a,
            lesson=other_lesson,
            organization=org_a,
            completed=True,
            score=40,
        )
        response = authed_client_a.get("/api/progress/leaderboard/")
        assert response.status_code == 200
        for entry in response.data["leaderboard"]:
            assert not PRIVATE_USER_FIELDS & set(entry)
        assert user_b.email.encode() not in response.content
        # Personal rank always describes the requester, never another user.
        assert response.data["personal_rank"]["total_xp"] == 40
