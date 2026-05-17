from django.urls import path

from frontend.views import FrontendView

urlpatterns = [
    path('', FrontendView.as_view(), name='frontend'),
]
