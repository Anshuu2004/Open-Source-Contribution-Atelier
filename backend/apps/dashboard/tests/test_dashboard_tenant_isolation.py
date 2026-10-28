"""
Cross-tenant regression tests for dashboard endpoints (issue #3144).

A signed-in member of Org A must only see their own contributor dashboard,
must be rejected from admin/analytics endpoints, and must not see private
per-user fields of Org B members on the leaderboard. Uses the shared tenant
fixtures from ``backend/conftest.py``.
"""

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.content.models import Lesson
from apps.dashboard.models import Issue, PullRequest
from apps.progress.models import LessonProgress

PRIVATE_USER_FIELDS = {"email", "first_name", "last_name", "organization"}
CONTRIBUTOR_FIELDS = (
    "personal_stats,assigned_issues,recent_prs,progress_tracker,continue_learning"
)


@pytest.fixture(autouse=True)
def _clear_cache():
    # Dashboard views cache per user id / page, and ids repeat across tests.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def tenant_b_dashboard_data(user_b, org_b):
    """Dashboard-relevant rows owned by user_b in org_b."""
    done_lesson = Lesson.objects.create(
        title="Bob done",
        slug="bob-done",
        summary="Fixture",
        content="Fixture content",
        difficulty="beginner",
    )
    started_lesson = Lesson.objects.create(
        title="Bob started",
        slug="bob-started",
        summary="Fixture",
        content="Fixture content",
        difficulty="beginner",
    )
    LessonProgress.objects.create(
        user=user_b, lesson=done_lesson, organization=org_b, completed=True, score=80
    )
    LessonProgress.objects.create(
        user=user_b,
        lesson=started_lesson,
        organization=org_b,
        completed=False,
        score=20,
    )
    solved = Issue.objects.create(
        title="Bob solved",
        description="Fixture",
        assigned_to=user_b,
        status=Issue.Status.SOLVED,
    )
    Issue.objects.create(title="Bob open", description="Fixture", assigned_to=user_b)
    PullRequest.objects.create(
        title="Bob PR",
        user=user_b,
        issue=solved,
        status=PullRequest.Status.MERGED,
        merged_at=timezone.now(),
    )


@pytest.mark.django_db
class TestContributorDashboardTenantIsolation:
    def test_contributor_dashboard_returns_only_own_data(
        self, authed_client_a, tenant_b_dashboard_data
    ):
        response = authed_client_a.get(
            "/api/dashboard/contributor/", {"fields": CONTRIBUTOR_FIELDS}
        )
        assert response.status_code == 200
        stats = response.data["personal_stats"]
        assert stats["issues_solved"] == 0
        assert stats["prs_merged"] == 0
        assert stats["total_xp"] == 0
        assert response.data["assigned_issues"] == []
        assert response.data["recent_prs"] == []
        assert response.data["progress_tracker"]["completed_lessons"] == 0
        assert response.data["continue_learning"] == []


@pytest.mark.django_db
class TestDashboardAnalyticsRejectTenantMember:
    @pytest.mark.parametrize(
        "url",
        [
            "/api/dashboard/admin/",
            "/api/dashboard/analytics/",
            "/api/dashboard/usage-analytics/",
        ],
    )
    def test_member_without_role_is_rejected(
        self, authed_client_a, tenant_b_dashboard_data, url
    ):
        response = authed_client_a.get(url)
        assert response.status_code == 403


@pytest.mark.django_db
class TestDashboardLeaderboardPrivacy:
    def test_leaderboard_hides_other_tenant_private_fields(
        self, authed_client_a, user_b, tenant_b_dashboard_data
    ):
        response = authed_client_a.get("/api/leaderboard/")
        assert response.status_code == 200
        for entry in response.data["results"]:
            assert not PRIVATE_USER_FIELDS & set(entry)
        assert user_b.email.encode() not in response.content
