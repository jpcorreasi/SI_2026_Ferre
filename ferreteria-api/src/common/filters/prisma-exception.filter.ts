import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Traduce errores conocidos de Prisma a respuestas estilo DRF:
 *   P2025 (no existe)        -> 404 {detail: 'No encontrado.'}
 *   P2002 (unico)            -> 400 {detail: '...', fields: [...]}
 *   P2003 (FK)               -> 400 {detail: 'Referencia invalida.'}
 * El resto se delega al manejador por defecto de Nest (500).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    switch (exception.code) {
      case 'P2025':
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ detail: 'No encontrado.' });

      case 'P2002': {
        const target = (exception.meta?.target as string[]) ?? [];
        return res.status(HttpStatus.BAD_REQUEST).json({
          detail: 'Ya existe un registro con estos valores unicos.',
          fields: target,
        });
      }

      case 'P2003':
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ detail: 'Referencia invalida: el objeto relacionado no existe.' });

      default:
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          detail: 'Error interno de base de datos.',
          code: exception.code,
        });
    }
  }
}
