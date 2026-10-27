import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { basePrisma } from '../config/database';
import { Role } from '@prisma/client';
import { getPlanDetails } from '../config/plans';

export const getStats = async (_req: Request, res: Response) => {
  try {
    const [totalTenants, activeTenants, totalOutlets, totalOrders, orderAggregates] = await Promise.all([
      basePrisma.tenant.count(),
      basePrisma.tenant.count({ where: { status: 'ACTIVE' } }),
      basePrisma.outlet.count(),
      basePrisma.order.count(),
      basePrisma.order.aggregate({
        _sum: {
          total: true,
        },
      }),
    ]);

    const plans = await basePrisma.tenant.groupBy({
      by: ['plan'],
      _count: {
        id: true,
      },
    });

    res.json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        totalOutlets,
        totalOrders,
        totalGmv: Number(orderAggregates._sum.total || 0),
        plans: plans.map((p) => ({ plan: p.plan, count: p._count.id })),
      },
    });
  } catch (error: any) {
    console.error('[Superadmin Stats Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat statistik platform' });
  }
};

export const getTenants = async (_req: Request, res: Response) => {
  try {
    const tenants = await basePrisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            outlets: true,
            users: true,
            menus: true,
            orders: true,
          },
        },
      },
    });

    // Fetch total revenue per tenant
    const orderSums = await basePrisma.order.groupBy({
      by: ['tenantId'],
      _sum: {
        total: true,
      },
    });

    const revenueMap: Record<string, number> = {};
    for (const item of orderSums) {
      if (item.tenantId) {
        revenueMap[item.tenantId] = Number(item._sum.total || 0);
      }
    }

    const formatted = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      customDomain: t.customDomain,
      logoUrl: t.logoUrl,
      themeColor: t.themeColor || '#ea580c',
      plan: t.plan,
      status: t.status,
      licenseKey: t.licenseKey,
      pricePerOutlet: Number(t.pricePerOutlet || 100000),
      maxOutlets: t.maxOutlets,
      dailyTxLimitPerOutlet: t.dailyTxLimitPerOutlet,
      extraDailyTxLimit: t.extraDailyTxLimit,
      subscriptionExpiresAt: t.subscriptionExpiresAt,
      createdAt: t.createdAt,
      counts: {
        outlets: t._count.outlets,
        users: t._count.users,
        menus: t._count.menus,
        orders: t._count.orders,
      },
      totalGmv: revenueMap[t.id] || 0,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Superadmin Get Tenants Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat daftar tenant' });
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug: rawSlug,
      themeColor = '#ea580c',
      plan = 'PAKET_100K',
      customDomain,
      ownerUsername,
      ownerPassword,
      ownerName,
      initialOutletName = 'Cabang Utama',
      seedSampleMenus = true,
    } = req.body;

    if (!name || !ownerUsername || !ownerPassword || !ownerName) {
      return res.status(400).json({
        success: false,
        message: 'Nama Bisnis, Username Owner, Password Owner, dan Nama Owner wajib diisi!',
      });
    }

    // Generate or clean slug
    const slug = (
      rawSlug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    ).trim();

    // Check slug uniqueness
    const existingSlug = await basePrisma.tenant.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      return res.status(400).json({
        success: false,
        message: `Subdomain / Slug "${slug}" sudah digunakan oleh tenant lain!`,
      });
    }

    // Check username uniqueness
    const existingUser = await basePrisma.user.findUnique({
      where: { username: ownerUsername.trim() },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Username "${ownerUsername}" sudah digunakan di platform!`,
      });
    }

    const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
    const ownerPinHash = await bcrypt.hash('1234', 10);
    const planConfig = getPlanDetails(plan);

    // Transaction to create Tenant, Outlet, Owner User, and initial menus
    const result = await basePrisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: name.trim(),
          slug,
          themeColor,
          plan: planConfig.code,
          pricePerOutlet: planConfig.price,
          dailyTxLimitPerOutlet: planConfig.dailyTxLimit,
          licenseKey: req.body.licenseKey ? String(req.body.licenseKey).trim() : null,
          customDomain: customDomain ? customDomain.trim().toLowerCase() : null,
          status: 'ACTIVE',
        },
      });

      // 2. Create Initial Outlet
      const outletCode = 'PST';
      const outlet = await tx.outlet.create({
        data: {
          tenantId: tenant.id,
          code: outletCode,
          name: initialOutletName.trim(),
          city: 'Kota Bisnis',
          address: 'Alamat Operasional Outlet Utama',
          phone: '08123456789',
          targetDailySales: 5000000,
        },
      });

      // 3. Create Owner User
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          outletId: outlet.id,
          name: ownerName.trim(),
          username: ownerUsername.trim(),
          passwordHash: ownerPasswordHash,
          pinHash: ownerPinHash,
          role: Role.OWNER,
        },
      });

      // 4. Optionally seed sample starter menus
      if (seedSampleMenus) {
        await tx.menuItem.createMany({
          data: [
            {
              tenantId: tenant.id,
              code: 'MNU-001',
              name: 'Signature Menu #1',
              category: 'mentai',
              price: 25000,
              costPrice: 12000,
              stock: 100,
              description: 'Menu unggulan rekomendasi',
              image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=500&auto=format&fit=crop&q=80',
              isAvailable: true,
            },
            {
              tenantId: tenant.id,
              code: 'MNU-002',
              name: 'Signature Menu #2',
              category: 'kukus',
              price: 20000,
              costPrice: 9000,
              stock: 100,
              description: 'Varian favorit pelanggan',
              image: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=500&auto=format&fit=crop&q=80',
              isAvailable: true,
            },
            {
              tenantId: tenant.id,
              code: 'MNU-003',
              name: 'Fresh Iced Tea',
              category: 'minuman',
              price: 8000,
              costPrice: 2500,
              stock: 150,
              description: 'Minuman segar pelengkap hidangan',
              image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80',
              isAvailable: true,
            },
          ],
        });
      }

      return { tenant, outlet, owner };
    });

    res.status(201).json({
      success: true,
      message: `Tenant "${result.tenant.name}" berhasil dibuat dalam < 10 detik!`,
      data: {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          themeColor: result.tenant.themeColor,
          plan: result.tenant.plan,
        },
        outlet: {
          id: result.outlet.id,
          name: result.outlet.name,
          code: result.outlet.code,
        },
        owner: {
          id: result.owner.id,
          name: result.owner.name,
          username: result.owner.username,
          role: result.owner.role,
        },
      },
    });
  } catch (error: any) {
    console.error('[Superadmin Create Tenant Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membuat tenant baru' });
  }
};

export const updateTenant = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      name,
      themeColor,
      plan,
      status,
      customDomain,
      logoUrl,
      subscriptionExpiresAt,
      maxOutlets,
      dailyTxLimitPerOutlet,
      extraDailyTxLimit,
      pricePerOutlet,
    } = req.body;

    const existing = await basePrisma.tenant.findUnique({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const updated = await basePrisma.tenant.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(themeColor && { themeColor }),
        ...(plan && {
          plan: getPlanDetails(plan).code,
          ...(pricePerOutlet === undefined && { pricePerOutlet: getPlanDetails(plan).price }),
          ...(dailyTxLimitPerOutlet === undefined && { dailyTxLimitPerOutlet: getPlanDetails(plan).dailyTxLimit }),
        }),
        ...(status && { status }),
        ...(req.body.licenseKey !== undefined && {
          licenseKey: req.body.licenseKey ? String(req.body.licenseKey).trim() : null,
        }),
        ...(maxOutlets !== undefined && { maxOutlets: parseInt(String(maxOutlets)) }),
        ...(dailyTxLimitPerOutlet !== undefined && {
          dailyTxLimitPerOutlet: parseInt(String(dailyTxLimitPerOutlet)),
        }),
        ...(extraDailyTxLimit !== undefined && {
          extraDailyTxLimit: parseInt(String(extraDailyTxLimit)),
        }),
        ...(pricePerOutlet !== undefined && { pricePerOutlet: parseFloat(String(pricePerOutlet)) }),
        ...(customDomain !== undefined && {
          customDomain: customDomain ? customDomain.trim().toLowerCase() : null,
        }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(subscriptionExpiresAt !== undefined && {
          subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
        }),
      },
    });

    res.json({
      success: true,
      message: `Tenant "${updated.name}" berhasil diperbarui`,
      data: updated,
    });
  } catch (error: any) {
    console.error('[Superadmin Update Tenant Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui tenant' });
  }
};

export const deleteTenant = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await basePrisma.tenant.findUnique({
      where: { id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    if (existing.slug === 'dimsum-intan') {
      return res.status(400).json({
        success: false,
        message: 'Tenant bawaan sistem (Dimsum Intan) tidak boleh dihapus!',
      });
    }

    await basePrisma.tenant.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: `Tenant "${existing.name}" dan seluruh datanya berhasil dihapus`,
    });
  } catch (error: any) {
    console.error('[Superadmin Delete Tenant Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus tenant' });
  }
};

export const getTelemetry = async (_req: Request, res: Response) => {
  try {
    const startDb = Date.now();
    await basePrisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startDb;

    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    // 1. Core KPIs
    const [
      totalTenants,
      activeTenants,
      totalOutlets,
      totalOrders,
      totalGmvAgg,
      totalUsers,
    ] = await Promise.all([
      basePrisma.tenant.count(),
      basePrisma.tenant.count({ where: { status: 'ACTIVE' } }),
      basePrisma.outlet.count(),
      basePrisma.order.count(),
      basePrisma.order.aggregate({ _sum: { total: true } }),
      basePrisma.user.count(),
    ]);

    // 2. Today's orders & GMV
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayOrdersCount, todayGmvAgg] = await Promise.all([
      basePrisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      basePrisma.order.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { total: true },
      }),
    ]);

    // 3. Plan Distribution
    const plans = await basePrisma.tenant.groupBy({
      by: ['plan'],
      _count: { id: true },
    });

    // 4. Recent Live Activity Stream (Recent 10 orders)
    const recentOrders = await basePrisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        outlet: { select: { name: true } },
        tenant: { select: { name: true, slug: true, themeColor: true } },
      },
    });

    const recentTenants = await basePrisma.tenant.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, plan: true, createdAt: true, themeColor: true },
    });

    // 5. 7-day Sales Trend (Grouped by date)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const pastOrders = await basePrisma.order.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true },
    });

    const trendMap: Record<string, { date: string; gmv: number; orders: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
      trendMap[key] = { date: label, gmv: 0, orders: 0 };
    }

    for (const ord of pastOrders) {
      const key = ord.createdAt.toISOString().split('T')[0];
      if (trendMap[key]) {
        trendMap[key].gmv += Number(ord.total || 0);
        trendMap[key].orders += 1;
      }
    }

    const salesTrend = Object.values(trendMap);

    res.json({
      success: true,
      data: {
        system: {
          status: 'HEALTHY',
          uptimeSeconds,
          nodeVersion: process.version,
          dbLatencyMs,
          memoryRssMb: Math.round(memoryUsage.rss / 1024 / 1024),
          memoryHeapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          memoryHeapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          timestamp: new Date().toISOString(),
        },
        kpis: {
          totalTenants,
          activeTenants,
          suspendedTenants: totalTenants - activeTenants,
          totalOutlets,
          totalUsers,
          totalOrders,
          totalGmv: Number(totalGmvAgg._sum.total || 0),
          todayOrders: todayOrdersCount,
          todayGmv: Number(todayGmvAgg._sum.total || 0),
        },
        planBreakdown: plans.map((p) => ({ plan: p.plan, count: p._count.id })),
        salesTrend,
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          invoiceNumber: o.invoiceNumber,
          tenantName: o.tenant?.name || 'Dimsum Intan',
          tenantSlug: o.tenant?.slug || 'dimsum-intan',
          outletName: o.outlet?.name || 'Outlet',
          total: Number(o.total),
          paymentMethod: o.paymentMethod,
          status: o.status,
          createdAt: o.createdAt,
        })),
        recentTenants,
      },
    });
  } catch (error: any) {
    console.error('[Superadmin Telemetry Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat telemetri platform' });
  }
};

