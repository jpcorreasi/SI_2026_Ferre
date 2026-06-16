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
import { CashRegistersService } from './cash-registers.service';
import {
  CreateCashRegisterDto,
  UpdateCashRegisterDto,
} from './dto/cash-register.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/cash-registers/ — paridad CashRegisterViewSet:
 *   list/retrieve/create/close/balance -> ambos roles
 *   update/PATCH/destroy/withdraw      -> ADMIN
 */
@Controller('cash-registers')
export class CashRegistersController {
  constructor(private readonly service: CashRegistersService) {}

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

  @Get(':id/balance')
  balance(@Param('id', ParseIntPipe) id: number) {
    return this.service.balance(id);
  }

  @Post()
  create(
    @Body() dto: CreateCashRegisterDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.close(id, body, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Post(':id/withdraw')
  @HttpCode(201)
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.withdraw(id, body, user, getClientIp(req));
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashRegisterDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashRegisterDto,
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
