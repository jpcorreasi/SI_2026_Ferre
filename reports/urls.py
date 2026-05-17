from django.urls import path

from reports.views import (
    FinancialBalanceView,
    LowStockReportView,
    SalesByPaymentExportCSVView,
    SalesByPaymentExportPDFView,
    SalesByPaymentView,
    SalesSummaryView,
    TopProductsView,
)

urlpatterns = [
    path('sales-summary/',              SalesSummaryView.as_view(),             name='report-sales-summary'),
    path('top-products/',               TopProductsView.as_view(),              name='report-top-products'),
    path('low-stock/',                  LowStockReportView.as_view(),           name='report-low-stock'),
    path('financial-balance/',          FinancialBalanceView.as_view(),         name='report-financial-balance'),
    path('sales-by-payment/',           SalesByPaymentView.as_view(),           name='report-sales-by-payment'),
    path('sales-by-payment/export-csv/', SalesByPaymentExportCSVView.as_view(), name='report-sales-by-payment-csv'),
    path('sales-by-payment/export-pdf/', SalesByPaymentExportPDFView.as_view(), name='report-sales-by-payment-pdf'),
]
