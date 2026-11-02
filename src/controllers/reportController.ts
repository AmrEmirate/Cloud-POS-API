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

    // 1. Sales & HPP from PAID orders
    const orders = await prisma.order.findMany({
      where: {
        ...outletFilter,
        status: OrderStatus.PAID,
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
    });

    const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalHpp = orders.reduce((sum, o) => sum + Number(o.hppTotal), 0);
    const grossProfit = totalSales - totalHpp;
    const grossMarginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    // 2. Petty cash approved
    const pettyCashRecords = await prisma.pettyCash.findMany({
      where: {
        ...outletFilter,
        status: PettyCashStatus.DISETUJUI,
        ...(hasDate ? { createdAt: dateFilter } : {}),
      },
    });
    const totalPettyCash = pettyCashRecords.reduce((sum, pc) => sum + Number(pc.amount), 0);

    // 3. Fixed Expenses paid
    const fixedExpenses = await prisma.fixedExpense.findMany({
      where: {
        ...(outletId && outletId !== 'all' ? { OR: [{ outletId: String(outletId) }, { outletId: null }] } : {}),
        status: ExpenseStatus.LUNAS,
        ...(hasDate ? { dueDate: dateFilter } : {}),
      },
    });
    const totalFixedExpenses = fixedExpenses.reduce((sum, fe) => sum + Number(fe.amount), 0);

    // 4. Net Profit
    const totalOpex = totalPettyCash + totalFixedExpenses;
    const netProfit = grossProfit - totalOpex;
    const netMarginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    // 5. Outlets breakdown
    const outlets = await prisma.outlet.findMany();
    const outletBreakdowns = await Promise.all(
      outlets.map(async (o) => {
        const oOrders = await prisma.order.findMany({
          where: {
            outletId: o.id,
            status: OrderStatus.PAID,
            ...(hasDate ? { createdAt: dateFilter } : {}),
          },
        });
        const oSales = oOrders.reduce((s, ord) => s + Number(ord.total), 0);
        const oHpp = oOrders.reduce((s, ord) => s + Number(ord.hppTotal), 0);
        const oGross = oSales - oHpp;

        const oPc = await prisma.pettyCash.findMany({
          where: {
            outletId: o.id,
            status: PettyCashStatus.DISETUJUI,
            ...(hasDate ? { createdAt: dateFilter } : {}),
          },
        });
        const oPetty = oPc.reduce((s, p) => s + Number(p.amount), 0);

        return {
          outletId: o.id,
          outletName: o.name,
          code: o.code,
          targetDailySales: Number(o.targetDailySales),
          actualSales: oSales,
          hpp: oHpp,
          grossProfit: oGross,
          pettyCash: oPetty,
        };
      })
    );

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
