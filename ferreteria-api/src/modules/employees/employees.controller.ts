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
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/** /api/employees/ — solo ADMIN (el alta crea el CustomUser vinculado). */
@Roles('ADMIN')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

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
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
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
