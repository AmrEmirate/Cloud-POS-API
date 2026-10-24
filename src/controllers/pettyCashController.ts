import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { PettyCashStatus, PettyCashCategory } from '@prisma/client';

export const getPettyCash = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId } = req.query;

    const whereClause: any = {};
    if (outletId && outletId !== 'all') {
      whereClause.outletId = String(outletId);
    }

    const records = await prisma.pettyCash.findMany({
      where: whereClause,
      include: {
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
        verifiedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = records.map((pc) => ({
      id: pc.id,
      expenseNumber: pc.expenseNumber,
      outletId: pc.outletId,
      outletName: pc.outlet?.name || 'Outlet',
      cashierName: pc.cashier.name,
      amount: Number(pc.amount),
      category: pc.category,
      description: pc.description,
      receiptImageUrl: pc.receiptImageUrl || 'https://images.unsplash.com/photo-1554415707-9e49017aed81?w=500&auto=format&fit=crop&q=80',
      status: pc.status,
      verifiedBy: pc.verifiedBy ? pc.verifiedBy.name : undefined,
      verifiedAt: pc.verifiedAt ? pc.verifiedAt.toISOString() : undefined,
      createdAt: pc.createdAt.toISOString(),
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Petty Cash Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat kas kecil' });
  }
};

export const createPettyCash = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, amount, category, description, receiptImageUrl, maxLimit } = req.body;

    const numAmount = parseFloat(amount);
    const limit = maxLimit ? parseFloat(maxLimit) : 5000000;
    if (numAmount > limit) {
      return res.status(400).json({
        success: false,
        message: `Pengeluaran kas kecil darurat laci kasir maksimal Rp ${limit.toLocaleString('id-ID')} per nota!`,
      });
    }

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

    const cashierId = req.user?.id;
    if (!cashierId) {
      return res.status(401).json({ success: false, message: 'Kasir tidak teridentifikasi. Harap login kembali.' });
    }

    const outlet = await prisma.outlet.findUnique({ where: { id: targetOutletId } });
    const outletCode = outlet ? outlet.code.replace('-', '') : 'DU01';

    const now = new Date();
    const ymStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await prisma.pettyCash.count({ where: { outletId: targetOutletId } });
    const expenseNumber = `PC-${outletCode}-${ymStr}-${String(count + 1).padStart(3, '0')}`;

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (receiptImageUrl || 'https://images.unsplash.com/photo-1554415707-9e49017aed81?w=500&auto=format&fit=crop&q=80');

    // Create record and update active shift in transaction
    const newRecord = await prisma.$transaction(async (tx) => {
      const rec = await tx.pettyCash.create({
        data: {
          expenseNumber,
          outletId: targetOutletId,
          cashierId,
          amount: numAmount,
          category: category as PettyCashCategory,
          description,
          receiptImageUrl: imageUrl,
          status: PettyCashStatus.MENUNGGU_VERIFIKASI,
        },
        include: {
          outlet: { select: { name: true } },
          cashier: { select: { name: true } },
        },
      });

      // Update active shift if any
      const activeShift = await tx.shiftSession.findFirst({
        where: {
          outletId: targetOutletId,
          status: 'ACTIVE',
        },
      });

      if (activeShift) {
        await tx.shiftSession.update({
          where: { id: activeShift.id },
          data: {
            pettyCashOut: { increment: numAmount },
            expectedCash: { decrement: numAmount },
          },
        });
      }

      return rec;
    });

    res.status(201).json({
      success: true,
      message: `Kas kecil ${newRecord.expenseNumber} sebesar Rp ${numAmount.toLocaleString('id-ID')} berhasil dicatat`,
      data: {
        id: newRecord.id,
        expenseNumber: newRecord.expenseNumber,
        outletId: newRecord.outletId,
        outletName: newRecord.outlet.name,
        cashierName: newRecord.cashier.name,
        amount: Number(newRecord.amount),
        category: newRecord.category,
        description: newRecord.description,
        receiptImageUrl: newRecord.receiptImageUrl,
        status: newRecord.status,
        createdAt: newRecord.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Create Petty Cash Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal mencatat kas kecil' });
  }
};

export const updatePettyCash = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { amount, category, description, receiptImageUrl } = req.body;

    const existing = await prisma.pettyCash.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Catatan kas kecil tidak ditemukan' });
    }

    if (existing.status !== PettyCashStatus.MENUNGGU_VERIFIKASI) {
      return res.status(400).json({
        success: false,
        message: 'Kas kecil yang sudah diverifikasi tidak dapat diubah!',
      });
    }

    const newAmount = amount !== undefined ? parseFloat(amount) : Number(existing.amount);
    const limit = req.body.maxLimit ? parseFloat(req.body.maxLimit) : 5000000;
    if (newAmount > limit) {
      return res.status(400).json({
        success: false,
        message: `Pengeluaran kas kecil darurat laci kasir maksimal Rp ${limit.toLocaleString('id-ID')} per nota!`,
      });
    }

    const diff = newAmount - Number(existing.amount);

    const updated = await prisma.$transaction(async (tx) => {
      const pc = await tx.pettyCash.update({
        where: { id },
        data: {
          amount: newAmount,
          ...(category && { category: category as PettyCashCategory }),
          ...(description && { description }),
          ...(receiptImageUrl && { receiptImageUrl }),
        },
        include: {
          outlet: { select: { name: true } },
          cashier: { select: { name: true } },
        },
      });

      // If amount changed and there is active shift, adjust shift
      if (diff !== 0) {
        const activeShift = await tx.shiftSession.findFirst({
          where: { outletId: existing.outletId, status: 'ACTIVE' },
        });
        if (activeShift) {
          await tx.shiftSession.update({
            where: { id: activeShift.id },
            data: {
              pettyCashOut: { increment: diff },
              expectedCash: { decrement: diff },
            },
          });
        }
      }

      return pc;
    });

    res.json({
      success: true,
      message: `Kas kecil ${updated.expenseNumber} berhasil diperbarui`,
      data: {
        id: updated.id,
        expenseNumber: updated.expenseNumber,
        outletId: updated.outletId,
        outletName: updated.outlet.name,
        cashierName: updated.cashier.name,
        amount: Number(updated.amount),
        category: updated.category,
        description: updated.description,
        receiptImageUrl: updated.receiptImageUrl,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Update Petty Cash Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui kas kecil' });
  }
};

export const verifyPettyCash = async (req: AuthRequest, res: Response) => {

  try {
    const id = String(req.params.id);
    const { status } = req.body; // 'DISETUJUI' | 'DITOLAK'

    const verifierId = req.user?.id || (await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } }))?.id;

    const updated: any = await prisma.pettyCash.update({
      where: { id },
      data: {
        status: status === 'DISETUJUI' ? PettyCashStatus.DISETUJUI : PettyCashStatus.DITOLAK,
        verifiedById: verifierId,
        verifiedAt: new Date(),
      },
      include: {
        verifiedBy: { select: { name: true } },
      },
    });

    res.json({
      success: true,
      message: `Status kas kecil ${updated.expenseNumber} diperbarui menjadi: ${updated.status}`,
      data: {
        id: updated.id,
        status: updated.status,
        verifiedBy: updated.verifiedBy?.name,
        verifiedAt: updated.verifiedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memverifikasi kas kecil' });
  }
};

export const deletePettyCash = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ success: false, message: 'PIN Supervisor wajib disertakan' });
    }

    const supervisors = await prisma.user.findMany({
      where: { role: { in: ['OWNER', 'SUPERVISOR'] } },
    });

    let authorized = false;
    for (const spv of supervisors) {
      if (spv.pinHash && (await bcrypt.compare(pin, spv.pinHash))) {
        authorized = true;
        break;
      }
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'PIN Supervisor tidak valid!' });
    }

    await prisma.pettyCash.delete({ where: { id } });

    res.json({ success: true, message: 'Nota kas kecil berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus kas kecil' });
  }
};
