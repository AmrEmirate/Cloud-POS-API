import request from 'supertest';
import { app } from '../app';
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  maskSecret,
  timingSafeCompare,
} from '../utils/cryptoVault';
import { hasValidFileSignature } from '../middlewares/upload';
import { PaymentGatewayService } from '../services/paymentGateway';
import { DuitkuService } from '../services/duitkuService';

describe('Security Hardening Test Suite (White-Box & Black-Box 10/10 Audit Verification)', () => {
  describe('White-Box: AES-256-GCM Crypto Vault & Timing-Safe Comparison', () => {
    it('encrypts plaintext BYOK keys into enc:v1: format and decrypts back losslessly', () => {
      const rawKey = 'SB-Mid-server-LiveKey9876543210';
      const encrypted = encryptSecret(rawKey);

      expect(encrypted).not.toBe(rawKey);
      expect(isEncryptedSecret(encrypted)).toBe(true);
      expect(encrypted.startsWith('enc:v1:')).toBe(true);

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(rawKey);
    });

    it('is idempotent when encrypting an already encrypted value', () => {
      const rawKey = 'duitku_api_key_secret_2026';
      const enc1 = encryptSecret(rawKey);
      const enc2 = encryptSecret(enc1);

      expect(enc2).toBe(enc1);
      expect(decryptSecret(enc2)).toBe(rawKey);
    });

    it('gracefully supports legacy plaintext keys and masks only the last 4 characters', () => {
      const legacyPlain = 'LEGACY_KEY_1234';
      expect(decryptSecret(legacyPlain)).toBe(legacyPlain);
      expect(maskSecret(legacyPlain)).toBe('••••••••1234');

      const encrypted = encryptSecret('SECRET_GATEWAY_9988');
      expect(maskSecret(encrypted)).toBe('••••••••9988');
    });

    it('performs constant-time comparison accurately without leaking length', () => {
      expect(timingSafeCompare('secret-token-123', 'secret-token-123')).toBe(true);
      expect(timingSafeCompare('secret-token-123', 'secret-token-124')).toBe(false);
      expect(timingSafeCompare('short', 'longer-secret-string')).toBe(false);
      expect(timingSafeCompare('', 'non-empty')).toBe(false);
      expect(timingSafeCompare(null, 'non-empty')).toBe(false);
    });
  });

  describe('White-Box: File Upload Magic Bytes Verification (Anti-Spoofing)', () => {
    it('accepts valid JPEG, PNG, WEBP, and PDF binary signatures', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const webpHeader = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
      const pdfHeader = Buffer.from('%PDF-1.7\n', 'ascii');

      expect(hasValidFileSignature(jpegHeader)).toBe(true);
      expect(hasValidFileSignature(pngHeader)).toBe(true);
      expect(hasValidFileSignature(webpHeader)).toBe(true);
      expect(hasValidFileSignature(pdfHeader)).toBe(true);
    });

    it('rejects disguised HTML/JS/PHP/Executable payloads even if renamed to .jpg', () => {
      const htmlPayload = Buffer.from('<script>alert(document.cookie)</script>', 'utf8');
      const phpPayload = Buffer.from('<?php system($_GET["cmd"]); ?>', 'utf8');
      const elfBinary = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);

      expect(hasValidFileSignature(htmlPayload)).toBe(false);
      expect(hasValidFileSignature(phpPayload)).toBe(false);
      expect(hasValidFileSignature(elfBinary)).toBe(false);
    });
  });

  describe('White-Box: Production Webhook Signature Strict Enforcement', () => {
    const origEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = origEnv;
    });

    it('blocks unsigned/empty-key Midtrans & Duitku webhooks when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';

      const midtransBypassAttempt = PaymentGatewayService.verifyMidtransSignature(
        'INV-SUB-001',
        '200',
        '100000',
        'forged-signature',
        ''
      );
      expect(midtransBypassAttempt).toBe(false);

      const duitkuBypassAttempt = DuitkuService.verifyCallback(
        'D1234',
        100000,
        'INV-SUB-001',
        'forged-signature',
        '',
        'D1234'
      );
      expect(duitkuBypassAttempt).toBe(false);
    });
  });

  describe('Black-Box: HTTP Security Headers, Internal Auth Guard & Financial Masking', () => {
    it('returns strict enterprise HTTP security headers on API responses', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('rejects unauthorized requests to /api/v1/internal/tenants with 401', async () => {
      const res = await request(app)
        .get('/api/v1/internal/tenants')
        .set('x-internal-secret', 'forged-wrong-secret-key')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('masks sensitive HPP costPrice on unauthenticated GET /api/v1/menus', async () => {
      const res = await request(app).get('/api/v1/menus').expect(200);

      expect(res.body.success).toBe(true);
      if (Array.isArray(res.body.data) && res.body.data.length > 0) {
        for (const item of res.body.data) {
          expect(item.costPrice).toBe(0);
        }
      }
    });

    it('masks sensitive targetDailySales on unauthenticated GET /api/v1/outlets', async () => {
      const res = await request(app).get('/api/v1/outlets').expect(200);

      expect(res.body.success).toBe(true);
      if (Array.isArray(res.body.data) && res.body.data.length > 0) {
        for (const outlet of res.body.data) {
          expect(outlet.targetDailySales).toBe(0);
          expect(outlet.currentMonthTxCount).toBe(0);
        }
      }
    });
  });
});
