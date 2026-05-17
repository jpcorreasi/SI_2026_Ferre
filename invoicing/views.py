"""
invoicing/views.py
==================
CustomerInvoiceViewSet:
  create -> both roles (generated_by auto-set)
  update/destroy -> ADMIN only
  Extra action: GET  /api/customer-invoices/{id}/pdf/
  Extra action: POST /api/customer-invoices/{id}/send-email/

SupplierInvoiceViewSet -> ADMIN only
"""

from io import BytesIO

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from audit.mixins import AuditLogMixin
import django_filters
from invoicing.models import CreditNote, CustomerInvoice, SupplierInvoice
from invoicing.serializers import (
    CreditNoteReadSerializer,
    CreditNoteSerializer,
    CustomerInvoiceSerializer,
    SupplierInvoiceSerializer,
    SupplierInvoiceUpdateSerializer,
    SupplierInvoiceWriteSerializer,
)


def _build_invoice_pdf(invoice):
    """Return a BytesIO buffer containing the PDF for the given CustomerInvoice."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    elements = []

    # --- Header ---
    elements.append(Paragraph('FERRETERIA', styles['Title']))
    elements.append(Paragraph(f'Factura No: {invoice.invoice_number}', styles['Heading2']))
    elements.append(Spacer(1, 0.4 * cm))

    # --- Invoice metadata ---
    elements.append(
        Paragraph(f'Fecha: {invoice.issued_at.strftime("%Y-%m-%d %H:%M")}', styles['Normal'])
    )
    elements.append(
        Paragraph(f'Cliente: {invoice.customer or "Anonimo"}', styles['Normal'])
    )
    elements.append(
        Paragraph(f'Estado: {invoice.get_status_display()}', styles['Normal'])
    )
    elements.append(Spacer(1, 0.6 * cm))

    # --- Items table ---
    col_widths = [8 * cm, 2.5 * cm, 3.5 * cm, 3.5 * cm]
    table_data = [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']]

    sale = invoice.sale
    for item in sale.items.select_related('product').all():
        table_data.append([
            item.product.name,
            str(item.quantity),
            f'${item.unit_price:,.2f}',
            f'${item.subtotal:,.2f}',
        ])

    # Totals rows — gross subtotal (sum of items = sale.total)
    gross_total = invoice.sale.total
    table_data.append(['', '', 'Subtotal:', f'${gross_total:,.2f}'])
    if invoice.discount:
        table_data.append(['', '', 'Descuento:', f'-${invoice.discount:,.2f}'])
        base_gravable = gross_total - invoice.discount
        table_data.append(['', '', 'Base gravable:', f'${base_gravable:,.2f}'])
    if invoice.tax:
        table_data.append(['', '', 'IVA:', f'${invoice.tax:,.2f}'])
    table_data.append(['', '', 'TOTAL:', f'${invoice.total:,.2f}'])

    # n_items = data rows only (exclude header + all totals rows)
    # Discount adds two rows (descuento + base gravable); tax adds one
    n_totals = 2 + (2 if invoice.discount else 0) + (1 if invoice.tax else 0)
    n_items = len(table_data) - n_totals

    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4a4a4a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        # Data rows
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, n_items), [colors.white, colors.HexColor('#f5f5f5')]),
        # Grid only for data rows
        ('GRID', (0, 0), (-1, n_items), 0.5, colors.HexColor('#cccccc')),
        # Alignment
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        # Totals rows styling
        ('FONTNAME', (2, n_items + 1), (2, -1), 'Helvetica-Bold'),
        ('FONTNAME', (3, -1), (3, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (2, -1), (-1, -1), 10),
        ('TOPPADDING', (0, n_items + 1), (-1, -1), 4),
        # Highlight TOTAL row
        ('FONTSIZE', (2, -1), (-1, -1), 11),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.6 * cm))

    # --- Notes (admin field) ---
    if invoice.notes:
        elements.append(Paragraph('Notas:', styles['Heading4']))
        elements.append(Paragraph(invoice.notes, styles['Normal']))
        elements.append(Spacer(1, 0.6 * cm))

    # --- Footer ---
    generated_by = invoice.generated_by
    name = generated_by.get_full_name() or generated_by.username
    elements.append(Paragraph(f'Generado por: {name}', styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer


class CustomerInvoiceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = CustomerInvoice.objects.select_related('sale', 'customer').order_by('-issued_at')
    serializer_class = CustomerInvoiceSerializer
    search_fields = ['invoice_number', 'customer__full_name']
    ordering_fields = ['issued_at', 'total']

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        # Inject generated_by into validated_data so AuditLogMixin.perform_create
        # can call serializer.save() without losing this field.
        serializer.validated_data['generated_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        GET /api/customer-invoices/{id}/pdf/
        Returns the invoice as a PDF file (application/pdf).
        """
        invoice = self.get_object()
        buffer = _build_invoice_pdf(invoice)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="factura-{invoice.invoice_number}.pdf"'
        )
        return response

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """
        POST /api/customer-invoices/{id}/send-email/
        Body: {"recipient_email": "cliente@ejemplo.com"}

        Validates the address, stores it in email_sent_to, marks sent_by_email=True.
        Actual delivery is handled by an external email-sending API (not yet wired).
        """
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError

        invoice = self.get_object()
        if invoice.sent_by_email:
            return Response(
                {'detail': 'La factura ya fue enviada por correo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient_email = request.data.get('recipient_email', '').strip()
        if not recipient_email:
            return Response(
                {'detail': 'Se requiere el campo recipient_email.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_email(recipient_email)
        except DjangoValidationError:
            return Response(
                {'detail': 'El correo electrónico no tiene un formato válido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice.sent_by_email = True
        invoice.email_sent_to = recipient_email
        invoice.save(update_fields=['sent_by_email', 'email_sent_to'])

        # TODO: dispatch to email-sending API (e.g. SendGrid, SES, Resend)
        # email_service.send_invoice(invoice=invoice, recipient=recipient_email)

        return Response(CustomerInvoiceSerializer(invoice, context={'request': request}).data)


class SupplierInvoiceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = (
        SupplierInvoice.objects
        .select_related('supplier', 'registered_by')
        .prefetch_related('items__product')
        .order_by('-received_at')
    )
    permission_classes = [IsAdminRole]
    search_fields = ['supplier_invoice_number', 'supplier__business_name']
    ordering_fields = ['received_at', 'total', 'payment_status']
    filterset_fields = ['payment_status', 'supplier']

    def get_serializer_class(self):
        if self.action == 'create':
            return SupplierInvoiceWriteSerializer
        if self.action in ('update', 'partial_update'):
            return SupplierInvoiceUpdateSerializer
        return SupplierInvoiceSerializer

    def perform_create(self, serializer):
        serializer.validated_data['registered_by'] = self.request.user
        super().perform_create(serializer)


# ---------------------------------------------------------------------------
# Credit Note (HU-005)
# ---------------------------------------------------------------------------

def _build_credit_note_pdf(note):
    """Return a BytesIO buffer with the PDF for the given CreditNote."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    elements = []

    # --- Header ---
    elements.append(Paragraph('FERRETERIA', styles['Title']))
    elements.append(Paragraph('NOTA CRÉDITO', styles['Heading1']))
    elements.append(Paragraph(f'No: {note.credit_note_number}', styles['Heading2']))
    elements.append(Spacer(1, 0.4 * cm))

    # --- Metadata ---
    elements.append(Paragraph(f'Fecha: {note.issued_at.strftime("%Y-%m-%d %H:%M")}', styles['Normal']))
    sale = note.sale
    customer_label = str(sale.customer) if sale.customer else 'Anónimo'
    elements.append(Paragraph(f'Cliente: {customer_label}', styles['Normal']))
    elements.append(Paragraph(f'Venta referenciada: #{sale.pk}', styles['Normal']))
    if note.invoice:
        elements.append(Paragraph(f'Factura referenciada: {note.invoice.invoice_number}', styles['Normal']))
    elements.append(Paragraph(f'Motivo: {note.reason}', styles['Normal']))
    elements.append(Spacer(1, 0.6 * cm))

    # --- Items table ---
    col_widths = [8 * cm, 2.5 * cm, 3.5 * cm, 3.5 * cm]
    table_data = [['Producto', 'Cant. devuelta', 'Precio Unit.', 'Subtotal']]

    for item in note.items.select_related('product').all():
        table_data.append([
            item.product.name,
            str(item.quantity_returned),
            f'${item.unit_price:,.2f}',
            f'${item.subtotal:,.2f}',
        ])

    table_data.append(['', '', 'TOTAL REEMBOLSO:', f'${note.total_refund:,.2f}'])
    n_items = len(table_data) - 1

    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4a4a4a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, n_items - 1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('GRID', (0, 0), (-1, n_items - 1), 0.5, colors.HexColor('#cccccc')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('FONTNAME', (2, n_items), (3, n_items), 'Helvetica-Bold'),
        ('FONTSIZE', (2, n_items), (-1, n_items), 10),
        ('TOPPADDING', (0, n_items), (-1, n_items), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 1 * cm))

    # --- Footer ---
    generated_by = note.generated_by
    name = generated_by.get_full_name() or generated_by.username
    elements.append(Paragraph(f'Generado por: {name}', styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer


class CreditNoteFilter(django_filters.FilterSet):
    sale = django_filters.NumberFilter(field_name='sale__id')
    status = django_filters.ChoiceFilter(field_name='status', choices=CreditNote.Status.choices)

    class Meta:
        model = CreditNote
        fields = ['sale', 'status']


class CreditNoteViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    GET    /api/credit-notes/          — list (filterable by sale, status)
    POST   /api/credit-notes/          — create (ADMIN only)
    GET    /api/credit-notes/{id}/     — retrieve
    GET    /api/credit-notes/{id}/pdf/ — download PDF
    """

    queryset = (
        CreditNote.objects
        .select_related('sale__customer', 'invoice', 'generated_by')
        .prefetch_related('items__product', 'items__sale_item')
        .order_by('-issued_at')
    )
    filterset_class = CreditNoteFilter
    search_fields = ['credit_note_number', 'sale__customer__full_name']
    ordering_fields = ['issued_at', 'total_refund']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return CreditNoteSerializer
        return CreditNoteReadSerializer

    def perform_create(self, serializer):
        serializer.validated_data['generated_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """GET /api/credit-notes/{id}/pdf/ — returns the credit note as PDF."""
        note = self.get_object()
        buffer = _build_credit_note_pdf(note)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="nota-credito-{note.credit_note_number}.pdf"'
        )
        return response
