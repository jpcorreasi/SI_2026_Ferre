"""
accounts/permissions.py
=======================
Custom DRF permission classes used across all apps.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdminRole(BasePermission):
    """Allow access only to users with role == ADMIN."""

    message = 'Se requiere el rol Administrador para realizar esta acción.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'ADMIN'
        )


class IsAdminOrReadOnly(BasePermission):
    """
    ADMIN: full access.
    EMPLEADO: read-only (GET, HEAD, OPTIONS).
    """

    message = 'Se requiere el rol Administrador para modificar este recurso.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == 'ADMIN'


class IsOwnerOrAdmin(BasePermission):
    """
    Object-level permission.
    ADMIN: full access to any object.
    EMPLEADO: access only to objects they created (created_by == request.user)
              or where the object IS the request.user.
    """

    message = 'Solo puede acceder a sus propios registros.'

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'ADMIN':
            return True
        if obj == request.user:
            return True
        return getattr(obj, 'created_by_id', None) == request.user.pk
