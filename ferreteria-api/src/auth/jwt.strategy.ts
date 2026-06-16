import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: number;
  username: string;
  role: 'ADMIN' | 'EMPLEADO';
  token_type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    // Solo tokens de acceso valen para autenticar rutas protegidas.
    if (payload.token_type !== 'access') {
      throw new UnauthorizedException('Token invalido.');
    }
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
