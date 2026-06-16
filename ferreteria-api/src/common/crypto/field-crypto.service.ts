import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Fernet, InvalidToken } from './fernet';

/**
 * Cifra/descifra campos sensibles (document_number) replicando
 * django-encrypted-model-fields. Usa la MISMA FIELD_ENCRYPTION_KEY que Django.
 */
@Injectable()
export class FieldCryptoService {
  private readonly logger = new Logger(FieldCryptoService.name);
  private readonly fernet: Fernet | null;

  constructor(config: ConfigService) {
    const key = config.get<string>('FIELD_ENCRYPTION_KEY');
    if (!key) {
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY no configurada: el cifrado de campos esta deshabilitado.',
      );
      this.fernet = null;
    } else {
      this.fernet = new Fernet(key);
    }
  }

  encrypt(plaintext: string | null | undefined): string {
    if (plaintext === null || plaintext === undefined) {
      return '';
    }
    if (!this.fernet) {
      return plaintext;
    }
    return this.fernet.encrypt(plaintext);
  }

  /**
   * Descifra un token. Si el valor no es un token valido (p.ej. datos en claro
   * durante una migracion parcial) se devuelve tal cual, igual que el
   * comportamiento tolerante de Django al leer datos heredados.
   */
  decrypt(token: string | null | undefined): string {
    if (!token) {
      return '';
    }
    if (!this.fernet) {
      return token;
    }
    try {
      return this.fernet.decrypt(token);
    } catch (err) {
      if (err instanceof InvalidToken) {
        return token;
      }
      throw err;
    }
  }

  /** Enmascara para roles sin permiso (paridad EMPLEADO -> '***'). */
  static readonly MASK = '***';
}
