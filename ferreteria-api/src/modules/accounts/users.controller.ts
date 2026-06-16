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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/** /api/users/ — CRUD de usuarios. Solo ADMIN (paridad UserViewSet). */
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  @Get()
  list(@Req() req: Request) {
    return this.users.list(req);
  }

  @Get(':id')
  retrieve(@Param('id', ParseIntPipe) id: number) {
    return this.users.retrieve(id);
  }

  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.create(dto, this.actor(user, req));
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, this.actor(user, req), false);
  }

  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, this.actor(user, req), true);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.remove(id, this.actor(user, req));
  }
}
