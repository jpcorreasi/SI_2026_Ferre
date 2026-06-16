import { Module } from '@nestjs/common';
import { CustomerInvoicesController } from './customer-invoices.controller';
import { CustomerInvoicesService } from './customer-invoices.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';

@Module({
  controllers: [
    CustomerInvoicesController,
    SupplierInvoicesController,
    CreditNotesController,
  ],
  providers: [
    CustomerInvoicesService,
    SupplierInvoicesService,
    CreditNotesService,
  ],
})
export class InvoicingModule {}
