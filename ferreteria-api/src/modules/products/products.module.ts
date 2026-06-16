import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService],
})
export class ProductsModule {}
