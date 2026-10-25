import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

export const getOutlets = async (_req: Request, res: Response) => {
  try {
    const outlets = await prisma.outlet.findMany({
      orderBy: { code: 'asc' },
    });

    const formatted = outlets.map((o) => ({
      id: o.id,
      code: o.code,
      name: o.name,
      city: o.city,
      address: o.address,
      phone: o.phone,
      targetDailySales: Number(o.targetDailySales),
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Outlet Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal mengambil data outlet' });
  }
};

export const createOutlet = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, city = 'Bandung', address, phone, targetDailySales = 4000000 } = req.body;

    if (!code || !name || !address || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Kode cabang, nama, alamat, dan nomor telepon wajib diisi!',
      });
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

    const newOutlet = await prisma.outlet.create({
      data: {
        code: cleanCode,
        name: String(name).trim(),
        city: String(city).trim(),
        address: String(address).trim(),
        phone: String(phone).trim(),
        targetDailySales: parseFloat(String(targetDailySales)) || 0,
      },
    });

    res.status(201).json({
      success: true,
      message: `Cabang baru "${newOutlet.name}" (${newOutlet.code}) berhasil ditambahkan!`,
      data: {
        id: newOutlet.id,
        code: newOutlet.code,
        name: newOutlet.name,
        city: newOutlet.city,
        address: newOutlet.address,
        phone: newOutlet.phone,
        targetDailySales: Number(newOutlet.targetDailySales),
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
    const { code, name, city, address, phone, targetDailySales } = req.body;

    const existing = await prisma.outlet.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Outlet cabang tidak ditemukan!',
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
