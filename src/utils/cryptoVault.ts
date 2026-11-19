import crypto from 'crypto';
import { getJwtSecret } from '../middlewares/auth';

const ENCRYPTION_PREFIX = 'enc:v1:';

const getEncryptionKey = (): Buffer => {
  const rawSecret = (process.env.ENCRYPTION_KEY || getJwtSecret()).trim();
  return crypto.createHash('sha256').update(rawSecret).digest();
};

export const isEncryptedSecret = (value?: string | null): boolean => {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
};

/**
 * Encrypt sensitive BYOK credentials (Duitku API Key / Midtrans Server Key) at rest using AES-256-GCM
 */
export const encryptSecret = (plainText?: string | null): string => {
  if (!plainText) return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  if (isEncryptedSecret(trimmed)) return trimmed;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypt AES-256-GCM secret or transparently return legacy plaintext if not yet encrypted
 */
export const decryptSecret = (cipherText?: string | null): string => {
  if (!cipherText) return '';
  const trimmed = cipherText.trim();
  if (!trimmed) return '';
  if (!isEncryptedSecret(trimmed)) return trimmed;

  try {
    const payload = trimmed.slice(ENCRYPTION_PREFIX.length);
    const [ivHex, tagHex, encryptedHex] = payload.split(':');
    if (!ivHex || !tagHex || !encryptedHex) return '';

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

/**
 * Mask a secret (encrypted or plaintext) showing only the last 4 characters
 */
export const maskSecret = (secretOrCipher?: string | null): string => {
  const plain = decryptSecret(secretOrCipher);
  if (!plain || plain.length < 4) return '';
  return '••••••••' + plain.slice(-4);
};

/**
 * Constant-time string comparison immune to timing side-channel attacks
 */
export const timingSafeCompare = (a?: string | null, b?: string | null): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  const hashesEqual = crypto.timingSafeEqual(hashA, hashB);
  return hashesEqual && bufA.length === bufB.length;
};
