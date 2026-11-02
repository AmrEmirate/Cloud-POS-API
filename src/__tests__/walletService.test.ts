import { WalletService } from '../services/walletService';

describe('White Box Testing: WalletService (Financial Constraints & Invariants)', () => {
  describe('White Box: creditBalance() Input Guards', () => {
    it('Branch: non-positive amounts (<= 0) return null immediately without modifying DB', async () => {
      const resultZero = await WalletService.creditBalance({
        tenantId: 't1',
        amount: 0,
        category: 'POS_SALES',
        description: 'Test zero',
      });
      expect(resultZero).toBeNull();

      const resultNegative = await WalletService.creditBalance({
        tenantId: 't1',
        amount: -5000,
        category: 'POS_SALES',
        description: 'Test negative',
      });
      expect(resultNegative).toBeNull();
    });
  });

  describe('White Box: requestWithdrawal() Validation Guards', () => {
    it('Branch: amount < 20.000 throws minimum withdrawal error', async () => {
      await expect(
        WalletService.requestWithdrawal({
          tenantId: 't1',
          amount: 15000,
          bankName: 'BCA',
          bankAccountNumber: '1234567890',
          bankAccountName: 'Budi',
        })
      ).rejects.toThrow('Nominal penarikan saldo minimal Rp 20.000!');
    });

    it('Branch: missing bankName throws incomplete bank info error', async () => {
      await expect(
        WalletService.requestWithdrawal({
          tenantId: 't1',
          amount: 50000,
          bankName: '',
          bankAccountNumber: '1234567890',
          bankAccountName: 'Budi',
        })
      ).rejects.toThrow('Informasi rekening bank tujuan wajib diisi lengkap!');
    });

    it('Branch: missing bankAccountNumber throws error', async () => {
      await expect(
        WalletService.requestWithdrawal({
          tenantId: 't1',
          amount: 50000,
          bankName: 'BCA',
          bankAccountNumber: '',
          bankAccountName: 'Budi',
        })
      ).rejects.toThrow('Informasi rekening bank tujuan wajib diisi lengkap!');
    });

    it('Branch: missing bankAccountName throws error', async () => {
      await expect(
        WalletService.requestWithdrawal({
          tenantId: 't1',
          amount: 50000,
          bankName: 'BCA',
          bankAccountNumber: '1234567890',
          bankAccountName: '',
        })
      ).rejects.toThrow('Informasi rekening bank tujuan wajib diisi lengkap!');
    });
  });
});
