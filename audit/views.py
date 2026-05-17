"""
audit/views.py
==============
AuditLogViewSet — read-only, ADMIN only.
No creation, update, or deletion via API.
"""

import django_filters
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from accounts.permissions import IsAdminRole
from audit.models import AuditLog
from audit.serializers import AuditLogSerializer


class AuditLogFilter(django_filters.FilterSet):
    action = django_filters.ChoiceFilter(
        field_name='action',
        choices=AuditLog.Action.choices,
    )
    model_name = django_filters.CharFilter(field_name='model_name', lookup_expr='iexact')
    # Filter by username text (case-insensitive contains) — not numeric ID.
    username = django_filters.CharFilter(field_name='user__username', lookup_expr='icontains')
    timestamp_from = django_filters.DateTimeFilter(field_name='timestamp', lookup_expr='gte')
    timestamp_to = django_filters.DateTimeFilter(field_name='timestamp', lookup_expr='lte')

    class Meta:
        model = AuditLog
        fields = ['action', 'model_name', 'username', 'timestamp_from', 'timestamp_to']


class AuditLogViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """
    GET  /api/audit-logs/       — paginated list (filterable by action, model, username, dates)
    GET  /api/audit-logs/{id}/  — single record with full changed_fields detail
    """

    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    filterset_class = AuditLogFilter
    ordering_fields = ['timestamp']
    search_fields = ['object_repr', 'model_name', 'user__username']
