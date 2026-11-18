import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { OrderStatus, ShiftStatus } from '@prisma/client';
import { calculateShiftOpnameItem } from '../utils/opnameCalculator';

export const getCurrentShift = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId } = req.query;

    const whereClause: any = { status: ShiftStatus.ACTIVE };
    if (outletId && outletId !== 'all') {
      whereClause.outletId = String(outletId);
    }

    const shift = await prisma.shiftSession.findFirst({
      where: whereClause,
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    if (!shift) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        id: shift.id,
        shiftName: shift.shiftName,
        outletId: shift.outletId,
        outletName: shift.outlet?.name || 'Outlet',
        cashierId: shift.cashierId,
        cashierName: shift.cashier?.name || 'Kasir',
        terminalId: shift.terminalId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime ? shift.endTime.toISOString() : undefined,
        startingCash: Number(shift.startingCash),
        cashSales: Number(shift.cashSales),
        qrisSales: Number(shift.qrisSales),
        pettyCashOut: Number(shift.pettyCashOut),
        expectedCash: Number(shift.expectedCash),
        actualEndingCash: shift.actualEndingCash ? Number(shift.actualEndingCash) : undefined,
        difference: shift.difference ? Number(shift.difference) : undefined,
        notes: shift.notes || undefined,
        status: shift.status,
      },
    });
  } catch (error: any) {
    console.error('[Shift Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat status shift' });
  }
};

export const openShift = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, startingCash = 500000, shiftName = 'Shift 1 Pagi' } = req.body;

    let targetOutletId = outletId;
    if (!targetOutletId || targetOutletId === 'all') {
      targetOutletId = req.user?.outletId;
    }
    if (!targetOutletId) {
      const firstOutlet = await prisma.outlet.findFirst();
      targetOutletId = firstOutlet ? firstOutlet.id : undefined;
    }
    if (!targetOutletId) {
      return res.status(400).json({ success: false, message: 'Outlet tidak valid' });
    }

    let outlet = await prisma.outlet.findUnique({ where: { id: targetOutletId } });
    if (!outlet) {
      const fallbackOutlet = await prisma.outlet.findFirst();
      if (fallbackOutlet) {
        targetOutletId = fallbackOutlet.id;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Belum ada cabang (outlet) yang terdaftar. Harap tambahkan cabang terlebih dahulu di menu Outlet.',
        });
      }
    }

    const cashierId = req.user?.id;
    if (!cashierId) {
      return res.status(401).json({ success: false, message: 'Kasir tidak teridentifikasi. Harap login kembali.' });
    }

    // Check if there is already an active shift for this outlet
    const existingActive = await prisma.shiftSession.findFirst({
      where: {
        outletId: targetOutletId,
        status: ShiftStatus.ACTIVE,
      },
    });

    if (existingActive) {
      return res.status(400).json({
        success: false,
        message: 'Masih ada sesi shift aktif untuk outlet ini. Harap tutup shift sebelumnya terlebih dahulu.',
      });
    }

    const newShift = await prisma.shiftSession.create({
      data: {
        shiftName,
        tenantId: req.user?.tenantId || null,
        outletId: targetOutletId,
        cashierId,
        terminalId: 'POS-01 Terminal',
        startingCash,
        cashSales: 0,
        qrisSales: 0,
        pettyCashOut: 0,
        expectedCash: startingCash,
        status: ShiftStatus.ACTIVE,
      },
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: `Shift kasir berhasil dibuka dengan modal laci Rp ${Number(startingCash).toLocaleString('id-ID')}`,
      data: {
        id: newShift.id,
        shiftName: newShift.shiftName,
        outletId: newShift.outletId,
        outletName: newShift.outlet?.name || 'Outlet',
        cashierId: newShift.cashierId,
        cashierName: newShift.cashier?.name || 'Kasir',
        terminalId: newShift.terminalId,
        startTime: newShift.startTime.toISOString(),
        startingCash: Number(newShift.startingCash),
        cashSales: Number(newShift.cashSales),
        qrisSales: Number(newShift.qrisSales),
        pettyCashOut: Number(newShift.pettyCashOut),
        expectedCash: Number(newShift.expectedCash),
        status: newShift.status,
      },
    });
  } catch (error: any) {
    console.error('[Open Shift Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membuka sesi shift' });
  }
};

export const closeShift = async (req: AuthRequest, res: Response) => {
  try {
    const { actualEndingCash, notes, outletId, shiftId, materialOpnames } = req.body;

    const targetOutletId = outletId || req.user?.outletId;
    const whereClause: any = { status: ShiftStatus.ACTIVE };
    if (shiftId) {
      whereClause.id = String(shiftId);
    } else if (targetOutletId && targetOutletId !== 'all') {
      whereClause.outletId = String(targetOutletId);
    }

    const activeShift = await prisma.shiftSession.findFirst({
      where: whereClause,
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    if (!activeShift) {
      return res.status(404).json({ success: false, message: 'Tidak ada sesi shift aktif untuk ditutup' });
    }

    const expected = Number(activeShift.expectedCash);
    const actual = Number(actualEndingCash);
    const diff = actual - expected;

    const closedAt = new Date();
    const closed = await prisma.shiftSession.update({
      where: { id: activeShift.id },
      data: {
        status: ShiftStatus.CLOSED,
        endTime: closedAt,
        actualEndingCash: actual,
        difference: diff,
        notes: notes || null,
      },
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
      },
    });

    // Hitung & simpan Stock Opname Bahan Baku jika dikirim saat tutup shift
    let opnameAuditResults: any[] = [];
    if (Array.isArray(materialOpnames) && materialOpnames.length > 0) {
      const materialIds = materialOpnames.map((m: any) => String(m.rawMaterialId));
      const materials = await prisma.rawMaterial.findMany({
        where: { id: { in: materialIds }, isDeleted: false },
      });
      const materialMap = new Map(materials.map((m) => [m.id, m]));

      // Hitung pemakaian teoritis dari semua order PAID selama sesi shift ini
      const shiftOrders = await prisma.order.findMany({
        where: {
          outletId: activeShift.outletId,
          status: OrderStatus.PAID,
          createdAt: { gte: activeShift.startTime, lte: closedAt },
        },
        include: {
          items: {
            include: {
              menu: {
                include: {
                  recipeItems: true,
                },
              },
            },
          },
        },
      });

      const theoreticalByMaterial = new Map<string, number>();
      for (const order of shiftOrders) {
        for (const item of order.items) {
          const recipes = item.menu?.recipeItems || [];
          for (const rec of recipes) {
            const prev = theoreticalByMaterial.get(rec.rawMaterialId) || 0;
            theoreticalByMaterial.set(
              rec.rawMaterialId,
              prev + Number(item.quantity) * Number(rec.quantityUsed)
            );
          }
        }
      }

      for (const entry of materialOpnames) {
        const mat = materialMap.get(String(entry.rawMaterialId));
        if (!mat) continue;

        const calc = calculateShiftOpnameItem({
          openingStock: Number(mat.currentStock),
          restockIn: Number(entry.restockIn || 0),
          theoreticalUsed: theoreticalByMaterial.get(mat.id) || 0,
          actualClosing: Number(entry.actualClosing || 0),
          costPerUnit: Number(mat.costPerUnit),
        });

        await prisma.shiftMaterialOpname.upsert({
          where: {
            shiftId_rawMaterialId: {
              shiftId: closed.id,
              rawMaterialId: mat.id,
            },
          },
          update: {
            openingStock: calc.openingStock,
            restockIn: calc.restockIn,
            theoreticalUsed: calc.theoreticalUsed,
            expectedClosing: calc.expectedClosing,
            actualClosing: calc.actualClosing,
            variance: calc.variance,
            varianceValue: calc.varianceValue,
            status: calc.status,
            notes: entry.notes ? String(entry.notes) : null,
          },
          create: {
            tenantId: activeShift.tenantId,
            shiftId: closed.id,
            rawMaterialId: mat.id,
            openingStock: calc.openingStock,
            restockIn: calc.restockIn,
            theoreticalUsed: calc.theoreticalUsed,
            expectedClosing: calc.expectedClosing,
            actualClosing: calc.actualClosing,
            variance: calc.variance,
            varianceValue: calc.varianceValue,
            status: calc.status,
            notes: entry.notes ? String(entry.notes) : null,
          },
        });

        // Update stok bahan baku ke hasil hitungan fisik terbaru
        await prisma.rawMaterial.update({
          where: { id: mat.id },
          data: { currentStock: calc.actualClosing },
        });

        opnameAuditResults.push({
          rawMaterialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          ...calc,
        });
      }
    }

    const isCashier = req.user?.role === 'KASIR';

    res.json({
      success: true,
      message: `Shift kasir resmi ditutup. Selisih kas: Rp ${diff.toLocaleString('id-ID')}`,
      data: {
        id: closed.id,
        shiftName: closed.shiftName,
        outletId: closed.outletId,
        outletName: closed.outlet?.name || 'Outlet',
        cashierId: closed.cashierId,
        cashierName: closed.cashier?.name || 'Kasir',
        terminalId: closed.terminalId,
        startTime: closed.startTime.toISOString(),
        endTime: closed.endTime?.toISOString(),
        startingCash: Number(closed.startingCash),
        cashSales: Number(closed.cashSales),
        qrisSales: Number(closed.qrisSales),
        pettyCashOut: Number(closed.pettyCashOut),
        expectedCash: Number(closed.expectedCash),
        actualEndingCash: Number(closed.actualEndingCash),
        difference: Number(closed.difference),
        notes: closed.notes,
        status: closed.status,
        opnameSubmittedCount: opnameAuditResults.length,
        ...(isCashier ? {} : { materialOpnames: opnameAuditResults }),
      },
    });
  } catch (error: any) {
    console.error('[Close Shift Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menutup sesi shift' });
  }
};

export const getShiftHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, limit = '15' } = req.query;

    const whereClause: any = { status: ShiftStatus.CLOSED };
    if (outletId && outletId !== 'all') {
      whereClause.outletId = String(outletId);
    }

    const shifts = await prisma.shiftSession.findMany({
      where: whereClause,
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
      },
      orderBy: { endTime: 'desc' },
      take: parseInt(String(limit), 10) || 15,
    });

    const formatted = shifts.map((s) => ({
      id: s.id,
      shiftName: s.shiftName,
      outletId: s.outletId,
      outletName: s.outlet?.name || 'Outlet',
      cashierId: s.cashierId,
      cashierName: s.cashier?.name || 'Kasir',
      terminalId: s.terminalId,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime ? s.endTime.toISOString() : undefined,
      startingCash: Number(s.startingCash),
      cashSales: Number(s.cashSales),
      qrisSales: Number(s.qrisSales),
      pettyCashOut: Number(s.pettyCashOut),
      expectedCash: Number(s.expectedCash),
      actualEndingCash: s.actualEndingCash ? Number(s.actualEndingCash) : undefined,
      difference: s.difference ? Number(s.difference) : undefined,
      notes: s.notes || undefined,
      status: s.status,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Shift History Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat riwayat shift' });
  }
};

