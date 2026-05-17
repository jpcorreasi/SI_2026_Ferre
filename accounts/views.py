"""
accounts/views.py
=================
LoginView   POST /api/token/
LogoutView  POST /api/token/logout/
UserViewSet /api/users/  (ADMIN only)
"""

from django.contrib.auth import authenticate
from django.contrib.auth.signals import user_logged_in
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import AuditSession, CustomUser
from accounts.permissions import IsAdminRole
from accounts.serializers import UserSerializer


# ---------------------------------------------------------------------------
# Authentication views
# ---------------------------------------------------------------------------

class LoginView(APIView):
    """
    JWT login with account-lockout enforcement.

    Flow
    ----
    1. Validate that both fields are present.
    2. Reject early if locked_until is in the future (HTTP 423).
    3. Call authenticate() — fires user_login_failed signal on failure.
    4. On success, fire user_logged_in (resets counter + AuditSession),
       then return JWT access + refresh tokens.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'detail': 'Se requieren nombre de usuario y contrasena.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Step 2: lockout check before any signal firing
        try:
            candidate = CustomUser.objects.get(username=username)
            if candidate.locked_until and candidate.locked_until > timezone.now():
                remaining_seconds = (candidate.locked_until - timezone.now()).total_seconds()
                remaining_minutes = max(1, int(remaining_seconds / 60) + 1)
                return Response(
                    {
                        'detail': (
                            f'Cuenta bloqueada por demasiados intentos fallidos. '
                            f'Intente de nuevo en {remaining_minutes} minuto(s).'
                        ),
                        'locked_until': candidate.locked_until,
                    },
                    status=status.HTTP_423_LOCKED,
                )
        except CustomUser.DoesNotExist:
            pass  # Unknown username — let authenticate() handle it

        # Step 3: authenticate (fires user_login_failed on bad credentials)
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {'detail': 'Credenciales invalidas.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Step 4: success — reset counter + AuditSession via signal, issue tokens
        user_logged_in.send(sender=user.__class__, request=request, user=user)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.pk,
                    'username': user.username,
                    'role': user.role,
                    'full_name': user.get_full_name(),
                },
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Records logout_at on the most recent open AuditSession for this user.
    Optionally blacklists the refresh token if provided in the body.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Close the open session record
        session = (
            AuditSession.objects
            .filter(user=request.user, logout_at__isnull=True)
            .order_by('-login_at')
            .first()
        )
        if session:
            session.logout_at = timezone.now()
            session.save(update_fields=['logout_at'])

        # Blacklist the refresh token if provided
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass  # Token already invalid or blacklist not enabled — ignore

        return Response({'detail': 'Sesion cerrada exitosamente.'}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# User management (ADMIN only)
# ---------------------------------------------------------------------------

class UserViewSet(viewsets.ModelViewSet):
    """Full CRUD on CustomUser — ADMIN role required."""

    queryset = CustomUser.objects.all().order_by('username')
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
