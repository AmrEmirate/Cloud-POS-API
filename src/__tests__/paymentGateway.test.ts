import crypto from 'crypto';
import { PaymentGatewayService } from '../services/paymentGateway';

describe('White Box Testing: PaymentGatewayService (Midtrans Signature & Gateway)', () => {
  const sampleServerKey = 'SB-Mid-server-SampleKey123456';
  const orderId = 'INV-POS-20261102-001';
  const statusCode = '200';
  const grossAmount = '125000.00';

  describe('White Box: verifyMidtransSignature() Algorithm', () => {
    it('should return true when signature matches SHA512(orderId + statusCode + grossAmount + serverKey)', () => {
      const raw = `${orderId}${statusCode}${grossAmount}${sampleServerKey}`;
      const validSignature = crypto.createHash('sha512').update(raw).digest('hex');

      const result = PaymentGatewayService.verifyMidtransSignature(
        orderId,
        statusCode,
        grossAmount,
        validSignature,
        sampleServerKey
      );

      expect(result).toBe(true);
    });

    it('should return false when signature does not match', () => {
      const invalidSignature = 'invalidhash0123456789abcdef';

      const result = PaymentGatewayService.verifyMidtransSignature(
        orderId,
        statusCode,
        grossAmount,
        invalidSignature,
        sampleServerKey
      );

      expect(result).toBe(false);
    });

    it('should be case-insensitive on signature comparison', () => {
      const raw = `${orderId}${statusCode}${grossAmount}${sampleServerKey}`;
      const validSignatureUpper = crypto.createHash('sha512').update(raw).digest('hex').toUpperCase();

      const result = PaymentGatewayService.verifyMidtransSignature(
        orderId,
        statusCode,
        grossAmount,
        validSignatureUpper,
        sampleServerKey
      );

      expect(result).toBe(true);
    });

    it('should bypass signature check when serverKey is undefined or empty in dev/simulator mode', () => {
      const result = PaymentGatewayService.verifyMidtransSignature(
        orderId,
        statusCode,
        grossAmount,
        'any-sig',
        '' // empty serverKey triggers dev bypass
      );

      expect(result).toBe(true);
    });
  });

  describe('White Box: testCredentials() Validation Branch', () => {
    it('should reject when serverKey is missing or too short (< 5 chars)', async () => {
      const result1 = await PaymentGatewayService.testCredentials({ serverKey: '' });
      expect(result1.success).toBe(false);
      expect(result1.message).toContain('minimal 5 karakter');

      const result2 = await PaymentGatewayService.testCredentials({ serverKey: '123' });
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('minimal 5 karakter');
    });
  });

  describe('White Box: createTransaction() Simulator Fallback Branch', () => {
    it('should fallback to SIMULATOR mode when custom serverKey is missing', async () => {
      const result = await PaymentGatewayService.createTransaction(
        {
          invoiceNumber: 'INV-SUB/20261102/1234',
          amount: 250000,
          description: 'SaaS Subscription',
          customerName: 'Owner Toko',
        },
        { serverKey: '' }
      );

      expect(result.success).toBe(true);
      expect(result.gateway).toBe('SIMULATOR');
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.qrCodeUrl).toContain('000201');
      expect(result.vaNumber).toBeDefined();
    });
  });
});
