from datetime import timedelta

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.dispatch import receiver
from django.utils import timezone

from accounts.models import AuditSession, CustomUser


def _get_client_ip(request):
    """Return the real client IP, respecting X-Forwarded-For if present."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


@receiver(user_login_failed)
def on_login_failed(sender, credentials, request, **kwargs):
    """
    Increment failed_login_attempts on every failed login.
    Lock the account for 3 minutes after 5 consecutive failures.
    """
    try:
        user = CustomUser.objects.get(username=credentials.get('username', ''))
    except CustomUser.DoesNotExist:
        # Unknown username — do nothing to avoid user-enumeration attacks.
        return

    user.failed_login_attempts += 1
    if user.failed_login_attempts >= 5:
        user.locked_until = timezone.now() + timedelta(minutes=3)
    user.save(update_fields=['failed_login_attempts', 'locked_until'])


@receiver(user_logged_in)
def on_login_success(sender, user, request, **kwargs):
    """
    Reset failure counters on successful login and record the session.
    """
    user.failed_login_attempts = 0
    user.locked_until = None
    user.save(update_fields=['failed_login_attempts', 'locked_until'])

    AuditSession.objects.create(
        user=user,
        login_at=timezone.now(),
        ip_address=_get_client_ip(request),
    )
