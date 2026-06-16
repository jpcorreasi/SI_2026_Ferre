import { Module } from '@nestjs/common';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  controllers: [PaymentMethodsController, SalesController],
  providers: [PaymentMethodsService, SalesService],
})
export class SalesModule {}
