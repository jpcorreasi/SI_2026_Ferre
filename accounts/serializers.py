"""
accounts/serializers.py
=======================
"""

from rest_framework import serializers

from accounts.models import AuditSession, CustomUser


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})


class UserSerializer(serializers.ModelSerializer):
    """
    Full user representation for ADMIN CRUD.
    password is write-only — never returned in responses.
    """

    password = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'},
    )

    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'role', 'is_active', 'password']
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = CustomUser(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AuditSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditSession
        fields = ['id', 'user', 'login_at', 'logout_at', 'ip_address']
        read_only_fields = ['id', 'user', 'login_at', 'logout_at', 'ip_address']
