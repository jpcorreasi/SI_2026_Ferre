import { Fernet, InvalidToken } from './fernet';

// Clave Fernet de ejemplo (32 bytes base64url). Igual formato que Django.
const KEY = 'cVQ1bGZ2cVh3WXpBQkNERUZHSElKS0xNTk9QUVJTVFU=';

describe('Fernet', () => {
  it('hace round-trip encrypt/decrypt', () => {
    const f = new Fernet(KEY);
    const token = f.encrypt('1098765432');
    expect(token).not.toContain('1098765432');
    expect(f.decrypt(token)).toBe('1098765432');
  });

  it('descifra un token generado con timestamp fijo', () => {
    const f = new Fernet(KEY);
    const token = f.encrypt('CC-900.123', 1700000000);
    expect(f.decrypt(token)).toBe('CC-900.123');
  });

  it('rechaza un token manipulado (HMAC)', () => {
    const f = new Fernet(KEY);
    const token = f.encrypt('secreto');
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(() => f.decrypt(tampered)).toThrow(InvalidToken);
  });

  it('rechaza una clave de longitud incorrecta', () => {
    expect(() => new Fernet('demasiado-corta')).toThrow();
  });
});
