"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpense = exports.updateExpense = exports.toggleExpenseStatus = exports.createExpense = exports.getExpenses = void 0;
const database_1 = require("../config/database");
const client_1 = require("@prisma/client");
const getExpenses = async (req, res) => {
    try {
        const { outletId } = req.query;
        const whereClause = {};
        if (outletId && outletId !== 'all') {
            whereClause.OR = [
                { outletId: String(outletId) },
                { outletId: null },
            ];
        }
        const expenses = await database_1.prisma.fixedExpense.findMany({
            where: whereClause,
            include: {
                outlet: { select: { name: true } },
            },
            orderBy: { dueDate: 'asc' },
        });
        const formatted = expenses.map((exp) => ({
            id: exp.id,
            code: exp.code,
            title: exp.title,
            category: exp.category,
            outletId: exp.outletId || 'all',
            outletName: exp.outlet ? exp.outlet.name : 'Konsolidasi 3 Outlet',
            amount: Number(exp.amount),
            period: exp.period,
            status: exp.status,
            dueDate: exp.dueDate.toISOString().slice(0, 10),
            autoDebet: exp.autoDebet,
        }));
        res.json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('[Expenses Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memuat beban operasional tetap' });
    }
};
exports.getExpenses = getExpenses;
const createExpense = async (req, res) => {
    try {
        const { title, category, outletId, amount, period, dueDate, autoDebet } = req.body;
        const prefix = category.substring(0, 3).toUpperCase();
        const count = await database_1.prisma.fixedExpense.count();
        const code = `OPX-${prefix}-${String(count + 1).padStart(3, '0')}`;
        const created = await database_1.prisma.fixedExpense.create({
            data: {
                code,
                title,
                category: category,
                outletId: (!outletId || outletId === 'all') ? null : outletId,
                amount,
                period: period || 'Bulan Ini',
                dueDate: new Date(dueDate || Date.now()),
                autoDebet: Boolean(autoDebet),
                status: client_1.ExpenseStatus.TERJADWAL,
            },
            include: {
                outlet: { select: { name: true } },
            },
        });
        res.status(201).json({
            success: true,
            message: `Beban operasional ${created.title} berhasil dicatat`,
            data: {
                ...created,
                amount: Number(created.amount),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal mencatat beban operasional' });
    }
};
exports.createExpense = createExpense;
const toggleExpenseStatus = async (req, res) => {
    try {
        const id = String(req.params.id);
        const exp = await database_1.prisma.fixedExpense.findUnique({ where: { id } });
        if (!exp) {
            return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
        }
        const newStatus = exp.status === client_1.ExpenseStatus.LUNAS ? client_1.ExpenseStatus.TERJADWAL : client_1.ExpenseStatus.LUNAS;
        const updated = await database_1.prisma.fixedExpense.update({
            where: { id },
            data: { status: newStatus },
            include: { outlet: { select: { name: true } } },
        });
        res.json({
            success: true,
            message: `Status beban ${updated.title} diubah menjadi: ${updated.status}`,
            data: {
                ...updated,
                amount: Number(updated.amount),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal mengubah status beban' });
    }
};
exports.toggleExpenseStatus = toggleExpenseStatus;
const updateExpense = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { title, category, outletId, amount, period, dueDate, autoDebet, status } = req.body;
        const existing = await database_1.prisma.fixedExpense.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
        }
        const updated = await database_1.prisma.fixedExpense.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(category && { category: category }),
                ...(outletId !== undefined && { outletId: (!outletId || outletId === 'all') ? null : outletId }),
                ...(amount !== undefined && { amount: parseFloat(amount) }),
                ...(period && { period }),
                ...(dueDate && { dueDate: new Date(dueDate) }),
                ...(autoDebet !== undefined && { autoDebet: Boolean(autoDebet) }),
                ...(status && { status: status }),
            },
            include: { outlet: { select: { name: true } } },
        });
        res.json({
            success: true,
            message: `Beban operasional ${updated.title} berhasil diperbarui`,
            data: {
                ...updated,
                amount: Number(updated.amount),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui beban operasional' });
    }
};
exports.updateExpense = updateExpense;
const deleteExpense = async (req, res) => {
    try {
        const id = String(req.params.id);
        const existing = await database_1.prisma.fixedExpense.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
        }
        await database_1.prisma.fixedExpense.delete({ where: { id } });
        res.json({
            success: true,
            message: `Beban operasional ${existing.title} (${existing.code}) berhasil dihapus`,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal menghapus beban operasional' });
    }
};
exports.deleteExpense = deleteExpense;
