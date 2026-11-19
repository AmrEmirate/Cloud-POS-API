import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { OrderStatus, PettyCashStatus, ExpenseStatus } from '@prisma/client';

export const getProfitLoss = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, startDate, endDate } = req.query;

    const outletFilter = outletId && outletId !== 'all' ? { outletId: String(outletId) } : {};
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(String(startDate));
    }
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    // Jalankan agregasi SQL terpusat secara paralel (O(1) query complexity, tanpa memuat ribuan baris ke RAM)
    const [
      outlets,
      ordersByOutlet,
      pettyCashByOutlet,
      fixedExpenseAgg,
    ] = await Promise.all([
      prisma.outlet.findMany({ orderBy: { code: 'asc' } }),
      prisma.order.groupBy({
        by: ['outletId'],
        where: {
          status: OrderStatus.PAID,
          ...(hasDate ? { createdAt: dateFilter } : {}),
        },
        _sum: {
          total: true,
          hppTotal: true,
        },
      }),
      prisma.pettyCash.groupBy({
        by: ['outletId'],
        where: {
          status: PettyCashStatus.DISETUJUI,
          ...(hasDate ? { createdAt: dateFilter } : {}),
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.fixedExpense.aggregate({
        where: {
          ...(outletId && outletId !== 'all'
            ? { OR: [{ outletId: String(outletId) }, { outletId: null }] }
            : {}),
          status: ExpenseStatus.LUNAS,
          ...(hasDate ? { dueDate: dateFilter } : {}),
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const orderAggMap = new Map<string, { sales: number; hpp: number }>();
    for (const row of ordersByOutlet) {
      orderAggMap.set(row.outletId, {
        sales: Number(row._sum?.total || 0),
        hpp: Number(row._sum?.hppTotal || 0),
      });
    }

    const pettyAggMap = new Map<string, number>();
    for (const row of pettyCashByOutlet) {
      pettyAggMap.set(row.outletId, Number(row._sum?.amount || 0));
    }

    const targetOutletId = outletId && outletId !== 'all' ? String(outletId) : null;
    let totalSales = 0;
    let totalHpp = 0;
    let totalPettyCash = 0;

    for (const [oId, agg] of orderAggMap.entries()) {
      if (!targetOutletId || targetOutletId === oId) {
        totalSales += agg.sales;
        totalHpp += agg.hpp;
      }
    }

    for (const [oId, amt] of pettyAggMap.entries()) {
      if (!targetOutletId || targetOutletId === oId) {
        totalPettyCash += amt;
      }
    }

    const grossProfit = totalSales - totalHpp;
    const grossMarginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const totalFixedExpenses = Number(fixedExpenseAgg._sum?.amount || 0);
    const totalOpex = totalPettyCash + totalFixedExpenses;
    const netProfit = grossProfit - totalOpex;
    const netMarginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    const outletBreakdowns = outlets.map((o) => {
      const ordAgg = orderAggMap.get(o.id) || { sales: 0, hpp: 0 };
      const oPetty = pettyAggMap.get(o.id) || 0;
      return {
        outletId: o.id,
        outletName: o.name,
        code: o.code,
        targetDailySales: Number(o.targetDailySales),
        actualSales: ordAgg.sales,
        hpp: ordAgg.hpp,
        grossProfit: ordAgg.sales - ordAgg.hpp,
        pettyCash: oPetty,
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalHpp,
          grossProfit,
          grossMarginPct: Number(grossMarginPct.toFixed(1)),
          totalPettyCash,
          totalFixedExpenses,
          totalOpex,
          netProfit,
          netMarginPct: Number(netMarginPct.toFixed(1)),
        },
        outletBreakdowns,
      },
    });
  } catch (error: any) {
    console.error('[Report Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menghitung laporan laba rugi' });
  }
};
