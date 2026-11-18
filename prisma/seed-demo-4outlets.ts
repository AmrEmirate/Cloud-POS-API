import { PrismaClient, OrderType, PaymentMethod, OrderStatus, ShiftStatus, PettyCashCategory, PettyCashStatus, InvoiceStatus, FixedExpenseCategory, ExpenseStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'tenant-dimsum-intan';

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} tidak ditemukan di dimsum_db`);
  }

  // Pastikan kuota maxOutlets cukup untuk 4 cabang
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { maxOutlets: 5 },
  });

  // 1. Pastikan ada 4 Outlet (CB-01, CB-02, CB-03, CB-04)
  const outletDefs = [
    {
      code: 'CB-01',
      name: 'Dimsum Intan - Resto Pusat (Jl. Jakarta)',
      city: 'Bandung',
      address: 'Jl. Jakarta No. 45, Antapani, Bandung',
      phone: '0812-2001-0001',
      targetDailySales: 4500000,
    },
    {
      code: 'CB-02',
      name: 'Dimsum Intan - Cabang Dago',
      city: 'Bandung',
      address: 'Jl. Ir. H. Juanda No. 112, Dago, Bandung',
      phone: '0812-2001-0002',
      targetDailySales: 3500000,
    },
    {
      code: 'CB-03',
      name: 'Dimsum Intan - Cabang Setiabudi',
      city: 'Bandung',
      address: 'Jl. Dr. Setiabudi No. 88, Bandung',
      phone: '0812-2001-0003',
      targetDailySales: 3200000,
    },
    {
      code: 'CB-04',
      name: 'Dimsum Intan - Cabang Buah Batu',
      city: 'Bandung',
      address: 'Jl. Buah Batu No. 210, Bandung',
      phone: '0812-2001-0004',
      targetDailySales: 3000000,
    },
  ];

  const outlets = [];
  for (const od of outletDefs) {
    const o = await prisma.outlet.upsert({
      where: { tenantId_code: { tenantId, code: od.code } },
      update: { name: od.name, city: od.city, address: od.address, phone: od.phone, targetDailySales: od.targetDailySales },
      create: { tenantId, ...od },
    });
    outlets.push(o);
  }

  // Ambil user kasir & owner
  const users = await prisma.user.findMany({ where: { tenantId } });
  const cashierUser = users.find((u) => u.role === 'KASIR') || users[0];
  const ownerUser = users.find((u) => u.role === 'OWNER') || users[0];
  if (!cashierUser || !ownerUser) {
    throw new Error('User tidak ditemukan untuk tenant-dimsum-intan');
  }

  // 2. Seed 10 Menu Items
  const menuDefs = [
    { code: 'MNT-001', name: 'Dimsum Mentai Original', category: 'Mentai', price: 28000, costPrice: 12500, stock: 120 },
    { code: 'MNT-002', name: 'Dimsum Mentai Mozzarella', category: 'Mentai', price: 33000, costPrice: 15000, stock: 95 },
    { code: 'KKS-001', name: 'Dimsum Ayam Biasa (Kukus)', category: 'Kukus', price: 20000, costPrice: 9000, stock: 180 },
    { code: 'KKS-002', name: 'Hakau Udang Premium', category: 'Kukus', price: 24000, costPrice: 11000, stock: 85 },
    { code: 'KKS-003', name: 'Siomay Kepiting', category: 'Kukus', price: 23000, costPrice: 10500, stock: 90 },
    { code: 'GRG-001', name: 'Dimsum Udang Rambutan', category: 'Goreng', price: 22000, costPrice: 10000, stock: 110 },
    { code: 'GRG-002', name: 'Lumpia Kulit Tahu', category: 'Goreng', price: 21000, costPrice: 9500, stock: 100 },
    { code: 'GRG-003', name: 'Gyoza Panggang', category: 'Goreng', price: 25000, costPrice: 11500, stock: 75 },
    { code: 'MNM-001', name: 'Es Teh Lemon Segar', category: 'Minuman', price: 10000, costPrice: 3000, stock: 200 },
    { code: 'MNM-002', name: 'Teh Tarik Dingin', category: 'Minuman', price: 15000, costPrice: 5500, stock: 150 },
  ];

  const menus = [];
  for (const md of menuDefs) {
    const m = await prisma.menuItem.upsert({
      where: { tenantId_code: { tenantId, code: md.code } },
      update: { name: md.name, category: md.category, price: md.price, costPrice: md.costPrice, stock: md.stock, isDeleted: false },
      create: { tenantId, ...md, description: `${md.name} favorit pelanggan Dimsum Intan` },
    });
    menus.push(m);
  }

  // 3. Seed Bahan Baku (RawMaterial) & Resep (MenuRecipeItem)
  const existingMats = await prisma.rawMaterial.findMany({ where: { tenantId, isDeleted: false } });
  const matDefs = [
    { name: 'Dimsum Ayam (Butir)', unit: 'pcs', costPerUnit: 1800, currentStock: 400, minStock: 80 },
    { name: 'Aluminium Foil', unit: 'pcs', costPerUnit: 1200, currentStock: 150, minStock: 30 },
    { name: 'Saus Mentai', unit: 'gr', costPerUnit: 150, currentStock: 3500, minStock: 600 },
    { name: 'Sumpit Bambu', unit: 'pasang', costPerUnit: 300, currentStock: 300, minStock: 50 },
    { name: 'Box Mika Biasa', unit: 'pcs', costPerUnit: 800, currentStock: 200, minStock: 40 },
    { name: 'Keju Mozzarella', unit: 'gr', costPerUnit: 220, currentStock: 1200, minStock: 250 },
  ];

  const mats: Record<string, any> = {};
  for (const md of matDefs) {
    let found = existingMats.find((e) => e.name === md.name);
    if (!found) {
      found = await prisma.rawMaterial.create({ data: { tenantId, ...md } });
    }
    mats[md.name] = found;
  }

  // Link Resep untuk Dimsum Mentai & Dimsum Biasa
  const mentaiOri = menus.find((m) => m.code === 'MNT-001');
  const mentaiMozza = menus.find((m) => m.code === 'MNT-002');
  const dimsumBiasa = menus.find((m) => m.code === 'KKS-001');

  const recipeAssignments: Array<{ menuId: string; items: Array<{ rawMaterialId: string; quantityUsed: number }> }> = [];
  if (mentaiOri) {
    recipeAssignments.push({
      menuId: mentaiOri.id,
      items: [
        { rawMaterialId: mats['Dimsum Ayam (Butir)'].id, quantityUsed: 4 },
        { rawMaterialId: mats['Aluminium Foil'].id, quantityUsed: 1 },
        { rawMaterialId: mats['Saus Mentai'].id, quantityUsed: 30 },
        { rawMaterialId: mats['Sumpit Bambu'].id, quantityUsed: 1 },
      ],
    });
  }
  if (mentaiMozza) {
    recipeAssignments.push({
      menuId: mentaiMozza.id,
      items: [
        { rawMaterialId: mats['Dimsum Ayam (Butir)'].id, quantityUsed: 4 },
        { rawMaterialId: mats['Aluminium Foil'].id, quantityUsed: 1 },
        { rawMaterialId: mats['Saus Mentai'].id, quantityUsed: 30 },
        { rawMaterialId: mats['Keju Mozzarella'].id, quantityUsed: 20 },
        { rawMaterialId: mats['Sumpit Bambu'].id, quantityUsed: 1 },
      ],
    });
  }
  if (dimsumBiasa) {
    recipeAssignments.push({
      menuId: dimsumBiasa.id,
      items: [
        { rawMaterialId: mats['Dimsum Ayam (Butir)'].id, quantityUsed: 4 },
        { rawMaterialId: mats['Box Mika Biasa'].id, quantityUsed: 1 },
        { rawMaterialId: mats['Sumpit Bambu'].id, quantityUsed: 1 },
      ],
    });
  }

  for (const ra of recipeAssignments) {
    await prisma.menuRecipeItem.deleteMany({ where: { menuId: ra.menuId } });
    await prisma.menuRecipeItem.createMany({
      data: ra.items.map((it) => ({ menuId: ra.menuId, ...it })),
    });
  }

  // 4. Seed minimal 10 data dummy per Outlet (Orders, Shifts, Opname Audit, PettyCash)
  const matList = Object.values(mats);
  const now = Date.now();

  for (let oIdx = 0; oIdx < outlets.length; oIdx++) {
    const outlet = outlets[oIdx];
    const outletCodeClean = outlet.code.replace('-', '');

    // 4a. 12 Orders per outlet
    for (let i = 1; i <= 12; i++) {
      const invNo = `INV-${outletCodeClean}-DEMO-${String(i).padStart(3, '0')}`;
      const existingOrder = await prisma.order.findUnique({ where: { invoiceNumber: invNo } });
      if (!existingOrder) {
        const m1 = menus[(i + oIdx) % menus.length];
        const m2 = menus[(i + oIdx + 2) % menus.length];
        const q1 = (i % 3) + 1;
        const q2 = (i % 2) + 1;
        const subtotal = Number(m1.price) * q1 + Number(m2.price) * q2;
        const hppTotal = Number(m1.costPrice) * q1 + Number(m2.costPrice) * q2;
        const isCash = i % 2 === 1;
        const createdAt = new Date(now - (12 - i) * 3600 * 1000 * 4);

        await prisma.order.create({
          data: {
            tenantId,
            invoiceNumber: invNo,
            outletId: outlet.id,
            orderType: i % 3 === 0 ? OrderType.TAKEAWAY : OrderType.DINE_IN,
            tableNumber: i % 3 === 0 ? null : `Meja ${i}`,
            customerName: `Pelanggan ${outletCodeClean}-${i}`,
            subtotal,
            discount: 0,
            total: subtotal,
            hppTotal,
            paymentMethod: isCash ? PaymentMethod.CASH : PaymentMethod.QRIS,
            cashReceived: isCash ? subtotal + 10000 : null,
            changeAmount: isCash ? 10000 : null,
            cashierId: cashierUser.id,
            status: OrderStatus.PAID,
            createdAt,
            items: {
              create: [
                { menuId: m1.id, name: m1.name, price: m1.price, costPrice: m1.costPrice, quantity: q1 },
                { menuId: m2.id, name: m2.name, price: m2.price, costPrice: m2.costPrice, quantity: q2 },
              ],
            },
          },
        });
      }
    }

    // 4b. 10 Closed ShiftSessions + 10 ShiftMaterialOpnames per outlet
    const existingShiftsCount = await prisma.shiftSession.count({ where: { outletId: outlet.id } });
    if (existingShiftsCount < 10) {
      for (let s = existingShiftsCount + 1; s <= 10; s++) {
        const startTime = new Date(now - (11 - s) * 24 * 3600 * 1000);
        const endTime = new Date(startTime.getTime() + 8 * 3600 * 1000);
        const cashSales = 850000 + s * 75000 + oIdx * 50000;
        const qrisSales = 620000 + s * 45000;
        const startingCash = 500000;
        const expectedCash = startingCash + cashSales;
        const varianceCash = s % 4 === 0 ? -15000 : 0;

        const shift = await prisma.shiftSession.create({
          data: {
            tenantId,
            shiftName: `Shift ${s % 2 === 1 ? 'Pagi' : 'Malam'} #${s}`,
            outletId: outlet.id,
            cashierId: cashierUser.id,
            terminalId: `POS-${outletCodeClean}`,
            startTime,
            endTime,
            startingCash,
            cashSales,
            qrisSales,
            pettyCashOut: 0,
            expectedCash,
            actualEndingCash: expectedCash + varianceCash,
            difference: varianceCash,
            notes: varianceCash < 0 ? 'Selisih kecil saat tutup shift' : 'Kas seimbang',
            status: ShiftStatus.CLOSED,
          },
        });

        // Buat 1 log opname bahan baku per shift (campuran NORMAL, LEAKAGE, SURPLUS)
        const mat = matList[(s + oIdx) % matList.length];
        const openingStock = 100 + s * 10;
        const theoreticalUsed = 20 + s * 2;
        const expectedClosing = openingStock - theoreticalUsed;
        const varianceQty = s % 3 === 0 ? -3 : s % 5 === 0 ? 2 : 0;
        const actualClosing = expectedClosing + varianceQty;
        const status = varianceQty < 0 ? 'LEAKAGE' : varianceQty > 0 ? 'SURPLUS' : 'NORMAL';

        await prisma.shiftMaterialOpname.create({
          data: {
            tenantId,
            shiftId: shift.id,
            rawMaterialId: mat.id,
            openingStock,
            restockIn: 0,
            theoreticalUsed,
            expectedClosing,
            actualClosing,
            variance: varianceQty,
            varianceValue: varianceQty * Number(mat.costPerUnit),
            status,
            notes:
              status === 'LEAKAGE'
                ? 'Indikasi kebocoran bahan tidak tercatat di POS'
                : status === 'SURPLUS'
                ? 'Indikasi salah input menu lebih mahal'
                : 'Pemakaian cocok dengan POS',
          },
        });
      }
    }

    // 4c. 10 PettyCash per outlet
    const pcCategories = [
      PettyCashCategory.ES_BATU,
      PettyCashCategory.GALON_AIR,
      PettyCashCategory.PLASTIK_KEMASAN,
      PettyCashCategory.KEBERSIHAN,
      PettyCashCategory.LAINNYA,
    ];
    for (let p = 1; p <= 10; p++) {
      const expNo = `PC-${outletCodeClean}-DEMO-${String(p).padStart(3, '0')}`;
      const exists = await prisma.pettyCash.findUnique({ where: { expenseNumber: expNo } });
      if (!exists) {
        await prisma.pettyCash.create({
          data: {
            tenantId,
            expenseNumber: expNo,
            outletId: outlet.id,
            cashierId: cashierUser.id,
            amount: 15000 + p * 5000,
            category: pcCategories[p % pcCategories.length],
            description: `Pengeluaran operasional ${outlet.code} #${p}`,
            status: p <= 7 ? PettyCashStatus.DISETUJUI : PettyCashStatus.MENUNGGU_VERIFIKASI,
            verifiedById: p <= 7 ? ownerUser.id : null,
            verifiedAt: p <= 7 ? new Date() : null,
          },
        });
      }
    }
    // 4d. 5 FactoryInvoice per outlet (LUNAS, BELUM_LUNAS, JATUH_TEMPO)
    const factorySamples = [
      { itemName: 'Dimsum Siomay Ayam Beku (Pouch 100 pcs)', qty: 10, unit: 'Pouch', unitCost: 650000, status: InvoiceStatus.LUNAS },
      { itemName: 'Saus Mentai Spesial & Chili Oil (Jerigen 5L)', qty: 4, unit: 'Jerigen', unitCost: 320000, status: InvoiceStatus.LUNAS },
      { itemName: 'Dimsum Udang & Nori Beku (Pouch 100 pcs)', qty: 8, unit: 'Pouch', unitCost: 720000, status: InvoiceStatus.BELUM_LUNAS },
      { itemName: 'Aluminium Foil & Box Mika Kemasan (Pack 500)', qty: 6, unit: 'Pack', unitCost: 280000, status: InvoiceStatus.BELUM_LUNAS },
      { itemName: 'Dimsum Kepiting & Kulit Tahu (Pouch 100 pcs)', qty: 5, unit: 'Pouch', unitCost: 750000, status: InvoiceStatus.JATUH_TEMPO },
    ];
    for (let f = 0; f < factorySamples.length; f++) {
      const sample = factorySamples[f];
      const invNum = `FAC-${outletCodeClean}-DEMO-${String(f + 1).padStart(3, '0')}`;
      const existingInv = await prisma.factoryInvoice.findUnique({ where: { invoiceNumber: invNum } });
      if (!existingInv) {
        const issueDate = new Date(Date.now() - (15 - f * 2) * 86400_000);
        const dueDate =
          sample.status === InvoiceStatus.JATUH_TEMPO
            ? new Date(Date.now() - 2 * 86400_000)
            : new Date(Date.now() + (7 + f * 3) * 86400_000);
        const total = sample.qty * sample.unitCost;

        await prisma.factoryInvoice.create({
          data: {
            tenantId,
            invoiceNumber: invNum,
            supplierName: 'PT Dimsum Prima Rasa (Pabrik Pusat)',
            outletId: outlet.id,
            issueDate,
            dueDate,
            totalAmount: total,
            status: sample.status,
            bankAccount: 'BCA 7788-990-112',
            paidAt: sample.status === InvoiceStatus.LUNAS ? new Date(Date.now() - (5 - f) * 86400_000) : null,
            items: {
              create: [
                {
                  itemName: sample.itemName,
                  quantity: sample.qty,
                  unit: sample.unit,
                  unitCost: sample.unitCost,
                  total,
                },
              ],
            },
          },
        });
      }
    }
    // 4e. 5 FixedExpense (Beban Operasional Tetap) per outlet
    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    const fixedSamples = [
      { title: `Sewa Lapak & Ruko ${outlet.name}`, category: FixedExpenseCategory.SEWA_LAPAK, amount: 3500000, status: ExpenseStatus.LUNAS, autoDebet: true },
      { title: `Gaji Karyawan & Kasir ${outlet.name}`, category: FixedExpenseCategory.PAYROLL_GAJI, amount: 4200000, status: ExpenseStatus.LUNAS, autoDebet: false },
      { title: `Tagihan Listrik PLN ${outlet.name}`, category: FixedExpenseCategory.LISTRIK, amount: 850000, status: ExpenseStatus.TERJADWAL, autoDebet: true },
      { title: `Tagihan Air PDAM ${outlet.name}`, category: FixedExpenseCategory.AIR, amount: 275000, status: ExpenseStatus.TERJADWAL, autoDebet: false },
      { title: `Internet & Kuota POS ${outlet.name}`, category: FixedExpenseCategory.INTERNET_POS, amount: 350000, status: ExpenseStatus.LUNAS, autoDebet: true },
    ];
    for (let x = 0; x < fixedSamples.length; x++) {
      const fx = fixedSamples[x];
      const code = `OPEX-${outletCodeClean}-DEMO-${String(x + 1).padStart(3, '0')}`;
      const existsFx = await prisma.fixedExpense.findUnique({ where: { code } });
      if (!existsFx) {
        await prisma.fixedExpense.create({
          data: {
            tenantId,
            code,
            title: fx.title,
            category: fx.category,
            outletId: outlet.id,
            amount: fx.amount,
            period: currentPeriod,
            status: fx.status,
            dueDate: new Date(Date.now() + (5 + x * 3) * 86400_000),
            autoDebet: fx.autoDebet,
          },
        });
      }
    }
  }

  console.log('✅ Seed 4 outlets (>=10 data per outlet) selesai untuk tenant-dimsum-intan!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
