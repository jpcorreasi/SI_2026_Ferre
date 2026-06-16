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
import { WorkSchedulesService } from './work-schedules.service';
import {
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
} from './dto/work-schedule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/work-schedules/ — paridad WorkScheduleViewSet:
 *   list/retrieve -> ambos roles (EMPLEADO ve solo su propio horario)
 *   create/PUT/PATCH/destroy/copy-to-next-week -> ADMIN
 */
@Controller('work-schedules')
export class WorkSchedulesController {
  constructor(private readonly service: WorkSchedulesService) {}

  private actor(user: AuthUser, req: Request): AuditActor {
    return { userId: user.id, ip: getClientIp(req) };
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.list(req, user);
  }

  @Get(':id')
  retrieve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.retrieve(id, user);
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Body() dto: CreateWorkScheduleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Post(':id/copy-to-next-week')
  @HttpCode(201)
  copy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.copyToNextWeek(id, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkScheduleDto,
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
