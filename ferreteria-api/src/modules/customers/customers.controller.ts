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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/customers/ — paridad CustomerViewSet:
 *   list/retrieve  -> ambos roles (EMPLEADO ve document_number enmascarado)
 *   create/PUT/del -> ADMIN
 *   PATCH          -> ambos (EMPLEADO solo email/phone/address)
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.customers.list(req, user.role);
  }

  @Get(':id')
  retrieve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.retrieve(id, user.role);
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.create(dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.update(id, dto, this.actor(user, req), user.role);
  }

  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.update(id, dto, this.actor(user, req), user.role);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.remove(id, this.actor(user, req));
  }
}
