from django.apps import AppConfig


class SuppliersConfig(AppConfig):
    name = 'suppliers'

    def ready(self):
        import suppliers.signals  # noqa: F401
