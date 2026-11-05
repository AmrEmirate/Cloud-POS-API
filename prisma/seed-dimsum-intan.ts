import { PrismaClient, Role, OrderType, PaymentMethod, OrderStatus, ShiftStatus, PettyCashCategory, PettyCashStatus, InvoiceStatus, FixedExpenseCategory, ExpenseStatus } from '@prisma/client';
// @ts-ignore
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedDimsumIntan() {
  console.log('🥢 [SEED] Mulai Seeding Data Dummy Lengkap Dimsum Intan...');

  const tenantId = 'tenant-dimsum-intan';

  // 1. Upsert Tenant Dimsum Intan
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dimsum-intan' },
    update: {
      name: 'Dimsum Intan',
      themeColor: '#ea580c',
      plan: 'PAKET_250K',
      status: 'ACTIVE',
      pricePerOutlet: 150000,
      maxOutlets: 10,
      dailyTxLimitPerOutlet: 500,
      walletBalance: 24750000,
      bankName: 'BCA',
      bankAccountNumber: '8730991288',
      bankAccountName: 'CV DIMSUM INTAN JAYA',
      paymentGatewayProvider: 'DUITKU',
      paymentGatewayEnabled: true,
      licenseKey: 'LIC-DIMSUM-INTAN-PRO-2026',
      themeConfig: {
        storeName: 'Dimsum Intan - Artisanal Dimsum & Tea House',
        primaryColor: '#ea580c',
        secondaryColor: '#f97316',
        accentColor: '#10b981',
        surfaceColor: '#ffffff',
        textColor: '#1f2937',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        category: 'Artisanal Dimsum & Chinese Tea F&B',
      },
    },
    create: {
      id: tenantId,
      name: 'Dimsum Intan',
      slug: 'dimsum-intan',
      themeColor: '#ea580c',
      plan: 'PAKET_250K',
      status: 'ACTIVE',
      pricePerOutlet: 150000,
      maxOutlets: 10,
      dailyTxLimitPerOutlet: 500,
      walletBalance: 24750000,
      bankName: 'BCA',
      bankAccountNumber: '8730991288',
      bankAccountName: 'CV DIMSUM INTAN JAYA',
      paymentGatewayProvider: 'DUITKU',
      paymentGatewayEnabled: true,
      licenseKey: 'LIC-DIMSUM-INTAN-PRO-2026',
      themeConfig: {
        storeName: 'Dimsum Intan - Artisanal Dimsum & Tea House',
        primaryColor: '#ea580c',
        secondaryColor: '#f97316',
        accentColor: '#10b981',
        surfaceColor: '#ffffff',
        textColor: '#1f2937',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        category: 'Artisanal Dimsum & Chinese Tea F&B',
      },
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.slug}) siap.`);

  // 2. Upsert Outlets: Outlet 1 (Dago) & Outlet 2 (Gandapura)
  const outlet1 = await prisma.outlet.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'otlate1',
      },
    },
    update: {
      name: 'Outlet 1 - Dago Pusat',
      city: 'Bandung',
      address: 'Jl. Ir. H. Juanda No. 128, Dago, Bandung',
      phone: '0812-2233-4455',
      targetDailySales: 5000000,
    },
    create: {
      id: 'outlet-dimsum-dago',
      tenantId: tenant.id,
      code: 'otlate1',
      name: 'Outlet 1 - Dago Pusat',
      city: 'Bandung',
      address: 'Jl. Ir. H. Juanda No. 128, Dago, Bandung',
      phone: '0812-2233-4455',
      targetDailySales: 5000000,
    },
  });

  const outlet2 = await prisma.outlet.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'otlate2',
      },
    },
    update: {
      name: 'Outlet 2 - Gandapura Kitchen',
      city: 'Bandung',
      address: 'Jl. Gandapura No. 45, Riau, Bandung',
      phone: '0813-9988-7766',
      targetDailySales: 4500000,
    },
    create: {
      id: 'outlet-dimsum-gandapura',
      tenantId: tenant.id,
      code: 'otlate2',
      name: 'Outlet 2 - Gandapura Kitchen',
      city: 'Bandung',
      address: 'Jl. Gandapura No. 45, Riau, Bandung',
      phone: '0813-9988-7766',
      targetDailySales: 4500000,
    },
  });

  console.log(`✅ Outlets: ${outlet1.name} (${outlet1.code}) & ${outlet2.name} (${outlet2.code}) siap.`);

  // 3. Upsert Users (Owner, Supervisor, Kasir 1, Kasir 2)
  const passwordOwner = await bcrypt.hash('owner123', 8);
  const passwordKasir = await bcrypt.hash('kasir123', 8);
  const pinSpv = await bcrypt.hash('1234', 8);
  const pinOwner = await bcrypt.hash('9999', 8);

  const owner = await prisma.user.upsert({
    where: { username: 'owner' },
    update: {
      tenantId: tenant.id,
      name: 'Ibu Intan Permata (Owner)',
      role: Role.OWNER,
    },
    create: {
      id: 'usr_owner_dimsum',
      tenantId: tenant.id,
      name: 'Ibu Intan Permata (Owner)',
      username: 'owner',
      passwordHash: passwordOwner,
      pinHash: pinOwner,
      role: Role.OWNER,
      outletId: null,
    },
  });

  const spv = await prisma.user.upsert({
    where: { username: 'spv_dimsum' },
    update: {
      tenantId: tenant.id,
      outletId: outlet1.id,
      name: 'Bima Santoso (Supervisor Operasional)',
      role: Role.SUPERVISOR,
    },
    create: {
      id: 'usr_spv_dimsum',
      tenantId: tenant.id,
      outletId: outlet1.id,
      name: 'Bima Santoso (Supervisor Operasional)',
      username: 'spv_dimsum',
      passwordHash: passwordOwner,
      pinHash: pinSpv,
      role: Role.SUPERVISOR,
    },
  });

  const kasir1 = await prisma.user.upsert({
    where: { username: 'kasir1' },
    update: {
      tenantId: tenant.id,
      outletId: outlet1.id,
      name: 'Rian Pratama (Kasir Dago)',
      role: Role.KASIR,
    },
    create: {
      id: 'usr_kasir_dago',
      tenantId: tenant.id,
      outletId: outlet1.id,
      name: 'Rian Pratama (Kasir Dago)',
      username: 'kasir1',
      passwordHash: passwordKasir,
      pinHash: pinSpv,
      role: Role.KASIR,
    },
  });

  const kasir2 = await prisma.user.upsert({
    where: { username: 'kasir2' },
    update: {
      tenantId: tenant.id,
      outletId: outlet2.id,
      name: 'Siti Nurhaliza (Kasir Gandapura)',
      role: Role.KASIR,
    },
    create: {
      id: 'usr_kasir_gandapura',
      tenantId: tenant.id,
      outletId: outlet2.id,
      name: 'Siti Nurhaliza (Kasir Gandapura)',
      username: 'kasir2',
      passwordHash: passwordKasir,
      pinHash: pinSpv,
      role: Role.KASIR,
    },
  });

  console.log(`✅ Users: Owner (owner), SPV (spv_dimsum), Kasir Dago (kasir1), Kasir Gandapura (kasir2) siap.`);

  // 4. Upsert 20 Artisanal Dimsum Menu Items
  const menuList = [
    // Kukus
    {
      code: 'DM-001',
      name: 'Siomay Ayam Udang Special',
      category: 'Kukus',
      price: 22000,
      costPrice: 9500,
      stock: 120,
      description: '4 pcs siomay kukus lembut daging paha ayam segar dan cincangan udang manis gurih',
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-002',
      name: 'Hakau Udang Kristal Transparan',
      category: 'Kukus',
      price: 26000,
      costPrice: 11500,
      stock: 90,
      description: '3 pcs hakau kulit tipis kenyal bening berisi udang utuh premium renyah manis',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-003',
      name: 'Dimsum Ayam Jamur Kuping',
      category: 'Kukus',
      price: 20000,
      costPrice: 8500,
      stock: 100,
      description: '4 pcs dimsum ayam dengan irisan jamur kuping hitam kenyal beraroma minyak wijen',
      image: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-004',
      name: 'Dimsum Nori Daging Sapi Lada Hitam',
      category: 'Kukus',
      price: 25000,
      costPrice: 11000,
      stock: 80,
      description: '3 pcs gulungan rumput laut nori panggang isi cincangan daging sapi lada hitam gurih pedas',
      image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-005',
      name: 'Xiao Long Bao Ayam Kaldu Gurih',
      category: 'Kukus',
      price: 28000,
      costPrice: 12000,
      stock: 65,
      description: '4 pcs dumpling kantong kaldu ayam aromatik gurih hangat meleleh di mulut',
      image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-006',
      name: 'Pao Telur Asin Lava Meleleh',
      category: 'Kukus',
      price: 22000,
      costPrice: 9000,
      stock: 75,
      description: '2 pcs bakpao kukus super empuk dengan isian saus custard kuning telur asin manis creamy',
      image: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=400&q=80',
    },

    // Goreng
    {
      code: 'DM-007',
      name: 'Dimsum Udang Rambutan Crispy',
      category: 'Goreng',
      price: 25000,
      costPrice: 11000,
      stock: 70,
      description: '3 pcs bola udang dibalut irisan kulit pangsit renyah keemasan disajikan dengan saus asam manis',
      image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-008',
      name: 'Lumpia Kulit Tahu Udang Goreng',
      category: 'Goreng',
      price: 24000,
      costPrice: 10500,
      stock: 85,
      description: '3 pcs lumpia kulit kembang tahu goreng super renyah berisikan olahan udang dan sayuran segar',
      image: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-009',
      name: 'Pangsit Goreng Saus Mayonaise',
      category: 'Goreng',
      price: 18000,
      costPrice: 8000,
      stock: 95,
      description: '5 pcs pangsit segitiga renyah isi ayam cincang disajikan dengan cocolan saus mayonaise manis gurih',
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-010',
      name: 'Wonton Udang Pedas Crispy',
      category: 'Goreng',
      price: 23000,
      costPrice: 10000,
      stock: 60,
      description: '4 pcs wonton goreng garing renyah dibalur taburan bumbu cabai pedas Sichuan gurih',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },

    // Mentai Series
    {
      code: 'DM-011',
      name: 'Dimsum Mentai Mozzarella Torch',
      category: 'Mentai',
      price: 27000,
      costPrice: 12500,
      stock: 85,
      description: '4 pcs dimsum kukus disiram saus mentai bakar harum asap dan keju mozzarella leleh melimpah',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-012',
      name: 'Siomay Mentai Spicy Tobiko',
      category: 'Mentai',
      price: 28000,
      costPrice: 13000,
      stock: 75,
      description: '4 pcs siomay ayam bakar dengan saus mentai pedas gurih serta butiran tobiko telur ikan renyah',
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-013',
      name: 'Hakau Mentai Bakar Meleleh',
      category: 'Mentai',
      price: 30000,
      costPrice: 14000,
      stock: 55,
      description: '3 pcs hakau udang utuh dengan balutan saus mentai bakar leleh sensasi gurih mewah',
      image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80',
    },

    // Frozen & Kemasan
    {
      code: 'DM-014',
      name: 'Dimsum Frozen Siomay Ayam (Pouch 20 pcs)',
      category: 'Frozen',
      price: 85000,
      costPrice: 45000,
      stock: 40,
      description: 'Paket beku vakum higienis isi 20 butir siomay ayam lengkap dengan saus sambal racikan',
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-015',
      name: 'Hakau Udang Frozen Premium (Pouch 15 pcs)',
      category: 'Frozen',
      price: 95000,
      costPrice: 52000,
      stock: 35,
      description: 'Paket beku vakum higienis hakau udang kristal siap kukus kapan saja di rumah',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-016',
      name: 'Chili Oil Jar Spesial Dimsum Intan (200ml)',
      category: 'Frozen',
      price: 35000,
      costPrice: 16000,
      stock: 60,
      description: 'Minyak cabai renyah wangi khas rempah aromatik racikan rahasia dapur Dimsum Intan',
      image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
    },

    // Minuman
    {
      code: 'DM-017',
      name: 'Es Teh Melati Manis Intan',
      category: 'Minuman',
      price: 8000,
      costPrice: 2500,
      stock: 150,
      description: 'Seduhan teh melati tradisional wangi sejuk dengan gula tebu asli segar',
      image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-018',
      name: 'Liang Teh Herbal Dingin Tradisional',
      category: 'Minuman',
      price: 12000,
      costPrice: 4500,
      stock: 90,
      description: 'Rebusan ramuan herbal pereda panas dalam rasa manis alami menyegarkan',
      image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-019',
      name: 'Es Lemon Grass Honey Selasih',
      category: 'Minuman',
      price: 15000,
      costPrice: 5500,
      stock: 80,
      description: 'Kombinasi serai wangi, perasan lemon segar, madu murni dan biji selasih dingin',
      image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DM-020',
      name: 'Badak Sarsaparilla Float Es Krim',
      category: 'Minuman',
      price: 18000,
      costPrice: 7000,
      stock: 65,
      description: 'Minuman legendaris sarsaparilla Cap Badak dingin dengan 1 scoop es krim vanilla creamy',
      image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80',
    },
  ];

  const createdMenus: any[] = [];
  for (const m of menuList) {
    const item = await prisma.menuItem.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: m.code,
        },
      },
      update: {
        name: m.name,
        category: m.category,
        price: m.price,
        costPrice: m.costPrice,
        stock: m.stock,
        description: m.description,
        image: m.image,
        isAvailable: true,
      },
      create: {
        tenantId: tenant.id,
        code: m.code,
        name: m.name,
        category: m.category,
        price: m.price,
        costPrice: m.costPrice,
        stock: m.stock,
        description: m.description,
        image: m.image,
        isAvailable: true,
      },
    });
    createdMenus.push(item);
  }
  console.log(`✅ ${createdMenus.length} Menu Items Dimsum Intan berhasil di-seed!`);

  // 5. Shift Kasir Aktif Hari Ini & Kemarin
  const todayStart = new Date();
  todayStart.setHours(8, 0, 0, 0);

  const activeShift = await prisma.shiftSession.upsert({
    where: { id: 'shift-dimsum-dago-today' },
    update: {
      status: ShiftStatus.ACTIVE,
      startingCash: 500000,
      cashSales: 1350000,
      qrisSales: 2480000,
      pettyCashOut: 110000,
      expectedCash: 1740000, // 500.000 + 1.350.000 - 110.000
    },
    create: {
      id: 'shift-dimsum-dago-today',
      tenantId: tenant.id,
      shiftName: 'Shift Siang Kasir Dago',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      terminalId: 'POS-DAGO-01',
      startTime: todayStart,
      startingCash: 500000,
      cashSales: 1350000,
      qrisSales: 2480000,
      pettyCashOut: 110000,
      expectedCash: 1740000,
      status: ShiftStatus.ACTIVE,
      notes: 'Shift kasir berjalan lancar, stok chili oil dan es batu aman.',
    },
  });

  console.log(`✅ Sesi Shift Kasir Aktif: ${activeShift.shiftName}`);

  // 6. Transaksi Penjualan POS (12 Terbayar, 1 Voided)
  const sampleOrders = [
    {
      inv: 'INV-DIM-20261105-001',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.DINE_IN,
      table: 'Meja 02',
      customer: 'Bpk. Hendra Gunawan',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DM-001', qty: 2 },
        { code: 'DM-011', qty: 2 },
        { code: 'DM-017', qty: 4 },
      ],
      discount: 0,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-002',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.DINE_IN,
      table: 'Meja 05',
      customer: 'Ibu Ratna Juwita',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DM-002', qty: 3 },
        { code: 'DM-006', qty: 2 },
        { code: 'DM-019', qty: 3 },
      ],
      discount: 5000,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-003',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.TAKEAWAY,
      table: null,
      customer: 'Fahmi - Ojek Online',
      method: PaymentMethod.CASH,
      items: [
        { code: 'DM-001', qty: 4 },
        { code: 'DM-007', qty: 2 },
        { code: 'DM-009', qty: 2 },
      ],
      discount: 0,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-004',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.DINE_IN,
      table: 'Meja 08',
      customer: 'Komunitas Kuliner Bandung',
      method: PaymentMethod.DUITKU_QRIS,
      items: [
        { code: 'DM-001', qty: 3 },
        { code: 'DM-002', qty: 3 },
        { code: 'DM-005', qty: 3 },
        { code: 'DM-011', qty: 3 },
        { code: 'DM-018', qty: 6 },
      ],
      discount: 25000,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-005',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.TAKEAWAY,
      table: null,
      customer: 'dr. Sarah Amanda',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DM-014', qty: 2 }, // Frozen Pouch
        { code: 'DM-016', qty: 2 }, // Chili oil jar
      ],
      discount: 10000,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-006',
      outletId: outlet2.id,
      cashierId: kasir2.id,
      type: OrderType.DINE_IN,
      table: 'Meja 01',
      customer: 'Keluarga Wijaya',
      method: PaymentMethod.CASH,
      items: [
        { code: 'DM-001', qty: 2 },
        { code: 'DM-008', qty: 2 },
        { code: 'DM-020', qty: 2 },
      ],
      discount: 0,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-007',
      outletId: outlet2.id,
      cashierId: kasir2.id,
      type: OrderType.DINE_IN,
      table: 'Meja 03',
      customer: 'Dimas Aditya',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DM-012', qty: 2 },
        { code: 'DM-007', qty: 1 },
        { code: 'DM-017', qty: 2 },
      ],
      discount: 0,
      status: OrderStatus.PAID,
    },
    {
      inv: 'INV-DIM-20261105-008',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      type: OrderType.DINE_IN,
      table: 'Meja 12',
      customer: 'Tamu Meja 12 (Void)',
      method: PaymentMethod.CASH,
      items: [
        { code: 'DM-001', qty: 1 },
        { code: 'DM-017', qty: 1 },
      ],
      discount: 0,
      status: OrderStatus.VOIDED,
      voidReason: 'Pelanggan membatalkan pesanan karena salah nomor meja',
      voidedById: spv.id,
    },
  ];

  for (const o of sampleOrders) {
    let subtotal = 0;
    let hppTotal = 0;
    const itemsData: any[] = [];

    for (const it of o.items) {
      const menu = createdMenus.find((m) => m.code === it.code);
      if (menu) {
        const lineTotal = Number(menu.price) * it.qty;
        const lineHpp = Number(menu.costPrice) * it.qty;
        subtotal += lineTotal;
        hppTotal += lineHpp;
        itemsData.push({
          menuId: menu.id,
          name: menu.name,
          price: menu.price,
          costPrice: menu.costPrice,
          quantity: it.qty,
        });
      }
    }

    const total = Math.max(0, subtotal - o.discount);

    const existing = await prisma.order.findUnique({ where: { invoiceNumber: o.inv } });
    if (!existing) {
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          invoiceNumber: o.inv,
          outletId: o.outletId,
          cashierId: o.cashierId,
          orderType: o.type,
          tableNumber: o.table,
          customerName: o.customer,
          subtotal: subtotal,
          discount: o.discount,
          total: total,
          hppTotal: hppTotal,
          paymentMethod: o.method,
          cashReceived: o.method === PaymentMethod.CASH ? total + 10000 : null,
          changeAmount: o.method === PaymentMethod.CASH ? 10000 : null,
          status: o.status,
          voidReason: o.voidReason || null,
          voidedById: o.voidedById || null,
          items: {
            create: itemsData,
          },
        },
      });
    }
  }
  console.log(`✅ ${sampleOrders.length} Transaksi Penjualan Dimsum Intan siap.`);

  // 7. Kas Kecil Darurat (Petty Cash)
  const pettyCashData = [
    {
      expenseNumber: 'PC-DIM-20261105-01',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      amount: 35000,
      category: PettyCashCategory.ES_BATU,
      description: 'Beli es batu kristal 2 bal untuk chiller minuman siang',
      status: PettyCashStatus.DISETUJUI,
      verifiedById: spv.id,
    },
    {
      expenseNumber: 'PC-DIM-20261105-02',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      amount: 45000,
      category: PettyCashCategory.GALON_AIR,
      description: 'Isi ulang 3 galon air mineral operasional kukusan & seduh teh',
      status: PettyCashStatus.DISETUJUI,
      verifiedById: spv.id,
    },
    {
      expenseNumber: 'PC-DIM-20261105-03',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      amount: 75000,
      category: PettyCashCategory.PLASTIK_KEMASAN,
      description: 'Beli kantong kresek bio ramah lingkungan 5 pak untuk takeaway',
      status: PettyCashStatus.DISETUJUI,
      verifiedById: spv.id,
    },
    {
      expenseNumber: 'PC-DIM-20261105-04',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      amount: 30000,
      category: PettyCashCategory.KEBERSIHAN,
      description: 'Sabun cuci piring food-grade & spon sabut cuci klakat bambu',
      status: PettyCashStatus.DISETUJUI,
      verifiedById: spv.id,
    },
    {
      expenseNumber: 'PC-DIM-20261105-05',
      outletId: outlet1.id,
      cashierId: kasir1.id,
      amount: 25000,
      category: PettyCashCategory.LAINNYA,
      description: 'Gas LPG 3kg darurat untuk kompor kukus klakat batch 2',
      status: PettyCashStatus.MENUNGGU_VERIFIKASI,
      verifiedById: null,
    },
  ];

  for (const pc of pettyCashData) {
    await prisma.pettyCash.upsert({
      where: { expenseNumber: pc.expenseNumber },
      update: {
        amount: pc.amount,
        status: pc.status,
        description: pc.description,
      },
      create: {
        tenantId: tenant.id,
        expenseNumber: pc.expenseNumber,
        outletId: pc.outletId,
        cashierId: pc.cashierId,
        amount: pc.amount,
        category: pc.category,
        description: pc.description,
        status: pc.status,
        verifiedById: pc.verifiedById,
        verifiedAt: pc.verifiedById ? new Date() : null,
      },
    });
  }
  console.log(`✅ ${pettyCashData.length} Kas Kecil Darurat Dimsum Intan siap.`);

  // 8. Tagihan Pabrik Dimsum (Factory Invoices)
  const inv1 = await prisma.factoryInvoice.upsert({
    where: { invoiceNumber: 'INV-PABRIK-2026-001' },
    update: {
      status: InvoiceStatus.LUNAS,
      totalAmount: 4500000,
    },
    create: {
      id: 'inv-factory-01',
      tenantId: tenant.id,
      invoiceNumber: 'INV-PABRIK-2026-001',
      supplierName: 'PT Dimsum Prima Rasa Pusat',
      outletId: outlet1.id,
      issueDate: new Date('2026-11-01'),
      dueDate: new Date('2026-11-15'),
      totalAmount: 4500000,
      status: InvoiceStatus.LUNAS,
      bankAccount: 'BCA 5420-9988-11 a.n PT Dimsum Prima Rasa',
      paidAt: new Date('2026-11-02'),
      items: {
        create: [
          { itemName: 'Siomay Beku Curah Pouch 100 pcs', quantity: 15, unit: 'Pouch', unitCost: 200000, total: 3000000 },
          { itemName: 'Kulit Hakau Transparan Premium', quantity: 20, unit: 'Pack', unitCost: 50000, total: 1000000 },
          { itemName: 'Minyak Cabai & Bumbu Wijen Gurih', quantity: 5, unit: 'Dirigen', unitCost: 100000, total: 500000 },
        ],
      },
    },
  });

  const inv2 = await prisma.factoryInvoice.upsert({
    where: { invoiceNumber: 'INV-PABRIK-2026-002' },
    update: {
      status: InvoiceStatus.BELUM_LUNAS,
      totalAmount: 3250000,
    },
    create: {
      id: 'inv-factory-02',
      tenantId: tenant.id,
      invoiceNumber: 'INV-PABRIK-2026-002',
      supplierName: 'PT Dimsum Prima Rasa Pusat',
      outletId: outlet1.id,
      issueDate: new Date('2026-11-04'),
      dueDate: new Date('2026-11-18'),
      totalAmount: 3250000,
      status: InvoiceStatus.BELUM_LUNAS,
      bankAccount: 'BCA 5420-9988-11 a.n PT Dimsum Prima Rasa',
      items: {
        create: [
          { itemName: 'Daging Paha Ayam Fillet Olahan Dimsum', quantity: 50, unit: 'Kg', unitCost: 45000, total: 2250000 },
          { itemName: 'Udang Kupas Beku Grade A Premium', quantity: 10, unit: 'Kg', unitCost: 100000, total: 1000000 },
        ],
      },
    },
  });
  console.log(`✅ 2 Tagihan Pabrik Dimsum Prima Rasa siap.`);

  // 9. Biaya Operasional Tetap (Fixed Expenses)
  const fixedExpenses = [
    {
      code: 'FE-DIM-SEWA-DAGO',
      title: 'Sewa Lapak Kemitraan Kios Dago',
      category: FixedExpenseCategory.SEWA_LAPAK,
      outletId: outlet1.id,
      amount: 4000000,
      period: 'November 2026',
      status: ExpenseStatus.LUNAS,
      dueDate: new Date('2026-11-05'),
    },
    {
      code: 'FE-DIM-GAJI-DAGO',
      title: 'Payroll Gaji Tim Kasir & Cook Dago',
      category: FixedExpenseCategory.PAYROLL_GAJI,
      outletId: outlet1.id,
      amount: 7500000,
      period: 'November 2026',
      status: ExpenseStatus.LUNAS,
      dueDate: new Date('2026-11-01'),
    },
    {
      code: 'FE-DIM-LISTRIK-DAGO',
      title: 'Tagihan Listrik PLN Daya 3500VA',
      category: FixedExpenseCategory.LISTRIK,
      outletId: outlet1.id,
      amount: 1250000,
      period: 'November 2026',
      status: ExpenseStatus.TERJADWAL,
      dueDate: new Date('2026-11-10'),
    },
    {
      code: 'FE-DIM-AIR-DAGO',
      title: 'Tagihan Air PDAM Tirtawening Bandung',
      category: FixedExpenseCategory.AIR,
      outletId: outlet1.id,
      amount: 350000,
      period: 'November 2026',
      status: ExpenseStatus.TERJADWAL,
      dueDate: new Date('2026-11-15'),
    },
    {
      code: 'FE-DIM-INTERNET-DAGO',
      title: 'Internet Fiber dedicated Cloud POS Traefik',
      category: FixedExpenseCategory.INTERNET_POS,
      outletId: outlet1.id,
      amount: 450000,
      period: 'November 2026',
      status: ExpenseStatus.LUNAS,
      dueDate: new Date('2026-11-03'),
    },
  ];

  for (const fe of fixedExpenses) {
    await prisma.fixedExpense.upsert({
      where: { code: fe.code },
      update: {
        amount: fe.amount,
        status: fe.status,
      },
      create: {
        tenantId: tenant.id,
        code: fe.code,
        title: fe.title,
        category: fe.category,
        outletId: fe.outletId,
        amount: fe.amount,
        period: fe.period,
        status: fe.status,
        dueDate: fe.dueDate,
        autoDebet: false,
      },
    });
  }
  console.log(`✅ ${fixedExpenses.length} Beban Tetap Operasional Dimsum Intan siap.`);

  // 10. Saldo Dompet Digital & Penarikan Saldo
  const sampleWalletTx = [
    {
      type: 'CREDIT',
      category: 'POS_SALES',
      amount: 8500000,
      balanceBefore: 0,
      balanceAfter: 8500000,
      description: 'Settlement Otomatis QRIS & Online Dimsum Dago',
    },
    {
      type: 'CREDIT',
      category: 'POS_SALES',
      amount: 12250000,
      balanceBefore: 8500000,
      balanceAfter: 20750000,
      description: 'Settlement Otomatis QRIS Akhir Pekan Weekend Festival',
    },
    {
      type: 'DEBIT',
      category: 'WITHDRAWAL',
      amount: 5000000,
      balanceBefore: 20750000,
      balanceAfter: 15750000,
      description: 'Penarikan Saldo Hasil Usaha ke BCA CV Dimsum Intan Jaya',
    },
    {
      type: 'CREDIT',
      category: 'POS_SALES',
      amount: 9000000,
      balanceBefore: 15750000,
      balanceAfter: 24750000,
      description: 'Settlement QRIS Harian Cabang Dago & Gandapura',
    },
  ];

  for (const w of sampleWalletTx) {
    await prisma.walletTransaction.create({
      data: {
        tenantId: tenant.id,
        outletId: outlet1.id,
        type: w.type,
        category: w.category,
        amount: w.amount,
        balanceBefore: w.balanceBefore,
        balanceAfter: w.balanceAfter,
        description: w.description,
      },
    });
  }

  // Permintaan Penarikan Saldo (Withdrawal Request)
  await prisma.withdrawalRequest.upsert({
    where: { withdrawalNumber: 'WD-DIM-20261104-001' },
    update: { status: 'PROCESSED' },
    create: {
      tenantId: tenant.id,
      withdrawalNumber: 'WD-DIM-20261104-001',
      amount: 5000000,
      fee: 0,
      netAmount: 5000000,
      bankName: 'BCA',
      bankAccountNumber: '8730991288',
      bankAccountName: 'CV DIMSUM INTAN JAYA',
      status: 'PROCESSED',
      notes: 'Penarikan saldo rutin berhasil ditransfer via RTGS/BCA',
      processedAt: new Date('2026-11-04T14:30:00Z'),
    },
  });

  await prisma.withdrawalRequest.upsert({
    where: { withdrawalNumber: 'WD-DIM-20261105-002' },
    update: { status: 'PENDING' },
    create: {
      tenantId: tenant.id,
      withdrawalNumber: 'WD-DIM-20261105-002',
      amount: 2500000,
      fee: 0,
      netAmount: 2500000,
      bankName: 'BCA',
      bankAccountNumber: '8730991288',
      bankAccountName: 'CV DIMSUM INTAN JAYA',
      status: 'PENDING',
      notes: 'Menunggu proses kliring batch malam',
    },
  });

  console.log('🎉 [SEEDED] Seluruh Data Dummy Lengkap Dimsum Intan Berhasil Dimasukkan!');
}

seedDimsumIntan()
  .catch((e) => {
    console.error('❌ Gagal seeding Dimsum Intan:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
