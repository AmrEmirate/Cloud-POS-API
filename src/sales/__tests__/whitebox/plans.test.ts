import { getPackageByCodeOrFee, PROTEK_PACKAGES } from '../../constants/plans';

describe('White Box Testing: plans.ts (Protek POS Package Plans & Normalization)', () => {
  describe('Constants Invariants', () => {
    it('should have 4 predefined packages matching the blueprint', () => {
      expect(PROTEK_PACKAGES.PAKET_100K).toBeDefined();
      expect(PROTEK_PACKAGES.PAKET_150K).toBeDefined();
      expect(PROTEK_PACKAGES.PAKET_200K).toBeDefined();
      expect(PROTEK_PACKAGES.PAKET_250K).toBeDefined();

      expect(PROTEK_PACKAGES.PAKET_100K.monthlyFee).toBe(100000);
      expect(PROTEK_PACKAGES.PAKET_100K.monthlyTxLimit).toBe(6000);

      expect(PROTEK_PACKAGES.PAKET_150K.monthlyFee).toBe(150000);
      expect(PROTEK_PACKAGES.PAKET_150K.monthlyTxLimit).toBe(9000);

      expect(PROTEK_PACKAGES.PAKET_200K.monthlyFee).toBe(200000);
      expect(PROTEK_PACKAGES.PAKET_200K.monthlyTxLimit).toBe(15000);

      expect(PROTEK_PACKAGES.PAKET_250K.monthlyFee).toBe(250000);
      expect(PROTEK_PACKAGES.PAKET_250K.monthlyTxLimit).toBe(0); // Unlimited
    });
  });

  describe('getPackageByCodeOrFee() Branches', () => {
    it('Branch: should fallback to PAKET_150K when input is undefined, null, or empty', () => {
      expect(getPackageByCodeOrFee(undefined)).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee(null as any)).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee('')).toEqual(PROTEK_PACKAGES.PAKET_150K);
    });

    it('Branch: numeric fee thresholds', () => {
      expect(getPackageByCodeOrFee(80000)).toEqual(PROTEK_PACKAGES.PAKET_100K);
      expect(getPackageByCodeOrFee(100000)).toEqual(PROTEK_PACKAGES.PAKET_100K);
      expect(getPackageByCodeOrFee(120000)).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee(150000)).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee(180000)).toEqual(PROTEK_PACKAGES.PAKET_200K);
      expect(getPackageByCodeOrFee(200000)).toEqual(PROTEK_PACKAGES.PAKET_200K);
      expect(getPackageByCodeOrFee(250000)).toEqual(PROTEK_PACKAGES.PAKET_250K);
      expect(getPackageByCodeOrFee(500000)).toEqual(PROTEK_PACKAGES.PAKET_250K);
    });

    it('Branch: exact package code matches', () => {
      expect(getPackageByCodeOrFee('PAKET_100K')).toEqual(PROTEK_PACKAGES.PAKET_100K);
      expect(getPackageByCodeOrFee('PAKET_150K')).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee('PAKET_200K')).toEqual(PROTEK_PACKAGES.PAKET_200K);
      expect(getPackageByCodeOrFee('PAKET_250K')).toEqual(PROTEK_PACKAGES.PAKET_250K);
    });

    it('Branch: alias string matches & case insensitivity', () => {
      expect(getPackageByCodeOrFee('starter')).toEqual(PROTEK_PACKAGES.PAKET_100K);
      expect(getPackageByCodeOrFee('Standard')).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee('GROWTH')).toEqual(PROTEK_PACKAGES.PAKET_150K);
      expect(getPackageByCodeOrFee('PRO')).toEqual(PROTEK_PACKAGES.PAKET_200K);
      expect(getPackageByCodeOrFee('unlimited')).toEqual(PROTEK_PACKAGES.PAKET_250K);
      expect(getPackageByCodeOrFee('ENTERPRISE')).toEqual(PROTEK_PACKAGES.PAKET_250K);
    });

    it('Branch: unknown string fallback to PAKET_150K', () => {
      expect(getPackageByCodeOrFee('RANDOM_CUSTOM_TIER')).toEqual(PROTEK_PACKAGES.PAKET_150K);
    });
  });
});

