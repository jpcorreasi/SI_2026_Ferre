import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, LogoutDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { getClientIp } from '../common/utils/ip';

/**
 * Rutas de autenticacion. Paths identicos a config/urls.py:
 *   POST /api/token/          (login)
 *   POST /api/token/refresh/  (refresh)
 *   POST /api/token/logout/   (logout)
 */
@Controller('token')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post()
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.username, dto.password, getClientIp(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: AuthUser, @Body() _dto: LogoutDto) {
    return this.auth.logout(user.id);
  }
}
