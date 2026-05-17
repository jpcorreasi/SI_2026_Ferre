from django.contrib import admin

from employees.models import Employee, Payroll, PayrollItem, WorkSchedule, WorkShift


class PayrollItemInline(admin.TabularInline):
    model = PayrollItem
    extra = 1
    fields = [
        'employee', 'base_salary', 'health_deduction',
        'pension_deduction', 'overtime', 'net_salary',
    ]


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'position', 'hire_date', 'base_salary', 'is_active']
    search_fields = ['full_name', 'document_number', 'position']
    list_filter = ['is_active', 'document_type']
    ordering = ['full_name']


@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'period_start', 'period_end', 'status', 'total_amount', 'generated_by']
    search_fields = ['generated_by__username']
    list_filter = ['status']
    readonly_fields = ['created_at', 'generated_by']
    ordering = ['-period_end']
    inlines = [PayrollItemInline]


class WorkShiftInline(admin.TabularInline):
    model = WorkShift
    extra = 1
    fields = ['day_of_week', 'start_time', 'end_time']


@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'week_start', 'employee', 'created_by', 'created_at']
    list_filter = ['week_start']
    search_fields = ['employee__full_name']
    readonly_fields = ['created_by', 'created_at', 'updated_at']
    ordering = ['-week_start', 'employee__full_name']
    inlines = [WorkShiftInline]
