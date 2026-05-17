"""
config/urls.py
==============
Main URL configuration.

Auth endpoints:
  POST  /api/token/          Login — returns JWT access + refresh
  POST  /api/token/refresh/  Refresh access token
  POST  /api/token/logout/   Record logout, optionally blacklist refresh

Router endpoints  (/api/<resource>/):
  users, customers, categories, products, suppliers, purchase-orders,
  payment-methods, sales, customer-invoices, supplier-invoices,
  employees, payrolls, transactions, cash-registers, audit-logs

Report endpoints (/api/reports/):
  sales-summary, top-products, low-stock, financial-balance
"""

from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from frontend.views import FrontendView, MobileFrontendView

from accounts.views import LoginView, LogoutView, UserViewSet
from audit.views import AuditLogViewSet
from customers.views import CustomerViewSet
from employees.views import EmployeeViewSet, PayrollViewSet, WorkScheduleViewSet
from finances.views import CashRegisterViewSet, ExpenseCategoryViewSet, ExpenseViewSet, TransactionViewSet
from services.views import ServiceTypeViewSet, ServiceViewSet
from invoicing.views import CreditNoteViewSet, CustomerInvoiceViewSet, SupplierInvoiceViewSet
from products.views import CategoryViewSet, ProductViewSet
from sales.views import PaymentMethodViewSet, SaleViewSet
from suppliers.views import OrderRequestViewSet, PurchaseOrderViewSet, SupplierViewSet

router = DefaultRouter()
router.register('users',              UserViewSet,             basename='user')
router.register('customers',          CustomerViewSet,         basename='customer')
router.register('categories',         CategoryViewSet,         basename='category')
router.register('products',           ProductViewSet,          basename='product')
router.register('suppliers',          SupplierViewSet,         basename='supplier')
router.register('purchase-orders',    PurchaseOrderViewSet,    basename='purchase-order')
router.register('order-requests',     OrderRequestViewSet,     basename='order-request')
router.register('payment-methods',    PaymentMethodViewSet,    basename='payment-method')
router.register('sales',              SaleViewSet,             basename='sale')
router.register('customer-invoices',  CustomerInvoiceViewSet,  basename='customer-invoice')
router.register('supplier-invoices',  SupplierInvoiceViewSet,  basename='supplier-invoice')
router.register('credit-notes',       CreditNoteViewSet,       basename='credit-note')
router.register('employees',          EmployeeViewSet,         basename='employee')
router.register('payrolls',           PayrollViewSet,          basename='payroll')
router.register('work-schedules',     WorkScheduleViewSet,     basename='work-schedule')
router.register('transactions',       TransactionViewSet,      basename='transaction')
router.register('cash-registers',     CashRegisterViewSet,     basename='cash-register')
router.register('expense-categories', ExpenseCategoryViewSet,  basename='expense-category')
router.register('expenses',           ExpenseViewSet,          basename='expense')
router.register('service-types',      ServiceTypeViewSet,      basename='service-type')
router.register('services',           ServiceViewSet,          basename='service')
router.register('audit-logs',         AuditLogViewSet,         basename='audit-log')

urlpatterns = [
    path('',                        FrontendView.as_view(),         name='frontend'),
    path('m/',                      MobileFrontendView.as_view(),   name='mobile-frontend'),
    path('admin/',                  admin.site.urls),
    path('api/token/',              LoginView.as_view(),        name='api-login'),
    path('api/token/refresh/',      TokenRefreshView.as_view(), name='api-token-refresh'),
    path('api/token/logout/',       LogoutView.as_view(),       name='api-logout'),
    path('api/',                    include(router.urls)),
    path('api/reports/',            include('reports.urls')),
]
