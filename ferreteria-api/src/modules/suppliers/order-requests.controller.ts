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
import { OrderRequestsService } from './order-requests.service';
import {
  CreateOrderRequestDto,
  UpdateOrderRequestDto,
} from './dto/order-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/order-requests/ — paridad OrderRequestViewSet:
 *   list/retrieve/create -> ambos roles
 *   update/PATCH/destroy  -> ADMIN
 *   POST {id}/mark-reviewed/ -> ADMIN
 */
@Controller('order-requests')
export class OrderRequestsController {
  constructor(private readonly service: OrderRequestsService) {}

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
    @Body() dto: CreateOrderRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Post(':id/mark-reviewed')
  @HttpCode(200)
  markReviewed(@Param('id', ParseIntPipe) id: number) {
    return this.service.markReviewed(id);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
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
