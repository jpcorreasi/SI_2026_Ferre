"""
accounts/tests.py
=================
Unit tests for accounts app — login lockout signal behaviour.

Coverage targets (RNF-MNT-001):
  - Failed login increments failed_login_attempts
  - Five consecutive failures lock the account (locked_until set)
  - Successful login resets the counter and clears the lock
"""

from datetime import timedelta

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import AuditSession, CustomUser


class AccountLockoutTest(TestCase):

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username='test_user',
            password='TestPass1234!',
        )

    # ------------------------------------------------------------------
    # Test 1
    # ------------------------------------------------------------------

    def test_fallo_login_incrementa_contador(self):
        """Un fallo de login debe incrementar failed_login_attempts en 1."""
        user_login_failed.send(
            sender=CustomUser,
            credentials={'username': self.user.username, 'password': 'wrong'},
            request=None,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 1)

    # ------------------------------------------------------------------
    # Test 2
    # ------------------------------------------------------------------

    def test_cinco_fallos_bloquean_cuenta(self):
        """Despues de 5 fallos consecutivos, locked_until debe quedar establecido."""
        # Pre-set to 4 so the next signal call brings the total to 5
        self.user.failed_login_attempts = 4
        self.user.save(update_fields=['failed_login_attempts'])

        user_login_failed.send(
            sender=CustomUser,
            credentials={'username': self.user.username, 'password': 'wrong'},
            request=None,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 5)
        self.assertIsNotNone(self.user.locked_until)
        self.assertGreater(self.user.locked_until, timezone.now())

    # ------------------------------------------------------------------
    # Test 3
    # ------------------------------------------------------------------

    def test_login_exitoso_resetea_contador(self):
        """Un login exitoso debe resetear failed_login_attempts a 0 y locked_until a None."""
        self.user.failed_login_attempts = 3
        self.user.locked_until = timezone.now() + timedelta(minutes=30)
        self.user.save(update_fields=['failed_login_attempts', 'locked_until'])

        # RequestFactory sets REMOTE_ADDR = '127.0.0.1' automatically
        request = RequestFactory().get('/')
        user_logged_in.send(
            sender=CustomUser,
            user=self.user,
            request=request,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 0)
        self.assertIsNone(self.user.locked_until)
        # Login success also creates an AuditSession record
        self.assertTrue(AuditSession.objects.filter(user=self.user).exists())
