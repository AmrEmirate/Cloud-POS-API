import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { ExpenseStatus, FixedExpenseCategory } from '@prisma/client';

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId } = req.query;

    const whereClause: any = {};
    if (outletId && outletId !== 'all') {
      whereClause.OR = [
        { outletId: String(outletId) },
        { outletId: null },
      ];
    }

    const expenses = await prisma.fixedExpense.findMany({
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
  } catch (error: any) {
    console.error('[Expenses Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat beban operasional tetap' });
  }
};

export const createExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, outletId, amount, period, dueDate, autoDebet } = req.body;

    const cleanCategory = String(category || 'OPX').trim();
    const prefix = cleanCategory.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'OPX';
    const count = await prisma.fixedExpense.count();
    const code = `OPX-${prefix}-${String(count + 1).padStart(3, '0')}`;

    const tenantId = req.user?.tenantId || null;

    const created = await prisma.fixedExpense.create({
      data: {
        code,
        title: String(title || 'Beban Operasional').trim(),
        category: cleanCategory as FixedExpenseCategory,
        outletId: (!outletId || outletId === 'all') ? null : outletId,
        amount: parseFloat(String(amount)) || 0,
        period: period || 'Bulan Ini',
        dueDate: new Date(dueDate || Date.now()),
        autoDebet: Boolean(autoDebet),
        status: ExpenseStatus.TERJADWAL,
        tenantId,
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal mencatat beban operasional' });
  }
};

export const toggleExpenseStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const exp = await prisma.fixedExpense.findUnique({ where: { id } });
    if (!exp) {
      return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && exp.tenantId && req.user?.tenantId && exp.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Beban operasional bukan milik toko Anda' });
    }

    const newStatus = exp.status === ExpenseStatus.LUNAS ? ExpenseStatus.TERJADWAL : ExpenseStatus.LUNAS;

    const updated = await prisma.fixedExpense.update({
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal mengubah status beban' });
  }
};

export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { title, category, outletId, amount, period, dueDate, autoDebet, status } = req.body;

    const existing = await prisma.fixedExpense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Beban operasional bukan milik toko Anda' });
    }

    const updated = await prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(title && { title: String(title).trim() }),
        ...(category && { category: String(category).trim() as FixedExpenseCategory }),
        ...(outletId !== undefined && { outletId: (!outletId || outletId === 'all') ? null : outletId }),
        ...(amount !== undefined && { amount: parseFloat(String(amount)) || 0 }),
        ...(period && { period }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(autoDebet !== undefined && { autoDebet: Boolean(autoDebet) }),
        ...(status && { status: status as ExpenseStatus }),
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui beban operasional' });
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.fixedExpense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Beban operasional tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Beban operasional bukan milik toko Anda' });
    }

    await prisma.fixedExpense.delete({ where: { id } });

    res.json({
      success: true,
      message: `Beban operasional ${existing.title} (${existing.code}) berhasil dihapus`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus beban operasional' });
  }
};

