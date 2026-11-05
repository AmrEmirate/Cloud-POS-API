import { Request, Response } from 'express';
import { prisma, basePrisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { getPlanDetails } from '../config/plans';

export const getOutlets = async (_req: Request, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const outlets = await prisma.outlet.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: {
            orders: {
              where: { createdAt: { gte: startOfMonth } },
            },
          },
        },
      },
    });

    const formatted = outlets.map((o) => {
      const planInfo = getPlanDetails((o as any).plan || 'PAKET_100K');
      const outletDailyLimit = (o as any).dailyTxLimit !== undefined && (o as any).dailyTxLimit !== null
        ? (o as any).dailyTxLimit
        : planInfo.dailyTxLimit;
      const isUnlimited = planInfo.monthlyTxLimit === 0 || outletDailyLimit === 0;
      const monthlyTxLimit = isUnlimited
        ? 0
        : (planInfo.monthlyTxLimit > 0 ? planInfo.monthlyTxLimit : outletDailyLimit * 30);

      return {
        id: o.id,
        code: o.code,
        name: o.name,
        city: o.city,
        address: o.address,
        phone: o.phone,
        targetDailySales: Number(o.targetDailySales),
        plan: (o as any).plan || planInfo.code,
        planName: planInfo.name,
        dailyTxLimit: outletDailyLimit,
        monthlyTxLimit,
        isUnlimited,
        currentMonthTxCount: o._count?.orders ?? 0,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Outlet Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal mengambil data outlet' });
  }
};

export const createOutlet = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, city = 'Bandung', address, phone, targetDailySales = 4000000, plan } = req.body;

    if (!code || !name || !address || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Kode cabang, nama, alamat, dan nomor telepon wajib diisi!',
      });
    }

    const tenantId = req.user?.tenantId;
    let tenantPlan = 'PAKET_100K';

    if (tenantId && req.user?.role !== 'SUPERADMIN') {
      const tenant = await basePrisma.tenant.findUnique({
        where: { id: tenantId },
        include: { outlets: { select: { id: true } } },
      });

      if (tenant) {
        tenantPlan = tenant.plan || 'PAKET_100K';
        if (tenant.outlets.length >= tenant.maxOutlets) {
          return res.status(402).json({
            success: false,
            code: 'OUTLET_LIMIT_REACHED',
            message: `Batas kuota cabang telah tercapai (${tenant.outlets.length}/${tenant.maxOutlets} cabang). Harap lakukan pembayaran tambah outlet seharga Rp ${Number(tenant.pricePerOutlet).toLocaleString('id-ID')}/bulan terlebih dahulu!`,
          });
        }
      }
    }

    const cleanCode = String(code).trim().toUpperCase();

    // Check if code already exists
    const existing = await prisma.outlet.findFirst({
      where: { code: cleanCode },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Kode cabang "${cleanCode}" sudah digunakan oleh outlet lain!`,
      });
    }

    // Resolve plan configuration for this specific outlet
    const selectedPlanCode = plan || tenantPlan;
    const planInfo = getPlanDetails(selectedPlanCode);

    const newOutlet = await prisma.outlet.create({
      data: {
        code: cleanCode,
        name: String(name).trim(),
        city: String(city).trim(),
        address: String(address).trim(),
        phone: String(phone).trim(),
        targetDailySales: parseFloat(String(targetDailySales)) || 0,
        tenantId: tenantId || null,
        plan: planInfo.code,
        dailyTxLimit: planInfo.dailyTxLimit,
      },
    });

    res.status(201).json({
      success: true,
      message: `Cabang baru "${newOutlet.name}" (${newOutlet.code}) berhasil ditambahkan dengan ${planInfo.name}!`,
      data: {
        id: newOutlet.id,
        code: newOutlet.code,
        name: newOutlet.name,
        city: newOutlet.city,
        address: newOutlet.address,
        phone: newOutlet.phone,
        targetDailySales: Number(newOutlet.targetDailySales),
        plan: newOutlet.plan,
        planName: planInfo.name,
        dailyTxLimit: newOutlet.dailyTxLimit,
        monthlyTxLimit: planInfo.monthlyTxLimit,
        isUnlimited: planInfo.monthlyTxLimit === 0 || newOutlet.dailyTxLimit === 0,
        currentMonthTxCount: 0,
      },
    });
  } catch (error: any) {
    console.error('[Create Outlet Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal menambahkan cabang baru',
    });
  }
};

export const updateOutlet = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { code, name, city, address, phone, targetDailySales, plan, dailyTxLimit } = req.body;

    const existing = await prisma.outlet.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Outlet cabang tidak ditemukan!',
      });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Cabang bukan milik organisasi Anda!',
      });
    }

    let cleanCode = existing.code;
    if (code && code.trim().toUpperCase() !== existing.code) {
      cleanCode = code.trim().toUpperCase();
      const codeTaken = await prisma.outlet.findFirst({
        where: { code: cleanCode },
      });
      if (codeTaken) {
        return res.status(400).json({
          success: false,
          message: `Kode cabang "${cleanCode}" sudah digunakan!`,
        });
      }
    }

    const planInfo = plan ? getPlanDetails(plan) : getPlanDetails(existing.plan);
    const resolvedDailyTxLimit = dailyTxLimit !== undefined
      ? parseInt(String(dailyTxLimit))
      : (plan ? planInfo.dailyTxLimit : existing.dailyTxLimit);

    const updated = await prisma.outlet.update({
      where: { id },
      data: {
        code: cleanCode,
        name: name !== undefined ? String(name).trim() : existing.name,
        city: city !== undefined ? String(city).trim() : existing.city,
        address: address !== undefined ? String(address).trim() : existing.address,
        phone: phone !== undefined ? String(phone).trim() : existing.phone,
        targetDailySales:
          targetDailySales !== undefined
            ? parseFloat(String(targetDailySales)) || 0
            : existing.targetDailySales,
        plan: plan ? planInfo.code : existing.plan,
        dailyTxLimit: resolvedDailyTxLimit,
      },
    });

    res.json({
      success: true,
      message: `Data cabang "${updated.name}" berhasil diperbarui!`,
      data: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        city: updated.city,
        address: updated.address,
        phone: updated.phone,
        targetDailySales: Number(updated.targetDailySales),
        plan: updated.plan,
        planName: planInfo.name,
        dailyTxLimit: updated.dailyTxLimit,
        monthlyTxLimit: planInfo.monthlyTxLimit,
        isUnlimited: planInfo.monthlyTxLimit === 0 || updated.dailyTxLimit === 0,
      },
    });
  } catch (error: any) {
    console.error('[Update Outlet Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal memperbarui data cabang',
    });
  }
};

export const deleteOutlet = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.outlet.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Outlet cabang tidak ditemukan!',
      });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Cabang bukan milik organisasi Anda!',
      });
    }

    // Check relations
    const [orderCount, shiftCount, pcCount, invCount, expCount] = await Promise.all([
      prisma.order.count({ where: { outletId: id } }),
      prisma.shiftSession.count({ where: { outletId: id } }),
      prisma.pettyCash.count({ where: { outletId: id } }),
      prisma.factoryInvoice.count({ where: { outletId: id } }),
      prisma.fixedExpense.count({ where: { outletId: id } }),
    ]);

    const totalRecords = orderCount + shiftCount + pcCount + invCount + expCount;
    if (totalRecords > 0) {
      return res.status(400).json({
        success: false,
        message: `Cabang tidak dapat dihapus karena telah memiliki ${totalRecords} data transaksi/shift/biaya terkait!`,
      });
    }

    await prisma.outlet.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Cabang berhasil dihapus!',
    });
  } catch (error: any) {
    console.error('[Delete Outlet Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal menghapus cabang',
    });
  }
};
