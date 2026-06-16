import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/products/ — paridad ProductViewSet:
 *   list/retrieve/create -> ambos roles (EMPLEADO no ve cost_price en lectura)
 *   update/PATCH/destroy -> ADMIN
 *   GET low-stock/       -> ambos roles
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  // IMPORTANTE: ruta estatica antes de ':id'.
  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.products.lowStock(user.role);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.products.list(req, user.role);
  }

  @Get(':id')
  retrieve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.retrieve(id, user.role);
  }

  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.create(dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.remove(id, this.actor(user, req));
  }
}
