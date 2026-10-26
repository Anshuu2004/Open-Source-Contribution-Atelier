import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def scan_project_dependencies():
    """Report that dependency automation is disabled for this deployment."""
    logger.info("Automated dependency update scanning is disabled.")
    return "Dependency automation disabled."
