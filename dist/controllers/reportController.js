"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfitLoss = void 0;
const database_1 = require("../config/database");
const client_1 = require("@prisma/client");
const getProfitLoss = async (req, res) => {
    try {
        const { outletId } = req.query;
        const outletFilter = outletId && outletId !== 'all' ? { outletId: String(outletId) } : {};
        // 1. Sales & HPP from PAID orders
        const orders = await database_1.prisma.order.findMany({
            where: {
                ...outletFilter,
                status: client_1.OrderStatus.PAID,
            },
        });
        const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
        const totalHpp = orders.reduce((sum, o) => sum + Number(o.hppTotal), 0);
        const grossProfit = totalSales - totalHpp;
        const grossMarginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
        // 2. Petty cash approved
        const pettyCashRecords = await database_1.prisma.pettyCash.findMany({
            where: {
                ...outletFilter,
                status: client_1.PettyCashStatus.DISETUJUI,
            },
        });
        const totalPettyCash = pettyCashRecords.reduce((sum, pc) => sum + Number(pc.amount), 0);
        // 3. Fixed Expenses paid
        const fixedExpenses = await database_1.prisma.fixedExpense.findMany({
            where: {
                ...(outletId && outletId !== 'all' ? { OR: [{ outletId: String(outletId) }, { outletId: null }] } : {}),
                status: client_1.ExpenseStatus.LUNAS,
            },
        });
        const totalFixedExpenses = fixedExpenses.reduce((sum, fe) => sum + Number(fe.amount), 0);
        // 4. Net Profit
        const totalOpex = totalPettyCash + totalFixedExpenses;
        const netProfit = grossProfit - totalOpex;
        const netMarginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
        // 5. Outlets breakdown
        const outlets = await database_1.prisma.outlet.findMany();
        const outletBreakdowns = await Promise.all(outlets.map(async (o) => {
            const oOrders = await database_1.prisma.order.findMany({
                where: { outletId: o.id, status: client_1.OrderStatus.PAID },
            });
            const oSales = oOrders.reduce((s, ord) => s + Number(ord.total), 0);
            const oHpp = oOrders.reduce((s, ord) => s + Number(ord.hppTotal), 0);
            const oGross = oSales - oHpp;
            const oPc = await database_1.prisma.pettyCash.findMany({
                where: { outletId: o.id, status: client_1.PettyCashStatus.DISETUJUI },
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
        }));
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
    }
    catch (error) {
        console.error('[Report Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal menghitung laporan laba rugi' });
    }
};
exports.getProfitLoss = getProfitLoss;
