import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { SalesModule } from './modules/sales/sales.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { FinancesModule } from './modules/finances/finances.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ServicesModule } from './modules/services/services.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogsModule } from './modules/audit/audit.module';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    // F3 — catalogos base.
    AccountsModule,
    CustomersModule,
    ProductsModule,
    SuppliersModule,
    // F4 — operacion.
    SalesModule,
    InvoicingModule,
    FinancesModule,
    EmployeesModule,
    ServicesModule,
    // F4 completo.
    ReportsModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [
    // JWT global primero, luego verificacion de rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
