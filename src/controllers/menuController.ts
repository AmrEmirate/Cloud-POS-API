import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

export const getMenus = async (_req: Request, res: Response) => {
  try {
    const menus = await prisma.menuItem.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
    });

    const formatted = menus.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      category: m.category,
      price: Number(m.price),
      costPrice: Number(m.costPrice),
      stock: m.stock,
      description: m.description || '',
      image: m.image || '',
      isAvailable: m.isAvailable,
      isBestSeller: m.stock > 30,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Menu Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat katalog menu' });
  }
};

export const createMenu = async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, price, costPrice, stock, description, image } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Nama menu dan harga jual wajib diisi!' });
    }

    const cleanCategory = String(category || '').trim() || 'Umum';
    const prefix = cleanCategory.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MNU';
    const count = await prisma.menuItem.count({ where: { category: cleanCategory } });
    const code = `${prefix}-${String(count + 1).padStart(3, '0')}`;

    const tenantId = req.user?.role === 'SUPERADMIN' ? (req.body.tenantId || req.user?.tenantId || null) : (req.user?.tenantId || null);

    const newMenu = await prisma.menuItem.create({
      data: {
        code,
        name: String(name).trim(),
        category: cleanCategory,
        price: parseFloat(String(price)) || 0,
        costPrice: parseFloat(String(costPrice || 0)) || 0,
        stock: parseInt(String(stock), 10) || 0,
        description: description || '',
        image: image || 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=500&auto=format&fit=crop&q=80',
        isAvailable: true,
        tenantId,
      },
    });

    res.status(201).json({
      success: true,
      message: `Menu ${newMenu.name} (${newMenu.code}) berhasil didaftarkan`,
      data: {
        ...newMenu,
        price: Number(newMenu.price),
        costPrice: Number(newMenu.costPrice),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menambahkan menu' });
  }
};

export const updateMenu = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, category, price, costPrice, stock, description, image, isAvailable } = req.body;

    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Menu bukan milik toko Anda' });
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(name && { name: String(name).trim() }),
        ...(category && { category: String(category).trim() }),
        ...(price !== undefined && { price: parseFloat(String(price)) || 0 }),
        ...(costPrice !== undefined && { costPrice: parseFloat(String(costPrice)) || 0 }),
        ...(stock !== undefined && { stock: parseInt(String(stock), 10) }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(isAvailable !== undefined && { isAvailable }),
      },
    });

    res.json({
      success: true,
      message: `Menu ${updated.name} berhasil diperbarui`,
      data: {
        ...updated,
        price: Number(updated.price),
        costPrice: Number(updated.costPrice),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui menu' });
  }
};

export const toggleAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const menu = await prisma.menuItem.findUnique({ where: { id } });
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && menu.tenantId && req.user?.tenantId && menu.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Menu bukan milik toko Anda' });
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !menu.isAvailable },
    });

    res.json({
      success: true,
      message: `Status ketersediaan ${updated.name} diubah menjadi: ${updated.isAvailable ? 'Tersedia' : 'Habis'}`,
      data: {
        ...updated,
        price: Number(updated.price),
        costPrice: Number(updated.costPrice),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal mengubah status menu' });
  }
};

export const deleteMenu = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }

    if (req.user?.role !== 'SUPERADMIN' && existing.tenantId && req.user?.tenantId && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Menu bukan milik toko Anda' });
    }

    await prisma.menuItem.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.json({ success: true, message: 'Menu berhasil dihapus (soft delete)' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus menu' });
  }
};
