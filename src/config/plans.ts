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
    name: 'Paket Hemat (200 Tx/Hari)',
    price: 100000,
    dailyTxLimit: 200,
    monthlyTxLimit: 6000, // 200 x 30 hari
    description: 'Rp 100.000 / bln - 200 transaksi per hari dihitung per bulan (6.000 tx/bln)',
  },
  PAKET_150K: {
    code: 'PAKET_150K',
    name: 'Paket Bisnis (300 Tx/Hari)',
    price: 150000,
    dailyTxLimit: 300,
    monthlyTxLimit: 9000, // 300 x 30 hari
    description: 'Rp 150.000 / bln - 300 transaksi per hari dihitung per bulan (9.000 tx/bln)',
  },
  PAKET_200K: {
    code: 'PAKET_200K',
    name: 'Paket Pro (500 Tx/Hari)',
    price: 200000,
    dailyTxLimit: 500,
    monthlyTxLimit: 15000, // 500 x 30 hari
    description: 'Rp 200.000 / bln - 500 transaksi per hari dihitung per bulan (15.000 tx/bln)',
  },
  PAKET_250K: {
    code: 'PAKET_250K',
    name: 'Paket Unlimited (Tanpa Batas)',
    price: 250000,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Rp 250.000 / bln - Transaksi tanpa batas kuota (Unlimited)',
  },
};

/**
 * Helper untuk normalisasi kode paket dan mendapatkan detail batas kuota & tarif
 */
export const getPlanDetails = (planCode?: string | null): PlanConfig => {
  if (!planCode) return SAAS_PLANS.PAKET_100K;
  const upper = planCode.toUpperCase().trim();
  if (SAAS_PLANS[upper]) return SAAS_PLANS[upper];

  // Aliases fallback
  if (upper === 'STARTER' || upper === 'REGULAR') return SAAS_PLANS.PAKET_100K;
  if (upper === 'GROWTH') return SAAS_PLANS.PAKET_150K;
  if (upper === 'PRO') return SAAS_PLANS.PAKET_200K;
  if (upper === 'ENTERPRISE') return SAAS_PLANS.PAKET_250K;

  return SAAS_PLANS.PAKET_100K;
};
