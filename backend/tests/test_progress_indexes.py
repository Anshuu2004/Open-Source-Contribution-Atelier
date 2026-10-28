import pytest
from django.contrib.auth import get_user_model
from django.db import connection

User = get_user_model()

from apps.content.models import Lesson
from apps.progress.models import LessonProgress, XPEvent


def _get_db_index_names(model):
    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(
            cursor, model._meta.db_table
        )
    return {name for name, info in constraints.items() if info["index"]}


@pytest.mark.django_db
class TestLessonProgressIndexes:
    """Verify that LessonProgress Meta defines the expected indexes and constraints."""

    def _get_model_index_names(self):
        return [idx.name for idx in LessonProgress._meta.indexes]

    def _get_model_constraint_names(self):
        return [c.name for c in LessonProgress._meta.constraints]

    def test_unique_user_lesson_constraint_exists(self):
        constraint_names = self._get_model_constraint_names()
        assert "unique_user_lesson_progress" in constraint_names

    def test_user_completed_index_exists(self):
        index_names = self._get_model_index_names()
        assert "idx_progress_user_completed" in index_names

    def test_user_score_index_exists(self):
        index_names = self._get_model_index_names()
        assert "idx_progress_user_score" in index_names

    def test_updated_at_index_exists(self):
        """Covers global updated_at__gte range filters in dashboard analytics."""
        assert "idx_progress_updated" in self._get_model_index_names()

    def test_new_indexes_applied_by_migration(self):
        db_index_names = _get_db_index_names(LessonProgress)
        assert "idx_progress_updated" in db_index_names

    def test_unique_constraint_enforced(self):
        """Inserting a duplicate (user, lesson) pair raises IntegrityError."""
        user = User.objects.create_user(username="dup_user")
        lesson = Lesson.objects.create(
            title="Dup Lesson",
            slug="dup-lesson",
            summary="s",
            content="c",
            order=1,
        )
        LessonProgress.objects.create(user=user, lesson=lesson, completed=False)

        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            # completed differs intentionally — uniqueness is on (user, lesson) alone
            LessonProgress.objects.create(user=user, lesson=lesson, completed=True)

    def test_no_unique_together_on_meta(self):
        """Confirm the deprecated unique_together has been removed."""
        assert LessonProgress._meta.unique_together == ()


@pytest.mark.django_db
class TestXPEventIndexes:
    """Verify that XPEvent Meta defines the expected indexes."""

    def test_user_created_index_exists(self):
        """Covers per-user created_at range filters (digests, milestones)."""
        index_names = [idx.name for idx in XPEvent._meta.indexes]
        assert "idx_xp_user_created" in index_names

    def test_user_created_index_applied_by_migration(self):
        assert "idx_xp_user_created" in _get_db_index_names(XPEvent)
