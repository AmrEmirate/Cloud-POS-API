import { basePrisma } from '../config/database';
import { getPlanDetails } from '../config/plans';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

const PROTEK_SALES_URL = process.env.PROTEK_SALES_URL || 'http://localhost:5000/api';
const resolveInternalServiceKey = (): string => {
  const key = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (key && key.length >= 16) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: INTERNAL_SERVICE_KEY must be configured (>= 16 chars) in production.');
  }
  return 'protek-cloudpos-sync-secret-2026';
};
const INTERNAL_SERVICE_KEY = resolveInternalServiceKey();

export interface ProtekHeartbeatResponse {
  success?: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  canOperate: boolean;
  message: string;
  outlet?: {
    id: string;
    name: string;
    ownerName: string;
  };
  licenseKey: string;
  invoiceStatus?: string;
  overdueInvoice?: {
    invoiceNumber: string;
    amount: number;
    billingPeriod: string;
    dueDate: string;
  };
  paymentInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
}

export interface ProvisionFromProtekInput {
  name: string;
  ownerName: string;
  phone: string;
  planCode?: string;
  licenseKey: string;
  customDomain?: string;
  themeColor?: string;
  themeConfig?: any;
  initialOutletName?: string;
  ownerUsername?: string;
  ownerPassword?: string;
}

export class ProtekIntegrationService {
  static getInternalSecret(): string {
    return INTERNAL_SERVICE_KEY;
  }

  /**
   * Ping status lisensi ke ProtekSales Server (Port 5000)
   */
  static async checkHeartbeatWithProtek(licenseKey: string, machineId?: string): Promise<ProtekHeartbeatResponse | null> {
    try {
      const response = await fetch(`${PROTEK_SALES_URL}/license/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ licenseKey, machineId }),
      });

      const resData: any = await response.json();
      const heartbeatData: ProtekHeartbeatResponse = resData.data || resData;

      // Otomatis sinkronkan status tenant di database Cloud POS jika ada tenant terkait
      if (heartbeatData && heartbeatData.status) {
        const tenant = await basePrisma.tenant.findFirst({
          where: { licenseKey },
        });

        if (tenant) {
          const newStatus = heartbeatData.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
          if (tenant.status !== newStatus) {
            await basePrisma.tenant.update({
              where: { id: tenant.id },
              data: { status: newStatus },
            });
          }
        }
      }

      return heartbeatData;
    } catch (err: any) {
      console.warn('[ProtekIntegration] Gagal terhubung ke ProtekSales Server:', err.message);
      return null;
    }
  }

  /**
   * Sinkronisasi status lisensi instan (dipicu langsung oleh Admin Saklar Kill-Switch di ProtekSales)
   */
  static async applyLicenseStatusSync(licenseKey: string, status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED', reason?: string) {
    const tenant = await basePrisma.tenant.findFirst({
      where: { licenseKey },
    });

    if (!tenant) {
      throw new Error(`Tenant dengan lisensi ${licenseKey} tidak ditemukan di Cloud POS.`);
    }

    const newStatus = status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
    const updated = await basePrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: newStatus },
    });

    return {
      tenant: updated,
      status: newStatus,
      reason: reason || (newStatus === 'SUSPENDED' ? 'Dinonaktifkan oleh Admin Protek.' : 'Lisensi aktif.'),
    };
  }

  /**
   * Auto-Provisioning Tenant & Outlet baru saat sales DEAL di ProtekSales
   */
  static async provisionTenantFromProtek(input: ProvisionFromProtekInput) {
    const plan = getPlanDetails(input.planCode);

    // Auto-generate slug unik dari nama
    const rawSlug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    let slug = rawSlug;
    let counter = 1;
    while (await basePrisma.tenant.findUnique({ where: { slug } })) {
      slug = `${rawSlug}-${counter++}`;
    }

    // Auto-generate username owner jika belum ada
    const cleanPhone = input.phone.replace(/[^0-9]/g, '');
    const ownerUsername = input.ownerUsername || `owner_${slug.slice(0, 8)}_${cleanPhone.slice(-4)}`;
    const ownerPassword = input.ownerPassword || 'Protek2026!Pos';

    const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
    const ownerPinHash = await bcrypt.hash('1234', 10);

    const subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 hari aktif awal

    const result = await basePrisma.$transaction(async (tx) => {
      // 1. Buat Tenant baru
      const tenant = await tx.tenant.create({
        data: {
          name: input.name.trim(),
          slug,
          plan: plan.code,
          status: 'ACTIVE',
          pricePerOutlet: plan.price,
          dailyTxLimitPerOutlet: plan.dailyTxLimit,
          extraDailyTxLimit: 0,
          maxOutlets: 1,
          subscriptionExpiresAt,
          licenseKey: input.licenseKey,
          themeColor: input.themeColor || '#f97316',
          themeConfig: input.themeConfig || null,
          customDomain: input.customDomain || null,
        },
      });

      // 2. Buat Outlet Utama
      const outlet = await tx.outlet.create({
        data: {
          tenantId: tenant.id,
          code: 'PST',
          name: input.initialOutletName?.trim() || input.name.trim(),
          city: 'Indonesia',
          address: 'Alamat Operasional Toko',
          phone: cleanPhone || '0812000000',
          targetDailySales: 5000000,
        },
      });

      // 3. Buat User Owner
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          outletId: outlet.id,
          name: input.ownerName.trim(),
          username: ownerUsername,
          passwordHash: ownerPasswordHash,
          pinHash: ownerPinHash,
          role: Role.OWNER,
        },
      });

      return { tenant, outlet, owner };
    });

    return {
      success: true,
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
      slug: result.tenant.slug,
      plan: plan.code,
      planName: plan.name,
      dailyTxLimit: plan.dailyTxLimit,
      monthlyTxLimit: plan.monthlyTxLimit,
      licenseKey: input.licenseKey,
      credentials: {
        username: ownerUsername,
        temporaryPassword: ownerPassword,
        defaultPin: '1234',
        loginUrl: `http://${result.tenant.slug}.posmu.cloud`,
      },
    };
  }

  /**
   * Mengambil data operasional real-time tenant POS berdasarkan licenseKey
   * Digunakan oleh ProtekSales untuk memantau omset, kuota transaksi, & aktivitas kasir
   */
  static async getTenantOperationalDataByLicense(licenseKey: string) {
    const tenant = await basePrisma.tenant.findFirst({
      where: { licenseKey },
      include: {
        outlets: {
          select: {
            id: true,
            code: true,
            name: true,
            city: true,
            address: true,
            phone: true,
            targetDailySales: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
    });

    if (!tenant) return null;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      monthOrders,
      totalGmvAgg,
      todayGmvAgg,
      recentOrders,
      activeShift,
    ] = await Promise.all([
      basePrisma.order.count({
        where: { tenantId: tenant.id, status: 'PAID' },
      }),
      basePrisma.order.count({
        where: {
          tenantId: tenant.id,
          status: 'PAID',
          createdAt: { gte: startOfToday },
        },
      }),
      basePrisma.order.count({
        where: {
          tenantId: tenant.id,
          status: 'PAID',
          createdAt: { gte: startOfMonth },
        },
      }),
      basePrisma.order.aggregate({
        where: { tenantId: tenant.id, status: 'PAID' },
        _sum: { total: true },
      }),
      basePrisma.order.aggregate({
        where: {
          tenantId: tenant.id,
          status: 'PAID',
          createdAt: { gte: startOfToday },
        },
        _sum: { total: true },
      }),
      basePrisma.order.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          outlet: {
            select: { name: true },
          },
        },
      }),
      basePrisma.shiftSession.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
        include: {
          cashier: { select: { name: true } },
          outlet: { select: { name: true } },
        },
      }),
    ]);

    const plan = getPlanDetails(tenant.plan);
    const isUnlimited = tenant.dailyTxLimitPerOutlet === 0;
    const dailyLimit = isUnlimited ? 0 : tenant.dailyTxLimitPerOutlet + tenant.extraDailyTxLimit;
    const monthlyLimit = isUnlimited ? 0 : dailyLimit * 30;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        customDomain: tenant.customDomain,
        logoUrl: tenant.logoUrl,
        themeColor: tenant.themeColor,
        plan: tenant.plan,
        planName: plan.name,
        status: tenant.status,
        licenseKey: tenant.licenseKey,
        pricePerOutlet: Number(tenant.pricePerOutlet),
        maxOutlets: tenant.maxOutlets,
        subscriptionExpiresAt: tenant.subscriptionExpiresAt,
        webPosUrl: `http://${tenant.slug}.posmu.cloud`,
        createdAt: tenant.createdAt,
      },
      outlets: tenant.outlets,
      users: tenant.users,
      stats: {
        totalOrders,
        todayOrders,
        monthOrders,
        totalGmv: Number(totalGmvAgg._sum?.total || 0),
        todayGmv: Number(todayGmvAgg._sum?.total || 0),
        dailyLimit,
        monthlyLimit,
        isUnlimited,
        todayRemaining: isUnlimited ? 'UNLIMITED' : Math.max(0, dailyLimit - todayOrders),
        monthRemaining: isUnlimited ? 'UNLIMITED' : Math.max(0, monthlyLimit - monthOrders),
      },
      activeShift: activeShift
        ? {
            id: activeShift.id,
            outletName: activeShift.outlet.name,
            cashierName: activeShift.cashier.name,
            startTime: activeShift.startTime,
          }
        : null,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        totalAmount: Number(o.total),
        paymentMethod: o.paymentMethod,
        status: o.status,
        outletName: o.outlet?.name,
        createdAt: o.createdAt,
      })),
    };
  }

  /**
   * Mengambil rangkuman seluruh tenant POS beserta metrik performanya (Batch Aggregated — Anti N+1 Query)
   */
  static async getAllTenantsOperationalSummary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      tenants,
      totalOrderStatsByTenant,
      todayOrderStatsByTenant,
    ] = await Promise.all([
      basePrisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          outlets: {
            select: {
              id: true,
              code: true,
              name: true,
              city: true,
              address: true,
              phone: true,
              plan: true,
              dailyTxLimit: true,
              targetDailySales: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
              username: true,
              role: true,
            },
          },
          subscriptionInvoices: {
            where: { status: 'PAID' },
            orderBy: { paidAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              users: true,
              outlets: true,
              menus: true,
            },
          },
        },
      }),
      basePrisma.order.groupBy({
        by: ['tenantId'],
        where: { status: 'PAID' },
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      basePrisma.order.groupBy({
        by: ['tenantId'],
        where: { status: 'PAID', createdAt: { gte: startOfToday } },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    const totalStatsMap = new Map<string, { count: number; gmv: number; lastOrderAt: Date | null }>();
    for (const row of totalOrderStatsByTenant) {
      if (row.tenantId) {
        totalStatsMap.set(row.tenantId, {
          count: row._count?._all || 0,
          gmv: Number(row._sum?.total || 0),
          lastOrderAt: row._max?.createdAt || null,
        });
      }
    }

    const todayStatsMap = new Map<string, { count: number; gmv: number }>();
    for (const row of todayOrderStatsByTenant) {
      if (row.tenantId) {
        todayStatsMap.set(row.tenantId, {
          count: row._count?._all || 0,
          gmv: Number(row._sum?.total || 0),
        });
      }
    }

    return tenants.map((t) => {
      const totalStat = totalStatsMap.get(t.id) || { count: 0, gmv: 0, lastOrderAt: null };
      const todayStat = todayStatsMap.get(t.id) || { count: 0, gmv: 0 };
      const activeUsers = t.users || [];
      const ownerUser = activeUsers.find((u) => u.role === Role.OWNER) || activeUsers[0] || null;
      const latestInvoice = t.subscriptionInvoices?.[0] || null;
      const plan = getPlanDetails(t.plan);
      const mainOutlet = t.outlets[0] || null;

      const clusterLocation = mainOutlet
        ? (mainOutlet.city && mainOutlet.address
            ? `${mainOutlet.city} (${mainOutlet.address})`
            : mainOutlet.city || mainOutlet.address || 'Indonesia')
        : 'Pusat';

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        customDomain: t.customDomain,
        themeColor: t.themeColor,
        themeConfig: t.themeConfig,
        plan: t.plan,
        planName: plan.name,
        planDescription: plan.description,
        status: t.status,
        licenseKey: t.licenseKey,
        pricePerOutlet: Number(t.pricePerOutlet),
        maxOutlets: t.maxOutlets || 4,
        usedOutlets: t._count.outlets,
        monthlyBill: Number(t.pricePerOutlet) * Math.max(1, t._count.outlets || t.maxOutlets || 1),
        hasAllBranchesView: true,
        activePosCount: activeUsers.length || t._count.users || 1,
        subscriptionExpiresAt: t.subscriptionExpiresAt,
        outletsCount: t._count.outlets,
        usersCount: activeUsers.length || t._count.users || 1,
        menusCount: t._count.menus,
        totalOrders: totalStat.count,
        todayOrders: todayStat.count,
        totalGmv: totalStat.gmv,
        todayGmv: todayStat.gmv,
        lastOrderAt: totalStat.lastOrderAt,
        mainOutlet,
        outlets: t.outlets,
        ownerName: ownerUser?.name || t.bankAccountName || 'Owner Toko',
        ownerUsername: ownerUser?.username || 'owner',
        ownerPhone: mainOutlet?.phone || '081284525304',
        ownerEmail: `${t.slug}@vaxel.my.id`,
        cluster: clusterLocation,
        bank: {
          bankName: t.bankName,
          bankAccountNumber: t.bankAccountNumber,
          bankAccountName: t.bankAccountName,
        },
        latestInvoice: latestInvoice
          ? {
              invoiceNumber: latestInvoice.invoiceNumber,
              amount: Number(latestInvoice.amount),
              paidAt: latestInvoice.paidAt,
              description: latestInvoice.description,
            }
          : null,
        createdAt: t.createdAt,
      };
    });
  }

  /**
   * Mengambil analitik keseluruhan platform Cloud POS
   */
  static async getPlatformAnalytics() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalOutlets,
      totalUsers,
      totalOrders,
      todayOrders,
      totalGmvAgg,
      todayGmvAgg,
    ] = await Promise.all([
      basePrisma.tenant.count(),
      basePrisma.tenant.count({ where: { status: 'ACTIVE' } }),
      basePrisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      basePrisma.outlet.count(),
      basePrisma.user.count(),
      basePrisma.order.count({ where: { status: 'PAID' } }),
      basePrisma.order.count({ where: { status: 'PAID', createdAt: { gte: startOfToday } } }),
      basePrisma.order.aggregate({ where: { status: 'PAID' }, _sum: { total: true } }),
      basePrisma.order.aggregate({
        where: { status: 'PAID', createdAt: { gte: startOfToday } },
        _sum: { total: true },
      }),
    ]);

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalOutlets,
      totalUsers,
      totalOrders,
      todayOrders,
      totalGmv: Number(totalGmvAgg._sum?.total || 0),
      todayGmv: Number(todayGmvAgg._sum?.total || 0),
      timestamp: new Date().toISOString(),
    };
  }
}
