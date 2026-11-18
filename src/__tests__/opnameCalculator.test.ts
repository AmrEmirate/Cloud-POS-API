import { calculateShiftOpnameItem } from '../utils/opnameCalculator';

describe('calculateShiftOpnameItem - Anti-Fraud Stock Opname Math', () => {
  it('returns NORMAL when actual closing matches expected closing', () => {
    // 100 dimsum awal + 0 restock - (10 porsi * 4 pcs = 40) = 60 expected
    const res = calculateShiftOpnameItem({
      openingStock: 100,
      restockIn: 0,
      theoreticalUsed: 40,
      actualClosing: 60,
      costPerUnit: 2500,
    });
    expect(res.expectedClosing).toBe(60);
    expect(res.actualUsed).toBe(40);
    expect(res.variance).toBe(0);
    expect(res.varianceValue).toBe(0);
    expect(res.status).toBe('NORMAL');
  });

  it('detects LEAKAGE when physical stock is lower than expected (kasir jual tanpa input / input menu lebih murah)', () => {
    // Awal 50 foil, terjual Mentai 10 (expected sisa 40), tapi fisik sisa 35 -> 5 foil hilang!
    const res = calculateShiftOpnameItem({
      openingStock: 50,
      restockIn: 0,
      theoreticalUsed: 10,
      actualClosing: 35,
      costPerUnit: 1200,
    });
    expect(res.expectedClosing).toBe(40);
    expect(res.actualUsed).toBe(15);
    expect(res.variance).toBe(-5);
    expect(res.varianceValue).toBe(-6000);
    expect(res.status).toBe('LEAKAGE');
  });

  it('detects SURPLUS when physical stock is higher than expected (kasir input Mentai tapi kasih Biasa)', () => {
    // Awal 50 foil, POS catat Mentai 10 (expected sisa 40), tapi fisik sisa 44 -> 4 foil tidak terpakai!
    const res = calculateShiftOpnameItem({
      openingStock: 50,
      restockIn: 0,
      theoreticalUsed: 10,
      actualClosing: 44,
      costPerUnit: 1200,
    });
    expect(res.expectedClosing).toBe(40);
    expect(res.actualUsed).toBe(6);
    expect(res.variance).toBe(4);
    expect(res.varianceValue).toBe(4800);
    expect(res.status).toBe('SURPLUS');
  });

  it('accounts for restockIn during active shift', () => {
    // Awal 20 + Restock 30 - Terpakai 15 = Expected 35; Fisik 35 -> NORMAL
    const res = calculateShiftOpnameItem({
      openingStock: 20,
      restockIn: 30,
      theoreticalUsed: 15,
      actualClosing: 35,
      costPerUnit: 1000,
    });
    expect(res.expectedClosing).toBe(35);
    expect(res.variance).toBe(0);
    expect(res.status).toBe('NORMAL');
  });
});
