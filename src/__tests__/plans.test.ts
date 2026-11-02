import { getPlanDetails, SAAS_PLANS } from '../config/plans';

describe('White Box Testing: plans.ts (Plan Configuration & Limits)', () => {
  describe('Branch: Empty or undefined inputs', () => {
    it('should fallback to PAKET_100K when planCode is undefined or null', () => {
      expect(getPlanDetails()).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails(null)).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails('')).toEqual(SAAS_PLANS.PAKET_100K);
    });
  });

  describe('Branch: Numeric planCode inputs', () => {
    it('should return PAKET_100K for values <= 100000', () => {
      expect(getPlanDetails(100000)).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails(50000)).toEqual(SAAS_PLANS.PAKET_100K);
    });

    it('should return PAKET_150K for values between 100001 and 150000', () => {
      expect(getPlanDetails(150000)).toEqual(SAAS_PLANS.PAKET_150K);
      expect(getPlanDetails(125000)).toEqual(SAAS_PLANS.PAKET_150K);
    });

    it('should return PAKET_200K for values between 150001 and 200000', () => {
      expect(getPlanDetails(200000)).toEqual(SAAS_PLANS.PAKET_200K);
      expect(getPlanDetails(175000)).toEqual(SAAS_PLANS.PAKET_200K);
    });

    it('should return PAKET_250K for values > 200000', () => {
      expect(getPlanDetails(250000)).toEqual(SAAS_PLANS.PAKET_250K);
      expect(getPlanDetails(500000)).toEqual(SAAS_PLANS.PAKET_250K);
    });
  });

  describe('Branch: Exact match strings', () => {
    it('should return correct plan for exact codes', () => {
      expect(getPlanDetails('PAKET_100K')).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails('PAKET_150K')).toEqual(SAAS_PLANS.PAKET_150K);
      expect(getPlanDetails('PAKET_200K')).toEqual(SAAS_PLANS.PAKET_200K);
      expect(getPlanDetails('PAKET_250K')).toEqual(SAAS_PLANS.PAKET_250K);
    });

    it('should be case-insensitive and handle whitespace', () => {
      expect(getPlanDetails('  paket_100k  ')).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails('paket_250k')).toEqual(SAAS_PLANS.PAKET_250K);
    });
  });

  describe('Branch: Aliases & Fallbacks', () => {
    it('should match starter/regular/hemat aliases to PAKET_100K', () => {
      expect(getPlanDetails('STARTER')).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails('REGULAR')).toEqual(SAAS_PLANS.PAKET_100K);
      expect(getPlanDetails('HEMAT')).toEqual(SAAS_PLANS.PAKET_100K);
    });

    it('should match business/bisnis/growth aliases to PAKET_150K', () => {
      expect(getPlanDetails('BISNIS')).toEqual(SAAS_PLANS.PAKET_150K);
      expect(getPlanDetails('BUSINESS')).toEqual(SAAS_PLANS.PAKET_150K);
      expect(getPlanDetails('GROWTH')).toEqual(SAAS_PLANS.PAKET_150K);
    });

    it('should match PRO alias to PAKET_200K', () => {
      expect(getPlanDetails('PRO')).toEqual(SAAS_PLANS.PAKET_200K);
    });

    it('should match UNLIMITED / ENTERPRISE alias to PAKET_250K', () => {
      expect(getPlanDetails('UNLIMITED')).toEqual(SAAS_PLANS.PAKET_250K);
      expect(getPlanDetails('ENTERPRISE')).toEqual(SAAS_PLANS.PAKET_250K);
    });

    it('should fallback to PAKET_100K for completely unknown strings', () => {
      expect(getPlanDetails('UNKNOWN_RANDOM_PLAN')).toEqual(SAAS_PLANS.PAKET_100K);
    });
  });
});

