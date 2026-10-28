from apps.learning_analytics.serializers import LearningPathListSerializer


def test_next_step_is_a_serialized_field():
    # `next_step` was declared on the serializer but missing from Meta.fields,
    # which makes DRF raise an AssertionError as soon as the fields are built
    # (for serialization and for OpenAPI schema generation alike).
    fields = LearningPathListSerializer().fields

    assert "next_step" in fields
    assert fields["next_step"].read_only
