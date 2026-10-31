import crypto from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
  return `${SCRYPT_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return false;
    const n = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = parts[4];
    const originalKey = Buffer.from(parts[5], 'hex');

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        originalKey.length,
        { N: n, r, p },
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });

    return crypto.timingSafeEqual(originalKey, derivedKey);
  }

  // Legacy SHA-256 support
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  if (legacyHash.length === storedHash.length) {
    return crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(storedHash));
  }

  return false;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}
