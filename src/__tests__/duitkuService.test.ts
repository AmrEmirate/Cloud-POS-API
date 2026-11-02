import crypto from 'crypto';
import { DuitkuService } from '../services/duitkuService';

describe('White Box Testing: DuitkuService (Duitku Gateway & Signature Hashing)', () => {
  const sampleMerchantCode = 'D12345';
  const sampleApiKey = 'supersecretkey1234567890';
  const orderId = 'INV-TEST-001';
  const amount = 50000;

  describe('White Box: verifyCallback() Algorithm', () => {
    it('should validate correctly when signature matches MD5(merchantCode + amount + merchantOrderId + apiKey)', () => {
      const raw = `${sampleMerchantCode}${amount}${orderId}${sampleApiKey}`;
      const validSignature = crypto.createHash('md5').update(raw).digest('hex');

      const result = DuitkuService.verifyCallback(
        sampleMerchantCode,
        amount,
        orderId,
        validSignature,
        sampleApiKey,
        sampleMerchantCode
      );

      expect(result).toBe(true);
    });

    it('should reject when signature is altered or invalid', () => {
      const invalidSignature = 'deadbeefdeadbeefdeadbeefdeadbeef';

      const result = DuitkuService.verifyCallback(
        sampleMerchantCode,
        amount,
        orderId,
        invalidSignature,
        sampleApiKey,
        sampleMerchantCode
      );

      expect(result).toBe(false);
    });

    it('should be case-insensitive on signature comparison', () => {
      const raw = `${sampleMerchantCode}${amount}${orderId}${sampleApiKey}`;
      const validSignatureUpper = crypto.createHash('md5').update(raw).digest('hex').toUpperCase();

      const result = DuitkuService.verifyCallback(
        sampleMerchantCode,
        amount,
        orderId,
        validSignatureUpper,
        sampleApiKey,
        sampleMerchantCode
      );

      expect(result).toBe(true);
    });

    it('should return true for local simulator when apiKey is empty/undefined', () => {
      const result = DuitkuService.verifyCallback(
        sampleMerchantCode,
        amount,
        orderId,
        'any-dummy-sig',
        '', // empty apiKey triggers simulator bypass
        sampleMerchantCode
      );

      expect(result).toBe(true);
    });
  });

  describe('White Box: testCredentials() Validation Branch', () => {
    it('should immediately return error when merchantCode is missing', async () => {
      const result = await DuitkuService.testCredentials({
        merchantCode: '',
        apiKey: 'samplekey12345',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('wajib diisi');
    });

    it('should immediately return error when apiKey is missing', async () => {
      const result = await DuitkuService.testCredentials({
        merchantCode: 'D12345',
        apiKey: '',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('wajib diisi');
    });
  });

  describe('White Box: createTransaction() Simulator Fallback Branch', () => {
    it('should fallback to SIMULATOR mode when credentials are empty/not configured', async () => {
      const result = await DuitkuService.createTransaction(
        {
          merchantOrderId: 'INV-SIM-001',
          amount: 75000,
          productDetails: 'Pesanan Uji Coba',
          customerName: 'Budi Santoso',
        },
        {
          merchantCode: '',
          apiKey: '',
        }
      );

      expect(result.success).toBe(true);
      expect(result.gateway).toBe('SIMULATOR');
      expect(result.merchantOrderId).toBe('INV-SIM-001');
      expect(result.qrString).toBeDefined();
      expect(result.qrString).toContain('000201'); // Standard EMVCo QRIS prefix
      expect(result.vaNumber).toBeDefined();
    });
  });
});

