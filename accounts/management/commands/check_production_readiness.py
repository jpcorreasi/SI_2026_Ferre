"""
accounts/management/commands/check_production_readiness.py
===========================================================
Validates that all production-critical settings are properly configured.
Exits with code 1 if any check fails.

Usage:
    python manage.py check_production_readiness
"""

import sys

from django.conf import settings
from django.core.management.base import BaseCommand

INSECURE_KEY_PREFIX = 'django-insecure-'


class Command(BaseCommand):
    help = 'Verify production settings are properly configured.'

    def handle(self, *args, **options):
        checks = [
            self._check_debug_off,
            self._check_secret_key,
            self._check_postgresql,
            self._check_cors,
            self._check_encryption_key,
            self._check_allowed_hosts,
        ]

        passed = 0
        failed = 0

        self.stdout.write('\nProduction readiness checks\n' + '-' * 40)

        for check in checks:
            ok, label, detail = check()
            if ok:
                self.stdout.write(self.style.SUCCESS(f'[OK]   {label}'))
                passed += 1
            else:
                self.stdout.write(self.style.ERROR(f'[FAIL] {label}'))
                if detail:
                    self.stdout.write(f'       > {detail}')
                failed += 1

        self.stdout.write('-' * 40)
        self.stdout.write(f'Results: {passed} passed, {failed} failed\n')

        if failed:
            sys.exit(1)

    # ------------------------------------------------------------------
    # Individual checks
    # ------------------------------------------------------------------

    def _check_debug_off(self):
        label = 'DEBUG is False'
        if settings.DEBUG:
            return False, label, 'Set DEBUG=False in .env before deploying to production.'
        return True, label, None

    def _check_secret_key(self):
        label = 'SECRET_KEY is not the insecure default'
        key = getattr(settings, 'SECRET_KEY', '')
        if not key or key.startswith(INSECURE_KEY_PREFIX):
            return False, label, 'Generate a new key and set SECRET_KEY in .env.'
        if len(key) < 40:
            return False, label, 'SECRET_KEY is too short — use at least 50 random characters.'
        return True, label, None

    def _check_postgresql(self):
        label = 'Database is PostgreSQL (not SQLite)'
        engine = settings.DATABASES.get('default', {}).get('ENGINE', '')
        if 'sqlite' in engine:
            return (
                False,
                label,
                'Set DATABASE_URL=postgres://user:password@host:5432/ferreteria_db in .env.',
            )
        return True, label, None

    def _check_cors(self):
        label = 'CORS_ALLOW_ALL_ORIGINS is False'
        if getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False):
            return (
                False,
                label,
                'Set CORS_ALLOW_ALL_ORIGINS=False and configure CORS_ALLOWED_ORIGINS.',
            )
        return True, label, None

    def _check_encryption_key(self):
        label = 'FIELD_ENCRYPTION_KEY is set and non-empty'
        key = getattr(settings, 'FIELD_ENCRYPTION_KEY', '')
        if not key:
            return (
                False,
                label,
                'Generate a Fernet key and set FIELD_ENCRYPTION_KEY in .env.',
            )
        # A valid Fernet key is 44 URL-safe base64 characters ending with '='
        if len(key) < 44:
            return False, label, 'FIELD_ENCRYPTION_KEY appears too short for a valid Fernet key.'
        return True, label, None

    def _check_allowed_hosts(self):
        label = 'ALLOWED_HOSTS is non-empty'
        hosts = getattr(settings, 'ALLOWED_HOSTS', [])
        if not hosts:
            return False, label, 'Add your domain(s) to ALLOWED_HOSTS in .env.'
        if hosts == ['*']:
            return False, label, "ALLOWED_HOSTS=['*'] is insecure — specify exact domain names."
        return True, label, None
