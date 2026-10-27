export interface PlanConfig {
  code: string;
  name: string;
  price: number;
  dailyTxLimit: number; // 0 = unlimited
  monthlyTxLimit: number; // 0 = unlimited
  description: string;
}

export const SAAS_PLANS: Record<string, PlanConfig> = {
  PAKET_100K: {
    code: 'PAKET_100K',
    name: 'Paket 1: Hemat (6.000 Tx/Bulan)',
    price: 100000,
    dailyTxLimit: 200,
    monthlyTxLimit: 6000,
    description: 'Rp 100.000 / bln - Kuota 6.000 transaksi per bulan',
  },
  PAKET_150K: {
    code: 'PAKET_150K',
    name: 'Paket 2: Bisnis (9.000 Tx/Bulan)',
    price: 150000,
    dailyTxLimit: 300,
    monthlyTxLimit: 9000,
    description: 'Rp 150.000 / bln - Kuota 9.000 transaksi per bulan',
  },
  PAKET_200K: {
    code: 'PAKET_200K',
    name: 'Paket 3: Pro (15.000 Tx/Bulan)',
    price: 200000,
    dailyTxLimit: 500,
    monthlyTxLimit: 15000,
    description: 'Rp 200.000 / bln - Kuota 15.000 transaksi per bulan',
  },
  PAKET_250K: {
    code: 'PAKET_250K',
    name: 'Paket 4: Unlimited (Tanpa Batas)',
    price: 250000,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Rp 250.000 / bln - Unlimited transaksi per bulan (Tanpa Batas Kuota)',
  },
};

/**
 * Helper untuk normalisasi kode paket dan mendapatkan detail batas kuota & tarif
 */
export const getPlanDetails = (planCode?: string | number | null): PlanConfig => {
  if (!planCode) return SAAS_PLANS.PAKET_100K;

  if (typeof planCode === 'number') {
    if (planCode <= 100000) return SAAS_PLANS.PAKET_100K;
    if (planCode <= 150000) return SAAS_PLANS.PAKET_150K;
    if (planCode <= 200000) return SAAS_PLANS.PAKET_200K;
    return SAAS_PLANS.PAKET_250K;
  }

  const upper = String(planCode).toUpperCase().trim();
  if (SAAS_PLANS[upper]) return SAAS_PLANS[upper];

  // Aliases fallback
  if (upper.includes('100') || upper === 'STARTER' || upper === 'REGULAR' || upper === 'HEMAT') return SAAS_PLANS.PAKET_100K;
  if (upper.includes('150') || upper === 'GROWTH' || upper === 'STANDARD' || upper === 'BISNIS' || upper === 'BUSINESS') return SAAS_PLANS.PAKET_150K;
  if (upper.includes('200') || upper === 'PRO') return SAAS_PLANS.PAKET_200K;
  if (upper.includes('250') || upper === 'ENTERPRISE' || upper === 'UNLIMITED') return SAAS_PLANS.PAKET_250K;

  return SAAS_PLANS.PAKET_100K;
};
