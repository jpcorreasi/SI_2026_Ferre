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
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/** /api/purchase-orders/ — solo ADMIN (paridad PurchaseOrderViewSet). */
@Roles('ADMIN')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  @Get()
  list(@Req() req: Request) {
    return this.service.list(req);
  }

  @Get(':id')
  retrieve(@Param('id', ParseIntPipe) id: number) {
    return this.service.retrieve(id);
  }

  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Post(':id/receive')
  @HttpCode(200)
  receive(@Param('id', ParseIntPipe) id: number) {
    return this.service.receive(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.remove(id, this.actor(user, req));
  }
}
