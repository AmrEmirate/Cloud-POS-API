export type OpnameVarianceStatus = 'NORMAL' | 'LEAKAGE' | 'SURPLUS';

export interface OpnameCalculationInput {
  openingStock: number;
  restockIn: number;
  theoreticalUsed: number;
  actualClosing: number;
  costPerUnit: number;
}

export interface OpnameCalculationResult {
  openingStock: number;
  restockIn: number;
  theoreticalUsed: number;
  expectedClosing: number;
  actualClosing: number;
  actualUsed: number;
  variance: number;
  varianceValue: number;
  status: OpnameVarianceStatus;
}

/**
 * Menghitung pemakaian teoritis vs fisik bahan baku saat tutup shift.
 * variance = actualClosing - expectedClosing
 * - Negatif (LEAKAGE): stok fisik lebih sedikit dari seharusnya (indikasi kecurangan / bahan hilang)
 * - Positif (SURPLUS): stok fisik lebih banyak dari seharusnya (indikasi salah input menu lebih mahal)
 */
export function calculateShiftOpnameItem(input: OpnameCalculationInput): OpnameCalculationResult {
  const openingStock = Number(input.openingStock) || 0;
  const restockIn = Number(input.restockIn) || 0;
  const theoreticalUsed = Number(input.theoreticalUsed) || 0;
  const actualClosing = Number(input.actualClosing) || 0;
  const costPerUnit = Number(input.costPerUnit) || 0;

  const expectedClosing = Number((openingStock + restockIn - theoreticalUsed).toFixed(2));
  const actualUsed = Number((openingStock + restockIn - actualClosing).toFixed(2));
  const variance = Number((actualClosing - expectedClosing).toFixed(2));
  const varianceValue = Number((variance * costPerUnit).toFixed(2));

  let status: OpnameVarianceStatus = 'NORMAL';
  if (variance <= -0.01) {
    status = 'LEAKAGE';
  } else if (variance >= 0.01) {
    status = 'SURPLUS';
  }

  return {
    openingStock,
    restockIn,
    theoreticalUsed,
    expectedClosing,
    actualClosing,
    actualUsed,
    variance,
    varianceValue,
    status,
  };
}
