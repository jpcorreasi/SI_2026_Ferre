from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import LoginView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
]
