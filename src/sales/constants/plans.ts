export interface PackagePlan {
  code: string;
  name: string;
  monthlyFee: number;
  dailyTxLimit: number; // 0 = unlimited / custom
  monthlyTxLimit: number; // 0 = unlimited / custom
  description: string;
}

export const PROTEK_PACKAGES: Record<string, PackagePlan> = {
  PAKET_50K: {
    code: 'PAKET_50K',
    name: 'Paket 1: Hemat (100 Tx/Hari)',
    monthlyFee: 50000,
    dailyTxLimit: 100,
    monthlyTxLimit: 3000,
    description: 'Rp 50.000/bln - Rata-rata 100 transaksi/hari (Akumulasi 3.000 tx/bulan, fleksibel per bulan)',
  },
  PAKET_100K: {
    code: 'PAKET_100K',
    name: 'Paket 2: Dasar (200 Tx/Hari)',
    monthlyFee: 100000,
    dailyTxLimit: 200,
    monthlyTxLimit: 6000,
    description: 'Rp 100.000/bln - Rata-rata 200 transaksi/hari (Akumulasi 6.000 tx/bulan, fleksibel per bulan)',
  },
  PAKET_150K: {
    code: 'PAKET_150K',
    name: 'Paket 3: Bisnis (300 Tx/Hari)',
    monthlyFee: 150000,
    dailyTxLimit: 300,
    monthlyTxLimit: 9000,
    description: 'Rp 150.000/bln - Rata-rata 300 transaksi/hari (Akumulasi 9.000 tx/bulan, fleksibel per bulan)',
  },
  PAKET_200K: {
    code: 'PAKET_200K',
    name: 'Paket 4: Pro (500 Tx/Hari)',
    monthlyFee: 200000,
    dailyTxLimit: 500,
    monthlyTxLimit: 15000,
    description: 'Rp 200.000/bln - Rata-rata 500 transaksi/hari (Akumulasi 15.000 tx/bulan, fleksibel per bulan)',
  },
  PAKET_CUSTOM: {
    code: 'PAKET_CUSTOM',
    name: 'Paket 5: Custom (Hubungi Kami)',
    monthlyFee: 0,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Custom - Hubungi Kami (Kuota Khusus Skala Besar & Kebutuhan Spesifik)',
  },
  // Alias untuk kompatibilitas data lama
  PAKET_250K: {
    code: 'PAKET_CUSTOM',
    name: 'Paket 5: Custom (Hubungi Kami)',
    monthlyFee: 0,
    dailyTxLimit: 0,
    monthlyTxLimit: 0,
    description: 'Custom - Hubungi Kami (Kuota Khusus Skala Besar & Kebutuhan Spesifik)',
  },
};

/**
 * Normalisasi paket Protek berdasarkan kode atau nominal tarif bulanan
 */
export const getPackageByCodeOrFee = (codeOrFee?: string | number): PackagePlan => {
  if (!codeOrFee) return PROTEK_PACKAGES.PAKET_150K;

  if (typeof codeOrFee === 'number') {
    if (codeOrFee <= 50000) return PROTEK_PACKAGES.PAKET_50K;
    if (codeOrFee <= 100000) return PROTEK_PACKAGES.PAKET_100K;
    if (codeOrFee <= 150000) return PROTEK_PACKAGES.PAKET_150K;
    if (codeOrFee <= 200000) return PROTEK_PACKAGES.PAKET_200K;
    return PROTEK_PACKAGES.PAKET_CUSTOM;
  }

  const upper = String(codeOrFee).toUpperCase().trim();
  if (PROTEK_PACKAGES[upper]) return PROTEK_PACKAGES[upper];

  // Map dari nama lama ke paket baru
  if (upper.includes('50') || upper.includes('HEMAT')) return PROTEK_PACKAGES.PAKET_50K;
  if (upper.includes('100') || upper.includes('STARTER')) return PROTEK_PACKAGES.PAKET_100K;
  if (upper.includes('150') || upper.includes('GROWTH') || upper.includes('STANDARD') || upper.includes('BISNIS')) return PROTEK_PACKAGES.PAKET_150K;
  if (upper.includes('200') || upper.includes('PRO')) return PROTEK_PACKAGES.PAKET_200K;
  if (upper.includes('CUSTOM') || upper.includes('250') || upper.includes('UNLIMITED') || upper.includes('ENTERPRISE')) return PROTEK_PACKAGES.PAKET_CUSTOM;

  return PROTEK_PACKAGES.PAKET_150K;
};
