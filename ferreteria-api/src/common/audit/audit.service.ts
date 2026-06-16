import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditActor {
  userId: number | null;
  ip: string | null;
}

interface RecordArgs {
  actor: AuditActor;
  action: AuditAction;
  appLabel: string;
  modelName: string;
  objectId: number | string;
  objectRepr: string;
  changedFields?: Record<string, { old: unknown; new: unknown }> | null;
}

/**
 * Equivalente a audit.mixins.AuditLogMixin. Los services lo invocan tras crear,
 * actualizar o eliminar. Nunca lanza: un fallo de auditoria no debe romper la
 * respuesta de la API (mismo contrato que el mixin original).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(args: RecordArgs): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: args.actor.userId ?? undefined,
          action: args.action,
          appLabel: args.appLabel,
          modelName: args.modelName,
          objectId: String(args.objectId),
          objectRepr: args.objectRepr.slice(0, 200),
          changedFields:
            args.changedFields && Object.keys(args.changedFields).length > 0
              ? (args.changedFields as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          ipAddress: args.actor.ip ?? undefined,
        },
      });
    } catch (err) {
      // Swallow — igual que el mixin de Django.
      this.logger.warn(`No se pudo registrar auditoria: ${String(err)}`);
    }
  }

  /**
   * Calcula el diff campo a campo, replicando perform_update:
   * compara solo claves presentes en `fields` y serializa con String().
   */
  diff(
    before: Record<string, any>,
    after: Record<string, any>,
    fields?: string[],
  ): Record<string, { old: unknown; new: unknown }> {
    const keys = fields ?? Object.keys({ ...before, ...after });
    const changed: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of keys) {
      const oldVal = before?.[key];
      const newVal = after?.[key];
      if (!this.equal(oldVal, newVal)) {
        changed[key] = { old: this.serialize(oldVal), new: this.serialize(newVal) };
      }
    }
    return changed;
  }

  private equal(a: unknown, b: unknown): boolean {
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    if (this.isDecimalLike(a) || this.isDecimalLike(b)) {
      return String(a) === String(b);
    }
    return a === b;
  }

  private isDecimalLike(v: unknown): boolean {
    return (
      typeof v === 'object' &&
      v !== null &&
      typeof (v as any).toFixed === 'function' &&
      (v as any).constructor?.name === 'Decimal'
    );
  }

  private serialize(v: unknown): string {
    if (v === null || v === undefined) {
      return String(v);
    }
    if (v instanceof Date) {
      return v.toISOString();
    }
    return String(v);
  }
}
