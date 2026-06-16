import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { OrderRequestsController } from './order-requests.controller';
import { OrderRequestsService } from './order-requests.service';

@Module({
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    OrderRequestsController,
  ],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    OrderRequestsService,
  ],
})
export class SuppliersModule {}
