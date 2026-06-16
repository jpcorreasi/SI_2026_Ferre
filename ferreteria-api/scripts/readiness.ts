/**
 * Chequeo de preparación para producción — adaptación de
 * accounts/management/commands/check_production_readiness.py al entorno Node.
 * Sale con código 1 si algún chequeo falla.  Uso:  npm run readiness
 */
import 'dotenv/config';

type Check = [ok: boolean, label: string, detail: string | null];

function checkNodeEnv(): Check {
  const label = 'NODE_ENV=production (DEBUG off)';
  if (process.env.NODE_ENV !== 'production')
    return [false, label, 'Define NODE_ENV=production antes de desplegar.'];
  return [true, label, null];
}

function checkJwtSecret(): Check {
  const label = 'JWT_SECRET no es el valor por defecto';
  const key = process.env.JWT_SECRET ?? '';
  if (!key || key.startsWith('dev-secret'))
    return [false, label, 'Genera un JWT_SECRET aleatorio y configúralo en .env.'];
  if (key.length < 40)
    return [false, label, 'JWT_SECRET demasiado corto — usa al menos 50 caracteres.'];
  return [true, label, null];
}

function checkPostgres(): Check {
  const label = 'Base de datos es PostgreSQL (no SQLite)';
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('sqlite') || !url.startsWith('postgres'))
    return [false, label, 'Configura DATABASE_URL=postgresql://... en .env.'];
  return [true, label, null];
}

function checkCorsConfigured(): Check {
  const label = 'CORS_ALLOWED_ORIGINS está configurado';
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? '').trim();
  if (!origins)
    return [false, label, 'Configura CORS_ALLOWED_ORIGINS con los orígenes permitidos.'];
  return [true, label, null];
}

function checkEncryptionKey(): Check {
  const label = 'FIELD_ENCRYPTION_KEY está definida';
  const key = process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (!key)
    return [false, label, 'Genera una clave Fernet y configúrala en FIELD_ENCRYPTION_KEY.'];
  if (key.length < 44)
    return [false, label, 'FIELD_ENCRYPTION_KEY parece demasiado corta para una clave Fernet.'];
  return [true, label, null];
}

function checkNoWildcardCors(): Check {
  const label = "CORS_ALLOWED_ORIGINS no usa comodín '*'";
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim());
  if (origins.includes('*'))
    return [false, label, "CORS '*' es inseguro — especifica los dominios exactos."];
  return [true, label, null];
}

function main() {
  const checks = [
    checkNodeEnv,
    checkJwtSecret,
    checkPostgres,
    checkCorsConfigured,
    checkEncryptionKey,
    checkNoWildcardCors,
  ];

  console.log('\nProduction readiness checks\n' + '-'.repeat(40));
  let passed = 0;
  let failed = 0;
  for (const check of checks) {
    const [ok, label, detail] = check();
    if (ok) {
      console.log(`[OK]   ${label}`);
      passed++;
    } else {
      console.log(`[FAIL] ${label}`);
      if (detail) console.log(`       > ${detail}`);
      failed++;
    }
  }
  console.log('-'.repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main();
