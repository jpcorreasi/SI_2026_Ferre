import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [
    TransactionsController,
    CashRegistersController,
    ExpenseCategoriesController,
    ExpensesController,
  ],
  providers: [
    TransactionsService,
    CashRegistersService,
    ExpenseCategoriesService,
    ExpensesService,
  ],
})
export class FinancesModule {}
