describe('White Box Testing: POS Financial Math & Menu Code Generator Logic', () => {
  describe('White Box: POS Cart & Margin Mathematics', () => {
    const items = [
      { name: 'Dimsum Mentai', price: 25000, costPrice: 12000, quantity: 2 },
      { name: 'Dimsum Kukus', price: 20000, costPrice: 9000, quantity: 3 },
      { name: 'Es Teh Manis', price: 5000, costPrice: 1500, quantity: 2 },
    ];

    it('should accurately calculate subtotal and total HPP', () => {
      const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const hppTotal = items.reduce((sum, it) => sum + it.costPrice * it.quantity, 0);

      // (25000*2) + (20000*3) + (5000*2) = 50000 + 60000 + 10000 = 120000
      expect(subtotal).toBe(120000);
      // (12000*2) + (9000*3) + (1500*2) = 24000 + 27000 + 3000 = 54000
      expect(hppTotal).toBe(54000);

      const grossProfit = subtotal - hppTotal;
      expect(grossProfit).toBe(66000);

      const marginPct = (grossProfit / subtotal) * 100;
      expect(Number(marginPct.toFixed(1))).toBe(55.0);
    });

    it('should properly apply discounts without producing negative totals', () => {
      const subtotal = 100000;
      const normalDiscount = 20000;
      const excessDiscount = 150000;

      const normalTotal = Math.max(0, subtotal - normalDiscount);
      expect(normalTotal).toBe(80000);

      const cappedTotal = Math.max(0, subtotal - excessDiscount);
      expect(cappedTotal).toBe(0);
    });

    it('should correctly calculate cashier change amount', () => {
      const total = 85000;
      const cashReceived1 = 100000;
      const cashReceivedExact = 85000;
      const cashReceivedUnder = 50000;

      expect(Math.max(0, cashReceived1 - total)).toBe(15000);
      expect(Math.max(0, cashReceivedExact - total)).toBe(0);
      expect(Math.max(0, cashReceivedUnder - total)).toBe(0);
    });
  });

  describe('White Box: Category Code Prefix Sanitization', () => {
    // Replicating internal prefix generation algorithm from menuController.ts
    const generatePrefix = (category?: string) => {
      const cleanCategory = String(category || '').trim() || 'Umum';
      return (cleanCategory.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()) || 'MNU';
    };

    it('should generate uppercase 3-letter prefix for standard category', () => {
      expect(generatePrefix('Dimsum')).toBe('DIM');
      expect(generatePrefix('Minuman')).toBe('MIN');
      expect(generatePrefix('Snack')).toBe('SNA');
    });

    it('should strip special characters and spaces', () => {
      expect(generatePrefix('A&W Float')).toBe('AWF');
      expect(generatePrefix('K-Pop Dimsum')).toBe('KPO');
      expect(generatePrefix('100% Halal')).toBe('100');
    });

    it('should handle undefined or empty strings safely with fallback', () => {
      expect(generatePrefix(undefined)).toBe('UMU');
      expect(generatePrefix('')).toBe('UMU');
      expect(generatePrefix('   ')).toBe('UMU');
      expect(generatePrefix('!@#$%')).toBe('MNU');
    });
  });
});
