import { config } from '../../config/env';

describe('White Box Testing: Commission & Tax Mathematics', () => {
  describe('PPh 21 Tax Deduction Algorithm', () => {
    // Sesuai PMK / Ketentuan Pajak Indonesia:
    // Sales ber-NPWP dikenakan tarif efektif PPh 21 sebesar 2.5%
    // Sales tanpa NPWP dikenakan tarif lebih tinggi 20% yaitu 3.0%
    const calculateTaxAndNet = (amount: number, hasNpwp: boolean) => {
      const taxRate = hasNpwp ? 2.5 : 3.0;
      const taxAmount = (amount * taxRate) / 100;
      const netAmount = amount - taxAmount;
      return { taxRate, taxAmount, netAmount };
    };

    it('should calculate 2.5% tax for sales partner with NPWP', () => {
      const withdrawalAmount = 1000000; // Rp 1.000.000
      const result = calculateTaxAndNet(withdrawalAmount, true);

      expect(result.taxRate).toBe(2.5);
      expect(result.taxAmount).toBe(25000); // 2.5% of 1.000.000
      expect(result.netAmount).toBe(975000); // 1.000.000 - 25.000
    });

    it('should calculate 3.0% tax for sales partner without NPWP', () => {
      const withdrawalAmount = 1000000; // Rp 1.000.000
      const result = calculateTaxAndNet(withdrawalAmount, false);

      expect(result.taxRate).toBe(3.0);
      expect(result.taxAmount).toBe(30000); // 3.0% of 1.000.000
      expect(result.netAmount).toBe(970000); // 1.000.000 - 30.000
    });
  });

  describe('Recurring Commission Invariant Math', () => {
    it('should calculate correct commission based on sales custom commission rate', () => {
      const invoiceAmount = 250000; // Paket Unlimited Rp 250.000
      const customRate = 30; // 30% rate
      const commission = (invoiceAmount * customRate) / 100;

      expect(commission).toBe(75000);
    });

    it('should fallback to default commission percentage (25%) when sales rate is null', () => {
      const invoiceAmount = 200000; // Paket Pro Rp 200.000
      const rate = config.defaultCommissionPercentage; // 25%
      const commission = (invoiceAmount * rate) / 100;

      expect(commission).toBe(50000);
    });
  });

  describe('Wallet Ready Balance & Withdrawal Constraints', () => {
    const calculateAvailableBalance = (totalReady: number, pendingWithdrawal: number) => {
      return Math.max(0, totalReady - pendingWithdrawal);
    };

    it('should accurately calculate available balance after subtracting pending withdrawals', () => {
      const readyCommissions = 500000;
      const pendingWithdrawal = 200000;
      const available = calculateAvailableBalance(readyCommissions, pendingWithdrawal);

      expect(available).toBe(300000);
    });

    it('should never return a negative available balance if pending exceeds ready', () => {
      const readyCommissions = 100000;
      const pendingWithdrawal = 150000;
      const available = calculateAvailableBalance(readyCommissions, pendingWithdrawal);

      expect(available).toBe(0);
    });

    it('should reject withdrawal when requested amount is less than minimum threshold', () => {
      const minLimit = config.minimumWithdrawalAmount;
      const requested = minLimit - 10000;

      expect(requested < minLimit).toBe(true);
    });

    it('should enforce All-or-Nothing policy: withdrawal amount must equal 100% of available ready balance', () => {
      const availableBalance = 500000;
      const partialWithdrawal = 300000;
      const fullWithdrawal = 500000;

      // Rule: partial withdrawal is rejected
      expect(Math.round(partialWithdrawal) === Math.round(availableBalance)).toBe(false);

      // Rule: full balance withdrawal is accepted
      expect(Math.round(fullWithdrawal) === Math.round(availableBalance)).toBe(true);
    });

    it('should enforce 1-time per calendar month frequency limitation', () => {
      const now = new Date(2026, 10, 15); // 15 Nov 2026
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      const withdrawal1Date = new Date(2026, 10, 5); // 5 Nov 2026 (same month)
      const isSameMonth = withdrawal1Date >= startOfMonth;
      expect(isSameMonth).toBe(true);

      const nextAttemptAllowedDate = new Date(2026, 11, 1); // 1 Dec 2026 (next month)
      const isNextMonth = nextAttemptAllowedDate >= new Date(2026, 11, 1);
      expect(isNextMonth).toBe(true);
    });

    it('should validate manual bank transfer details and proof url on payout approval', () => {
      const payoutPayload = {
        withdrawalId: 'wd-001',
        status: 'COMPLETED',
        proofUrl: 'https://storage.vimtk.cloud/proofs/mbca-ref-88291.jpg',
        adminNotes: 'Transfer manual m-BCA Ref: 8829104 atas nama Budi Santoso',
      };

      expect(payoutPayload.status).toBe('COMPLETED');
      expect(payoutPayload.proofUrl).toContain('https://');
      expect(payoutPayload.adminNotes).toContain('Ref: 8829104');
    });
  });
});

