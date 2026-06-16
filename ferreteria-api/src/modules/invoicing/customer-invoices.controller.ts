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
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomerInvoicesService } from './customer-invoices.service';
import {
  CreateCustomerInvoiceDto,
  UpdateCustomerInvoiceDto,
  SendInvoiceEmailDto,
} from './dto/customer-invoice.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { getClientIp } from '../../common/utils/ip';
import { AuditActor } from '../../common/audit/audit.service';

/**
 * /api/customer-invoices/ — paridad CustomerInvoiceViewSet:
 *   list/retrieve/create/pdf/send-email -> ambos roles
 *   update/PATCH/destroy -> ADMIN
 */
@Controller('customer-invoices')
export class CustomerInvoicesController {
  constructor(private readonly service: CustomerInvoicesService) {}

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

  @Get(':id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, filename } = await this.service.buildPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Post()
  create(
    @Body() dto: CreateCustomerInvoiceDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, this.actor(user, req));
  }

  @Post(':id/send-email')
  @HttpCode(200)
  sendEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendInvoiceEmailDto,
  ) {
    return this.service.sendEmail(id, dto.recipient_email);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerInvoiceDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, this.actor(user, req));
  }

  @Roles('ADMIN')
  @Patch(':id')
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerInvoiceDto,
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
