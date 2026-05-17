"""
services/serializers.py
=======================
ServiceTypeSerializer
ServiceSerializer
"""

from rest_framework import serializers

from services.models import Service, ServiceType


class ServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
        fields = ['id', 'name', 'description', 'default_price', 'created_at']
        read_only_fields = ['created_at']


class ServiceSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    customer_name = serializers.CharField(
        source='customer.full_name', read_only=True, default=None
    )
    performed_by_name = serializers.CharField(
        source='performed_by.get_full_name', read_only=True
    )
    registered_by_name = serializers.CharField(
        source='registered_by.username', read_only=True
    )

    class Meta:
        model = Service
        fields = [
            'id', 'service_type', 'service_type_name',
            'description', 'price',
            'customer', 'customer_name',
            'performed_by', 'performed_by_name',
            'service_date', 'notes',
            'registered_by', 'registered_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['registered_by', 'created_at', 'updated_at']

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('El precio debe ser mayor a cero.')
        return value

    def validate_service_type(self, value):
        if value is None:
            raise serializers.ValidationError('El tipo de servicio es obligatorio.')
        return value
