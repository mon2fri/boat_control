from django.apps import AppConfig


class FilesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.files"
    verbose_name = "CSV File Management"

    def ready(self) -> None:
        # Sweep orphan upload files (files on disk that no longer back any
        # active session or saved run). Imported lazily so the call doesn't
        # trigger import-time side effects during settings load.
        from apps.files.services import reconcile_uploads

        try:
            reconcile_uploads()
        except Exception:  # pragma: no cover - defensive
            import logging

            logging.getLogger(__name__).exception(
                "Startup upload reconciliation failed"
            )
