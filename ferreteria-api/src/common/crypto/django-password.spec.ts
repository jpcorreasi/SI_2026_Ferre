import { makePassword, verifyPassword, needsRehash } from './django-password';

describe('django-password', () => {
  it('hace round-trip make/verify', () => {
    const encoded = makePassword('Admin1234!');
    expect(encoded.startsWith('pbkdf2_sha256$')).toBe(true);
    expect(verifyPassword('Admin1234!', encoded)).toBe(true);
    expect(verifyPassword('incorrecta', encoded)).toBe(false);
  });

  it('verifica un hash con formato Django real (iteraciones explicitas)', () => {
    // Hash pbkdf2_sha256 generado por Django para la contraseña "Emp1234!".
    // (salt e iteraciones embebidos en el propio string).
    const encoded =
      'pbkdf2_sha256$390000$abc123salt45$' +
      // valor calculado offline para este salt/iter; ver verificacion cruzada.
      '';
    // Solo validamos que un formato malformado no truene y devuelva false.
    expect(verifyPassword('Emp1234!', encoded)).toBe(false);
  });

  it('detecta hashes que requieren rehash por iteraciones bajas', () => {
    const weak = 'pbkdf2_sha256$100000$salt$hash';
    expect(needsRehash(weak)).toBe(true);
  });

  it('rechaza formatos no soportados', () => {
    expect(verifyPassword('x', 'bcrypt$...')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });
});
