export interface PlanConfig {
  code: string;
  name: string;
  price: number;
  dailyTxLimit: number; // 0 = unlimited / custom
  monthlyTxLimit: number; // 0 = unlimited / custom (Akumulasi bulanan fleksibel)
  description: string;
}

export const SAAS_PLANS: Record<string, PlanConfig> = {
  PAKET_50K: {
    code: 'PAKET_50K',
    name: 'Paket 1: Hemat (50 Tx/Hari)',
    price: 50000,
    dailyTxLimit: 50,
    monthlyTxLimit: 1500,
    description: 'Rp 50.000 / bln - 50 transaksi/hari (1.500 transaksi per struk / bulan)',
  },
  PAKET_100K: {
    code: 'PAKET_100K',
    name: 'Paket 2: Dasar (200 Tx/Hari)',
    price: 100000,
    dailyTxLimit: 200,
    monthlyTxLimit: 6000,
    description: 'Rp 100.000 / bln - 200 transaksi/hari (6.000 transaksi per struk / bulan)',
  },
  PAKET_150K: {
    code: 'PAKET_150K',
    name: 'Paket 3: Bisnis (350 Tx/Hari)',
    price: 150000,
    dailyTxLimit: 350,
    monthlyTxLimit: 10500,
    description: 'Rp 150.000 / bln - 350 transaksi/hari (10.500 transaksi per struk / bulan)',
  },
  PAKET_200K: {
    code: 'PAKET_200K',
    name: 'Paket 4: Pro (Unlimited)',
    price: 200000,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Rp 200.000 / bln - Unlimited transaksi kasir tanpa batas kuota',
  },
  PAKET_CUSTOM: {
    code: 'PAKET_CUSTOM',
    name: 'Paket 5: Custom (Sistem & DB Tersendiri)',
    price: 0,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Custom (Harga Tergantung Request) - Sistem BE & FE tersendiri serta Database terpisah',
  },
  // Alias untuk kompatibilitas data lama
  PAKET_250K: {
    code: 'PAKET_CUSTOM',
    name: 'Paket 5: Custom (Sistem & DB Tersendiri)',
    price: 0,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Custom (Harga Tergantung Request) - Sistem BE & FE tersendiri serta Database terpisah',
  },
};

/**
 * Helper untuk normalisasi kode paket dan mendapatkan detail batas kuota & tarif
 * Seluruh kuota dihitung secara akumulatif per bulan (monthlyTxLimit).
 */
export const getPlanDetails = (planCode?: string | number | null): PlanConfig => {
  if (!planCode) return SAAS_PLANS.PAKET_50K;

  if (typeof planCode === 'number') {
    if (planCode <= 50000) return SAAS_PLANS.PAKET_50K;
    if (planCode <= 100000) return SAAS_PLANS.PAKET_100K;
    if (planCode <= 150000) return SAAS_PLANS.PAKET_150K;
    if (planCode <= 200000) return SAAS_PLANS.PAKET_200K;
    return SAAS_PLANS.PAKET_CUSTOM;
  }

  const upper = String(planCode).toUpperCase().trim();
  if (SAAS_PLANS[upper]) return SAAS_PLANS[upper];

  // Aliases & fallback strings
  if (upper.includes('50') || upper === 'STARTER' || upper === 'HEMAT') return SAAS_PLANS.PAKET_50K;
  if (upper.includes('100') || upper === 'REGULAR' || upper === 'DASAR') return SAAS_PLANS.PAKET_100K;
  if (upper.includes('150') || upper === 'GROWTH' || upper === 'STANDARD' || upper === 'BISNIS' || upper === 'BUSINESS') return SAAS_PLANS.PAKET_150K;
  if (upper.includes('200') || upper === 'PRO') return SAAS_PLANS.PAKET_200K;
  if (upper.includes('CUSTOM') || upper.includes('250') || upper === 'ENTERPRISE' || upper === 'UNLIMITED') return SAAS_PLANS.PAKET_CUSTOM;

  return SAAS_PLANS.PAKET_50K;
};
