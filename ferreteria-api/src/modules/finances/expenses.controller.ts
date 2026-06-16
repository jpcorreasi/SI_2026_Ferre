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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/** /api/expenses/ — solo ADMIN; el alta sincroniza un Transaction(EXPENSE). */
@Roles('ADMIN')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

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
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
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
