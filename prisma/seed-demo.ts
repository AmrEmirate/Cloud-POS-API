import { PrismaClient, Role, OrderType, PaymentMethod, OrderStatus, ShiftStatus } from '@prisma/client';
// @ts-ignore
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedDemoTenant() {
  console.log('🚀 Mulai Seeding Data Dummy Showcase PT Pro Teknologi (Pro POS Demo)...');

  // 1. Upsert Tenant Pro POS Demo (slug: demo)
  const tenantId = 'tenant-demo-protek';
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {
      name: 'PT Pro Teknologi - Pro POS Demo',
      logoUrl: '/logo.png',
      themeColor: '#002045',
      themeConfig: {
        storeName: 'PT Pro Teknologi - Pro POS Demo',
        primaryColor: '#002045',
        secondaryColor: '#0284c7',
        accentColor: '#10b981',
        surfaceColor: '#f8f9ff',
        textColor: '#0d1c2e',
        fontFamily: 'Space Grotesk, Plus Jakarta Sans, sans-serif',
        logoUrl: '/logo.png',
        category: 'F&B & Retail Enterprise',
        stitchDesignSystem: 'assets/f2a8d8eecc5c40f38f9570c8c36f945f',
      },
      plan: 'PAKET_250K',
      status: 'ACTIVE',
      paymentGatewayProvider: 'SIMULATOR',
      paymentGatewayEnabled: true,
      pricePerOutlet: 250000,
      licenseKey: 'LIC-DEMO-PROTEK-2026',
    },
    create: {
      id: tenantId,
      name: 'PT Pro Teknologi - Pro POS Demo',
      slug: 'demo',
      logoUrl: '/logo.png',
      themeColor: '#002045',
      themeConfig: {
        storeName: 'PT Pro Teknologi - Pro POS Demo',
        primaryColor: '#002045',
        secondaryColor: '#0284c7',
        accentColor: '#10b981',
        surfaceColor: '#f8f9ff',
        textColor: '#0d1c2e',
        fontFamily: 'Space Grotesk, Plus Jakarta Sans, sans-serif',
        logoUrl: '/logo.png',
        category: 'F&B & Retail Enterprise',
        stitchDesignSystem: 'assets/f2a8d8eecc5c40f38f9570c8c36f945f',
      },
      plan: 'PAKET_250K',
      status: 'ACTIVE',
      paymentGatewayProvider: 'SIMULATOR',
      paymentGatewayEnabled: true,
      pricePerOutlet: 250000,
      licenseKey: 'LIC-DEMO-PROTEK-2026',
    },
  });

  console.log(`✅ Tenant Demo terdaftar: ${tenant.name} (${tenant.slug})`);

  // 2. Upsert Outlet Demo: Mall Grand Indonesia
  const outletId = 'outlet-demo-mall-gi';
  const outlet = await prisma.outlet.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: 'GI-01',
      },
    },
    update: {
      name: 'Mall Grand Indonesia Branch',
      city: 'Jakarta Pusat',
      address: 'Grand Indonesia West Mall Lt. 3A, Jl. M.H. Thamrin No.1',
      phone: '021-23580001',
      targetDailySales: 20000000,
    },
    create: {
      id: outletId,
      tenantId: tenant.id,
      code: 'GI-01',
      name: 'Mall Grand Indonesia Branch',
      city: 'Jakarta Pusat',
      address: 'Grand Indonesia West Mall Lt. 3A, Jl. M.H. Thamrin No.1',
      phone: '021-23580001',
      targetDailySales: 20000000,
    },
  });

  console.log(`✅ Outlet Demo terdaftar: ${outlet.name}`);

  // 3. Upsert Users (Owner, Kasir, Supervisor)
  const defaultPasswordHash = await bcrypt.hash('demo123', 6);
  const defaultPinHash = await bcrypt.hash('1234', 6);

  const owner = await prisma.user.upsert({
    where: { username: 'demo_owner' },
    update: {
      tenantId: tenant.id,
      name: 'Hendra Wijaya (Owner PT Pro Teknologi)',
      role: Role.OWNER,
    },
    create: {
      id: 'usr_demo_owner',
      tenantId: tenant.id,
      username: 'demo_owner',
      name: 'Hendra Wijaya (Owner PT Pro Teknologi)',
      passwordHash: defaultPasswordHash,
      pinHash: defaultPinHash,
      role: Role.OWNER,
      outletId: null,
    },
  });

  const kasir = await prisma.user.upsert({
    where: { username: 'demo_kasir' },
    update: {
      tenantId: tenant.id,
      outletId: outlet.id,
      name: 'Budi Santoso (Kasir Shift 1)',
      role: Role.KASIR,
    },
    create: {
      id: 'usr_demo_kasir',
      tenantId: tenant.id,
      outletId: outlet.id,
      username: 'demo_kasir',
      name: 'Budi Santoso (Kasir Shift 1)',
      passwordHash: defaultPasswordHash,
      pinHash: defaultPinHash,
      role: Role.KASIR,
    },
  });

  const spv = await prisma.user.upsert({
    where: { username: 'demo_spv' },
    update: {
      tenantId: tenant.id,
      outletId: outlet.id,
      name: 'Siti Rahma (Supervisor Outlet)',
      role: Role.SUPERVISOR,
    },
    create: {
      id: 'usr_demo_spv',
      tenantId: tenant.id,
      outletId: outlet.id,
      username: 'demo_spv',
      name: 'Siti Rahma (Supervisor Outlet)',
      passwordHash: defaultPasswordHash,
      pinHash: defaultPinHash,
      role: Role.SUPERVISOR,
    },
  });

  console.log(`✅ Akun Demo terdaftar:`);
  console.log(`   - Owner: demo_owner (Password: demo123, PIN: 1234)`);
  console.log(`   - Kasir: demo_kasir (Password: demo123, PIN: 1234)`);
  console.log(`   - SPV  : demo_spv   (Password: demo123, PIN: 1234)`);

  // 4. Upsert Menu Items Realistis
  const menuData = [
    {
      code: 'DIM-01',
      name: 'Siomay Dimsum Ayam',
      category: 'kukus',
      price: 28000,
      costPrice: 12000,
      stock: 45,
      description: '4 pcs olahan ayam & jamur dengan saus sambal khas',
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DIM-02',
      name: 'Hakau Udang Kristal',
      category: 'kukus',
      price: 32000,
      costPrice: 15000,
      stock: 28,
      description: 'Udang utuh segar terbalut kulit tipis transparan kukus',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DIM-03',
      name: 'Lumpia Kulit Tahu Goreng',
      category: 'goreng',
      price: 26000,
      costPrice: 11000,
      stock: 20,
      description: 'Kulit tahu renyah keemasan isi udang cincang gurih',
      image: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DIM-04',
      name: 'Pao Telur Asin Lava',
      category: 'kukus',
      price: 24000,
      costPrice: 9000,
      stock: 30,
      description: 'Bakpao lembut dengan lelehan kuning telur asin manis gurih',
      image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'DIM-05',
      name: 'Dimsum Mozzarella Melt',
      category: 'mentai',
      price: 30000,
      costPrice: 13000,
      stock: 35,
      description: 'Dimsum ayam bakar dengan keju mozzarella leleh melimpah',
      image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'MC-01',
      name: 'Nasi Goreng Spesial Wagyu',
      category: 'goreng',
      price: 38000,
      costPrice: 18000,
      stock: 25,
      description: 'Nasi goreng harum wangi dengan potongan daging wagyu & telur mata sapi',
      image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'MC-02',
      name: 'Mie Bebek Panggang HK',
      category: 'kukus',
      price: 45000,
      costPrice: 20000,
      stock: 18,
      description: 'Mie telur kenyal dengan irisan bebek panggang madu gurih',
      image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'BEV-01',
      name: 'Kopi Susu Aren Spesial',
      category: 'minuman',
      price: 22000,
      costPrice: 7000,
      stock: 60,
      description: 'Espresso house blend dengan gula aren murni & susu creamy',
      image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'BEV-02',
      name: 'Matcha Fusion Latte',
      category: 'minuman',
      price: 25000,
      costPrice: 8000,
      stock: 40,
      description: 'Pure ceremonial Uji Matcha dengan susu segar dingin',
      image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=400&q=80',
    },
    {
      code: 'BEV-03',
      name: 'Lychee Iced Tea Supreme',
      category: 'minuman',
      price: 20000,
      costPrice: 6000,
      stock: 50,
      description: 'Teh melati wangi dingin dengan buah leci utuh segar',
      image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80',
    },
  ];

  const createdMenuItems: any[] = [];
  for (const m of menuData) {
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
    createdMenuItems.push(item);
  }

  console.log(`✅ ${createdMenuItems.length} Menu Items Demo tersimpan!`);

  // 5. Shift Session Kasir Budi Santoso Hari Ini
  const todayStart = new Date();
  todayStart.setHours(8, 0, 0, 0);

  const existingShift = await prisma.shiftSession.findFirst({
    where: {
      outletId: outlet.id,
      cashierId: kasir.id,
      status: ShiftStatus.ACTIVE,
    },
  });

  let shiftId = existingShift?.id;
  if (!existingShift) {
    const newShift = await prisma.shiftSession.create({
      data: {
        tenantId: tenant.id,
        shiftName: 'Shift Pagi - Reguler',
        outletId: outlet.id,
        cashierId: kasir.id,
        terminalId: 'POS-01',
        startTime: todayStart,
        startingCash: 500000,
        expectedCash: 500000,
        status: ShiftStatus.ACTIVE,
      },
    });
    shiftId = newShift.id;
  }

  console.log(`✅ Sesi Shift Kasir Aktif: ${shiftId}`);

  // 6. Buat 10 Transaksi Realistis Hari Ini (Menghasilkan Omzet Live)
  const sampleTransactions = [
    {
      inv: 'INV-DEMO-001',
      type: OrderType.DINE_IN,
      table: 'Meja 01',
      customer: 'Ahmad Faisal',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DIM-01', qty: 2 },
        { code: 'BEV-01', qty: 2 },
      ],
      discount: 0,
    },
    {
      inv: 'INV-DEMO-002',
      type: OrderType.DINE_IN,
      table: 'Meja 08',
      customer: 'Dian P. (Gold Member)',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'DIM-02', qty: 2 },
        { code: 'BEV-01', qty: 1 },
      ],
      discount: 5000,
    },
    {
      inv: 'INV-DEMO-003',
      type: OrderType.TAKEAWAY,
      table: null,
      customer: 'Siti Rahayu',
      method: PaymentMethod.CASH,
      items: [
        { code: 'DIM-01', qty: 3 },
        { code: 'DIM-03', qty: 2 },
        { code: 'BEV-03', qty: 2 },
      ],
      discount: 0,
    },
    {
      inv: 'INV-DEMO-004',
      type: OrderType.DINE_IN,
      table: 'Meja 04',
      customer: 'Reza Pratama',
      method: PaymentMethod.CASH,
      items: [
        { code: 'MC-01', qty: 2 },
        { code: 'BEV-02', qty: 2 },
      ],
      discount: 0,
    },
    {
      inv: 'INV-DEMO-005',
      type: OrderType.DINE_IN,
      table: 'Meja 12',
      customer: 'Keluarga Wijaya',
      method: PaymentMethod.QRIS,
      items: [
        { code: 'MC-02', qty: 3 },
        { code: 'DIM-02', qty: 3 },
        { code: 'BEV-01', qty: 3 },
      ],
      discount: 15000,
    },
  ];

  for (const tx of sampleTransactions) {
    const existingOrder = await prisma.order.findUnique({
      where: { invoiceNumber: tx.inv },
    });

    if (!existingOrder) {
      let subtotal = 0;
      let hppTotal = 0;
      const orderItemsData: any[] = [];

      for (const it of tx.items) {
        const menuItem = createdMenuItems.find((m) => m.code === it.code);
        if (menuItem) {
          const itemSubtotal = Number(menuItem.price) * it.qty;
          const itemHpp = Number(menuItem.costPrice) * it.qty;
          subtotal += itemSubtotal;
          hppTotal += itemHpp;

          orderItemsData.push({
            menuId: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            costPrice: menuItem.costPrice,
            quantity: it.qty,
          });
        }
      }

      const total = subtotal - tx.discount;

      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          invoiceNumber: tx.inv,
          outletId: outlet.id,
          orderType: tx.type,
          tableNumber: tx.table,
          customerName: tx.customer,
          subtotal: subtotal,
          discount: tx.discount,
          total: total,
          hppTotal: hppTotal,
          paymentMethod: tx.method,
          cashReceived: tx.method === PaymentMethod.CASH ? total + 10000 : null,
          changeAmount: tx.method === PaymentMethod.CASH ? 10000 : null,
          cashierId: kasir.id,
          status: OrderStatus.PAID,
          items: {
            create: orderItemsData,
          },
        },
      });
    }
  }

  console.log('🎉 Seeding Demo Selesai! Seluruh data transaksi, menu, akun kasir, dan outlet siap digunakan.');
}

seedDemoTenant()
  .catch((e) => {
    console.error('❌ Gagal seeding demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
