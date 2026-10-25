"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShiftHistory = exports.closeShift = exports.openShift = exports.getCurrentShift = void 0;
const database_1 = require("../config/database");
const client_1 = require("@prisma/client");
const getCurrentShift = async (req, res) => {
    try {
        const { outletId } = req.query;
        const whereClause = { status: client_1.ShiftStatus.ACTIVE };
        if (outletId && outletId !== 'all') {
            whereClause.outletId = String(outletId);
        }
        const shift = await database_1.prisma.shiftSession.findFirst({
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
                outletName: shift.outlet.name,
                cashierId: shift.cashierId,
                cashierName: shift.cashier.name,
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
    }
    catch (error) {
        console.error('[Shift Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memuat status shift' });
    }
};
exports.getCurrentShift = getCurrentShift;
const openShift = async (req, res) => {
    try {
        const { outletId, startingCash = 500000, shiftName = 'Shift 1 Pagi' } = req.body;
        let targetOutletId = outletId;
        if (!targetOutletId || targetOutletId === 'all') {
            targetOutletId = req.user?.outletId;
        }
        if (!targetOutletId) {
            const firstOutlet = await database_1.prisma.outlet.findFirst();
            targetOutletId = firstOutlet ? firstOutlet.id : undefined;
        }
        if (!targetOutletId) {
            return res.status(400).json({ success: false, message: 'Outlet tidak valid' });
        }
        const cashierId = req.user?.id;
        if (!cashierId) {
            return res.status(401).json({ success: false, message: 'Kasir tidak teridentifikasi. Harap login kembali.' });
        }
        // Check if there is already an active shift for this outlet
        const existingActive = await database_1.prisma.shiftSession.findFirst({
            where: {
                outletId: targetOutletId,
                status: client_1.ShiftStatus.ACTIVE,
            },
        });
        if (existingActive) {
            return res.status(400).json({
                success: false,
                message: 'Masih ada sesi shift aktif untuk outlet ini. Harap tutup shift sebelumnya terlebih dahulu.',
            });
        }
        const newShift = await database_1.prisma.shiftSession.create({
            data: {
                shiftName,
                outletId: targetOutletId,
                cashierId,
                terminalId: 'POS-01 Terminal',
                startingCash,
                cashSales: 0,
                qrisSales: 0,
                pettyCashOut: 0,
                expectedCash: startingCash,
                status: client_1.ShiftStatus.ACTIVE,
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
                outletName: newShift.outlet.name,
                cashierId: newShift.cashierId,
                cashierName: newShift.cashier.name,
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
    }
    catch (error) {
        console.error('[Open Shift Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal membuka sesi shift' });
    }
};
exports.openShift = openShift;
const closeShift = async (req, res) => {
    try {
        const { actualEndingCash, notes } = req.body;
        const activeShift = await database_1.prisma.shiftSession.findFirst({
            where: { status: client_1.ShiftStatus.ACTIVE },
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
        const closed = await database_1.prisma.shiftSession.update({
            where: { id: activeShift.id },
            data: {
                status: client_1.ShiftStatus.CLOSED,
                endTime: new Date(),
                actualEndingCash: actual,
                difference: diff,
                notes: notes || null,
            },
            include: {
                outlet: { select: { name: true } },
                cashier: { select: { name: true } },
            },
        });
        res.json({
            success: true,
            message: `Shift kasir resmi ditutup. Selisih kas: Rp ${diff.toLocaleString('id-ID')}`,
            data: {
                id: closed.id,
                shiftName: closed.shiftName,
                outletId: closed.outletId,
                outletName: closed.outlet.name,
                cashierId: closed.cashierId,
                cashierName: closed.cashier.name,
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
            },
        });
    }
    catch (error) {
        console.error('[Close Shift Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal menutup sesi shift' });
    }
};
exports.closeShift = closeShift;
const getShiftHistory = async (req, res) => {
    try {
        const { outletId, limit = '15' } = req.query;
        const whereClause = { status: client_1.ShiftStatus.CLOSED };
        if (outletId && outletId !== 'all') {
            whereClause.outletId = String(outletId);
        }
        const shifts = await database_1.prisma.shiftSession.findMany({
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
            outletName: s.outlet.name,
            cashierId: s.cashierId,
            cashierName: s.cashier.name,
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
    }
    catch (error) {
        console.error('[Shift History Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memuat riwayat shift' });
    }
};
exports.getShiftHistory = getShiftHistory;
