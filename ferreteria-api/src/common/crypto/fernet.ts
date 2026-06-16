import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Implementacion de Fernet (spec de `cryptography`) compatible con
 * django-encrypted-model-fields. La clave es la MISMA FIELD_ENCRYPTION_KEY
 * del proyecto Django: base64 urlsafe de 32 bytes (16 firma + 16 cifrado).
 *
 * Token Fernet = base64url( 0x80 | ts(8) | iv(16) | ciphertext | hmac(32) )
 *   - AES-128-CBC con padding PKCS7
 *   - HMAC-SHA256 sobre (version | ts | iv | ciphertext)
 */

const VERSION = 0x80;

function urlsafeB64Decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function urlsafeB64Encode(buf: Buffer): string {
  return buf.toString('base64url');
}

export class InvalidToken extends Error {
  constructor(message = 'Token Fernet invalido') {
    super(message);
    this.name = 'InvalidToken';
  }
}

export class Fernet {
  private readonly signingKey: Buffer;
  private readonly encryptionKey: Buffer;

  constructor(key: string) {
    const raw = urlsafeB64Decode(key);
    if (raw.length !== 32) {
      throw new Error(
        `FIELD_ENCRYPTION_KEY invalida: se esperaban 32 bytes, se obtuvieron ${raw.length}`,
      );
    }
    this.signingKey = raw.subarray(0, 16);
    this.encryptionKey = raw.subarray(16, 32);
  }

  encrypt(data: string, nowSeconds?: number): string {
    const iv = randomBytes(16);
    return this.encryptWithParts(Buffer.from(data, 'utf8'), iv, nowSeconds);
  }

  private encryptWithParts(data: Buffer, iv: Buffer, nowSeconds?: number): string {
    const cipher = createCipheriv('aes-128-cbc', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);

    const timestamp = Buffer.alloc(8);
    const seconds = nowSeconds ?? Math.floor(Date.now() / 1000);
    // big-endian uint64; los segundos caben en 32 bits por mucho tiempo.
    timestamp.writeUInt32BE(Math.floor(seconds / 0x100000000), 0);
    timestamp.writeUInt32BE(seconds >>> 0, 4);

    const version = Buffer.from([VERSION]);
    const basicParts = Buffer.concat([version, timestamp, iv, ciphertext]);
    const hmac = createHmac('sha256', this.signingKey).update(basicParts).digest();

    return urlsafeB64Encode(Buffer.concat([basicParts, hmac]));
  }

  decrypt(token: string): string {
    let data: Buffer;
    try {
      data = urlsafeB64Decode(token);
    } catch {
      throw new InvalidToken();
    }

    if (data.length < 1 + 8 + 16 + 32 || data[0] !== VERSION) {
      throw new InvalidToken();
    }

    const hmac = data.subarray(data.length - 32);
    const basicParts = data.subarray(0, data.length - 32);
    const expected = createHmac('sha256', this.signingKey)
      .update(basicParts)
      .digest();

    if (hmac.length !== expected.length || !timingSafeEqual(hmac, expected)) {
      throw new InvalidToken('HMAC no coincide');
    }

    const iv = basicParts.subarray(9, 25);
    const ciphertext = basicParts.subarray(25);

    try {
      const decipher = createDecipheriv('aes-128-cbc', this.encryptionKey, iv);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch {
      throw new InvalidToken('No se pudo descifrar');
    }
  }
}
