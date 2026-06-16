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
import { SalesService } from './sales.service';
import { CreateSaleDto, UpdateSaleDto } from './dto/sale.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/sales/ — paridad SaleViewSet:
 *   list/retrieve/create -> ambos roles (employee = usuario actual)
 *   update/PATCH/destroy -> ADMIN
 *   POST {id}/cancel/    -> ambos roles
 */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  @Get()
  list(@Req() req: Request) {
    return this.sales.list(req);
  }

  @Get(':id')
  retrieve(@Param('id', ParseIntPipe) id: number) {
    return this.sales.retrieve(id);
  }

  @Post()
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sales.create(dto, this.actor(user, req));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.sales.cancel(id);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sales.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sales.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sales.remove(id, this.actor(user, req));
  }
}
