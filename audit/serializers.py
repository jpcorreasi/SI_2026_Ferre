"""
audit/serializers.py
====================
AuditLogSerializer — read-only; no creation via API.
"""

from rest_framework import serializers

from audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    # Human-readable username instead of the numeric FK.
    username = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'username', 'action', 'app_label', 'model_name',
            'object_id', 'object_repr', 'changed_fields',
            'timestamp', 'ip_address',
        ]
        read_only_fields = fields

    def get_username(self, obj):
        if not obj.user:
            return 'Sistema'
        return obj.user.username
