import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from '../common/crypto/django-password';
import { JwtPayload } from './jwt.strategy';

/**
 * Replica accounts/views.py::LoginView + signals de bloqueo de cuenta.
 *   - Revisa locked_until ANTES de validar credenciales -> HTTP 423.
 *   - 5 fallos consecutivos => bloqueo por ACCOUNT_LOCKOUT_MINUTES.
 *   - Exito => resetea contadores y crea AuditSession.
 */
@Injectable()
export class AuthService {
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.maxAttempts = Number(
      config.get('MAX_FAILED_LOGIN_ATTEMPTS') ?? 5,
    );
    this.lockoutMinutes = Number(config.get('ACCOUNT_LOCKOUT_MINUTES') ?? 3);
  }

  async login(username: string, password: string, ip: string | null) {
    const user = await this.prisma.user.findUnique({ where: { username } });

    // 1) Chequeo de bloqueo ANTES de autenticar (paridad: HTTP 423).
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.floor(remainingMs / 60000) + 1);
      throw new HttpException(
        {
          detail: `Cuenta bloqueada por demasiados intentos fallidos. Intente de nuevo en ${remainingMinutes} minuto(s).`,
        },
        423, // HTTP 423 LOCKED — paridad con LoginView de Django
      );
    }

    // 2) Autenticacion.
    const ok =
      !!user && user.isActive && verifyPassword(password, user.password);
    if (!ok) {
      if (user) {
        await this.registerFailedAttempt(user);
      }
      throw new UnauthorizedException({
        detail: 'Credenciales invalidas.',
      });
    }

    // 3) Exito: reset de contadores + AuditSession.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      },
    });
    await this.prisma.auditSession.create({
      data: { userId: user.id, loginAt: new Date(), ipAddress: ip ?? '0.0.0.0' },
    });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ detail: 'Token de refresco invalido o expirado.' });
    }
    if (payload.token_type !== 'refresh') {
      throw new UnauthorizedException({ detail: 'Token de refresco invalido.' });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ detail: 'Usuario inactivo.' });
    }
    return { access: await this.signAccess(user) };
  }

  async logout(userId: number) {
    // Cierra la AuditSession abierta mas reciente (paridad LogoutView).
    const open = await this.prisma.auditSession.findFirst({
      where: { userId, logoutAt: null },
      orderBy: { loginAt: 'desc' },
    });
    if (open) {
      await this.prisma.auditSession.update({
        where: { id: open.id },
        data: { logoutAt: new Date() },
      });
    }
    return { detail: 'Sesión cerrada correctamente.' };
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const data: { failedLoginAttempts: number; lockedUntil?: Date } = {
      failedLoginAttempts: attempts,
    };
    if (attempts >= this.maxAttempts) {
      data.lockedUntil = new Date(Date.now() + this.lockoutMinutes * 60000);
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
  }

  private async issueTokens(user: User) {
    const [access, refresh] = await Promise.all([
      this.signAccess(user),
      this.signRefresh(user),
    ]);
    return {
      access,
      refresh,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: `${user.firstName} ${user.lastName}`.trim() || user.username,
      },
    };
  }

  private signAccess(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      token_type: 'access',
    };
    return this.jwt.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '5m',
    });
  }

  private signRefresh(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      token_type: 'refresh',
    };
    return this.jwt.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '24h',
    });
  }
}
