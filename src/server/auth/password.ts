import crypto from 'node:crypto';

const PREFIX = 'scrypt$';
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: string, keylen: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEYLEN, N, R, P);
  return `${PREFIX}${N}$${R}$${P}$${salt}$${key.toString('hex')}`;
}

export interface VerifyResult {
  valid: boolean;
  /** True when the stored hash uses a legacy scheme and should be upgraded. */
  needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith(PREFIX)) {
    const parts = stored.split('$');
    if (parts.length !== 6) return { valid: false, needsRehash: false };
    const [, n, r, p, salt, hex] = parts;
    const expected = Buffer.from(hex, 'hex');
    const actual = await scrypt(password, salt, expected.length, Number(n), Number(r), Number(p));
    return { valid: crypto.timingSafeEqual(expected, actual), needsRehash: false };
  }

  // v1 accounts may still carry an unsalted SHA-256 hash; accept once, then upgrade.
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  const valid =
    legacy.length === stored.length && crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
  return { valid, needsRehash: valid };
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
