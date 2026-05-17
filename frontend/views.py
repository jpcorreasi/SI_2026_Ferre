from django.views.generic import TemplateView


class FrontendView(TemplateView):
    template_name = 'frontend/index.html'


class MobileFrontendView(TemplateView):
    template_name = 'frontend/mobile.html'
