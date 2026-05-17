"""
reports/views.py
================
Aggregate report views — no models, queries other apps' models.

GET /api/reports/sales-summary/?start=YYYY-MM-DD&end=YYYY-MM-DD
GET /api/reports/top-products/?limit=10
GET /api/reports/low-stock/
GET /api/reports/financial-balance/?month=MM&year=YYYY
GET /api/reports/sales-by-payment/?start=YYYY-MM-DD&end=YYYY-MM-DD&period=today|week|month
GET /api/reports/sales-by-payment/export-pdf/?...
GET /api/reports/sales-by-payment/export-csv/?...
"""

import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, F, Q, Sum
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole


def _resolve_period(params):
    """
    Return (start_date, end_date) from query params.

    Priority:
      1. period=today  → single day
      2. period=week   → Mon–Sun of the current ISO week
      3. period=month  → 1st to last day of current month
      4. start + end   → explicit range (strings, passed through as-is)
      5. Defaults to current month if nothing supplied.
    """
    period = params.get('period', '')
    today = date.today()

    if period == 'today':
        return str(today), str(today)
    if period == 'week':
        monday = today - timedelta(days=today.weekday())
        sunday = monday + timedelta(days=6)
        return str(monday), str(sunday)
    if period == 'month':
        first = today.replace(day=1)
        # last day: go to next month then subtract one day
        if today.month == 12:
            last = today.replace(month=12, day=31)
        else:
            last = (today.replace(month=today.month + 1, day=1) - timedelta(days=1))
        return str(first), str(last)

    start = params.get('start') or str(today.replace(day=1))
    end   = params.get('end')   or str(today)
    return start, end


def _sales_by_payment_data(start, end):
    """
    Return a dict with the aggregated rows and totals.
    Always queries COMPLETED sales only.
    """
    from sales.models import Sale

    qs = Sale.objects.filter(status=Sale.Status.COMPLETED)
    if start:
        qs = qs.filter(sale_date__date__gte=start)
    if end:
        qs = qs.filter(sale_date__date__lte=end)

    rows = (
        qs
        .values('payment_method__id', 'payment_method__name')
        .annotate(sale_count=Count('id'), total=Sum('total'))
        .order_by('-total')
    )

    grand_total   = sum((r['total'] or Decimal('0')) for r in rows)
    total_sales   = sum(r['sale_count'] for r in rows)

    result_rows = []
    for r in rows:
        row_total = r['total'] or Decimal('0')
        pct = round(float(row_total / grand_total * 100), 2) if grand_total else 0.0
        result_rows.append({
            'payment_method_id':   r['payment_method__id'],
            'payment_method_name': r['payment_method__name'] or '—',
            'sale_count':          r['sale_count'],
            'total':               row_total,
            'percentage':          pct,
        })

    return {
        'period':      {'start': start, 'end': end},
        'grand_total': grand_total,
        'total_sales': total_sales,
        'rows':        result_rows,
    }


class SalesSummaryView(APIView):
    """
    GET /api/reports/sales-summary/
    Query params: start (YYYY-MM-DD), end (YYYY-MM-DD)
    Returns total revenue, number of completed sales, and average ticket.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales.models import Sale

        qs = Sale.objects.filter(status=Sale.Status.COMPLETED)
        start = request.query_params.get('start')
        end = request.query_params.get('end')
        if start:
            qs = qs.filter(sale_date__date__gte=start)
        if end:
            qs = qs.filter(sale_date__date__lte=end)

        result = qs.aggregate(
            revenue=Sum('total'),
            count=Count('id'),
            average_ticket=Avg('total'),
        )
        return Response({
            'total_revenue': result['revenue'] or Decimal('0'),
            'sale_count': result['count'],
            'average_ticket': result['average_ticket'] or Decimal('0'),
            'filters': {'start': start, 'end': end},
        })


class TopProductsView(APIView):
    """
    GET /api/reports/top-products/?limit=10
    Returns products ordered by total quantity sold (descending).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales.models import SaleItem

        try:
            limit = max(1, int(request.query_params.get('limit', 10)))
        except (ValueError, TypeError):
            limit = 10

        qs = (
            SaleItem.objects
            .values('product__id', 'product__code', 'product__name')
            .annotate(total_quantity=Sum('quantity'), total_revenue=Sum('subtotal'))
            .order_by('-total_quantity')[:limit]
        )
        return Response(list(qs))


class LowStockReportView(APIView):
    """
    GET /api/reports/low-stock/
    Products where stock <= min_stock, with supplier info.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from products.models import Product

        products = (
            Product.objects
            .filter(stock__lte=F('min_stock'))
            .select_related('supplier', 'category')
            .order_by('stock')
        )
        data = [
            {
                'id': p.pk,
                'code': p.code,
                'name': p.name,
                'stock': p.stock,
                'min_stock': p.min_stock,
                'category': p.category.name if p.category else None,
                'supplier': str(p.supplier) if p.supplier else None,
            }
            for p in products
        ]
        return Response(data)


class FinancialBalanceView(APIView):
    """
    GET /api/reports/financial-balance/?month=MM&year=YYYY
    Returns total income, total expense, and net balance for the period.
    ADMIN only.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        from finances.models import Transaction

        month = request.query_params.get('month')
        year = request.query_params.get('year')

        qs = Transaction.objects.all()
        if month and year:
            qs = qs.filter(transaction_date__month=month, transaction_date__year=year)
        elif year:
            qs = qs.filter(transaction_date__year=year)

        result = qs.aggregate(
            income=Sum('amount', filter=Q(type=Transaction.Type.INCOME)),
            expense=Sum('amount', filter=Q(type=Transaction.Type.EXPENSE)),
        )
        income = result['income'] or Decimal('0')
        expense = result['expense'] or Decimal('0')
        return Response({
            'income': income,
            'expense': expense,
            'balance': income - expense,
            'filters': {'month': month, 'year': year},
        })


class SalesByPaymentView(APIView):
    """
    GET /api/reports/sales-by-payment/
    Query params:
      period = today | week | month   (shortcut presets)
      start  = YYYY-MM-DD             (explicit range — used when period is absent)
      end    = YYYY-MM-DD
    Returns totals and percentages per payment method.  Admin only.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        start, end = _resolve_period(request.query_params)
        data = _sales_by_payment_data(start, end)
        return Response(data)


class SalesByPaymentExportCSVView(APIView):
    """
    GET /api/reports/sales-by-payment/export-csv/
    Same query params as SalesByPaymentView.
    Returns a UTF-8 BOM CSV so Excel opens it correctly.
    Admin only.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        start, end = _resolve_period(request.query_params)
        data = _sales_by_payment_data(start, end)

        buf = io.StringIO()
        writer = csv.writer(buf)

        # Header block
        writer.writerow(['Reporte: Ventas por modalidad de pago'])
        writer.writerow([f'Período: {start} — {end}'])
        writer.writerow([])
        writer.writerow(['Modalidad de pago', 'Núm. ventas', 'Total (COP)', 'Porcentaje (%)'])

        for row in data['rows']:
            writer.writerow([
                row['payment_method_name'],
                row['sale_count'],
                str(row['total']),
                f"{row['percentage']:.2f}",
            ])

        writer.writerow([])
        writer.writerow(['TOTAL', data['total_sales'], str(data['grand_total']), '100.00'])

        content = '\ufeff' + buf.getvalue()   # UTF-8 BOM for Excel compatibility
        filename = f'ventas_por_pago_{start}_{end}.csv'
        response = HttpResponse(content, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class SalesByPaymentExportPDFView(APIView):
    """
    GET /api/reports/sales-by-payment/export-pdf/
    Same query params as SalesByPaymentView.
    Returns a PDF report using ReportLab.  Admin only.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        start, end = _resolve_period(request.query_params)
        data = _sales_by_payment_data(start, end)

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph('Ventas por Modalidad de Pago', styles['Title']))
        story.append(Paragraph(f'Período: {start} — {end}', styles['Normal']))
        story.append(Spacer(1, 0.5 * cm))

        if not data['rows']:
            story.append(Paragraph(
                'No hay ventas registradas para el período seleccionado.',
                styles['Normal'],
            ))
        else:
            # Summary totals
            story.append(Paragraph(
                f"Total general: <b>${float(data['grand_total']):,.0f}</b>  |  "
                f"Ventas completadas: <b>{data['total_sales']}</b>",
                styles['Normal'],
            ))
            story.append(Spacer(1, 0.4 * cm))

            # Table
            col_headers = ['Modalidad de pago', 'N° ventas', 'Total (COP)', '%']
            table_data = [col_headers]
            for row in data['rows']:
                table_data.append([
                    row['payment_method_name'],
                    str(row['sale_count']),
                    f"${float(row['total']):,.0f}",
                    f"{row['percentage']:.2f}%",
                ])
            table_data.append([
                'TOTAL',
                str(data['total_sales']),
                f"${float(data['grand_total']):,.0f}",
                '100.00%',
            ])

            tbl = Table(table_data, colWidths=[6 * cm, 3 * cm, 5 * cm, 3 * cm])
            tbl.setStyle(TableStyle([
                ('BACKGROUND',   (0, 0), (-1, 0),  colors.HexColor('#1e40af')),
                ('TEXTCOLOR',    (0, 0), (-1, 0),  colors.white),
                ('FONTNAME',     (0, 0), (-1, 0),  'Helvetica-Bold'),
                ('FONTSIZE',     (0, 0), (-1, 0),  10),
                ('ALIGN',        (1, 0), (-1, -1), 'RIGHT'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2),
                 [colors.white, colors.HexColor('#f1f5f9')]),
                ('BACKGROUND',   (0, -1), (-1, -1), colors.HexColor('#e2e8f0')),
                ('FONTNAME',     (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('GRID',         (0, 0), (-1, -1),  0.5, colors.HexColor('#cbd5e1')),
                ('TOPPADDING',   (0, 0), (-1, -1),  5),
                ('BOTTOMPADDING',(0, 0), (-1, -1),  5),
                ('LEFTPADDING',  (0, 0), (-1, -1),  8),
                ('RIGHTPADDING', (0, 0), (-1, -1),  8),
            ]))
            story.append(tbl)

        doc.build(story)
        buf.seek(0)
        filename = f'ventas_por_pago_{start}_{end}.pdf'
        response = HttpResponse(buf.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
