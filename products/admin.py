from django.contrib import admin

from products.models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'description']
    search_fields = ['name']
    ordering = ['name']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'category', 'stock', 'min_stock', 'sale_price', 'is_active']
    search_fields = ['name', 'code']
    list_filter = ['category', 'is_active']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    ordering = ['name']
