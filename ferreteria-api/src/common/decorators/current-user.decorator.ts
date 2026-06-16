import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'EMPLEADO';
}

/** Inyecta el usuario autenticado (poblado por JwtStrategy) en el handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
