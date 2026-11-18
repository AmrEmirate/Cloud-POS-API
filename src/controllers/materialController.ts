import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

export const getRawMaterials = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId } = req.query;
    const whereClause: any = { isDeleted: false };
    if (outletId && outletId !== 'all') {
      whereClause.OR = [{ outletId: String(outletId) }, { outletId: null }];
    }

    const materials = await prisma.rawMaterial.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    });

    const formatted = materials.map((m) => ({
      id: m.id,
      outletId: m.outletId,
      name: m.name,
      unit: m.unit,
      costPerUnit: Number(m.costPerUnit),
      currentStock: Number(m.currentStock),
      minStock: Number(m.minStock),
      isLowStock: Number(m.currentStock) <= Number(m.minStock),
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[RawMaterial Get Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat bahan baku' });
  }
};

export const createRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const { name, unit = 'pcs', costPerUnit = 0, currentStock = 0, minStock = 0, outletId } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Nama bahan baku wajib diisi' });
    }

    const created = await prisma.rawMaterial.create({
      data: {
        tenantId: req.user?.tenantId || null,
        outletId: outletId && outletId !== 'all' ? String(outletId) : null,
        name: String(name).trim(),
        unit: String(unit).trim() || 'pcs',
        costPerUnit: Number(costPerUnit) || 0,
        currentStock: Number(currentStock) || 0,
        minStock: Number(minStock) || 0,
      },
    });

    res.status(201).json({
      success: true,
      message: `Bahan baku "${created.name}" berhasil ditambahkan`,
      data: {
        id: created.id,
        outletId: created.outletId,
        name: created.name,
        unit: created.unit,
        costPerUnit: Number(created.costPerUnit),
        currentStock: Number(created.currentStock),
        minStock: Number(created.minStock),
      },
    });
  } catch (error: any) {
    console.error('[RawMaterial Create Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menambah bahan baku' });
  }
};

export const updateRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, unit, costPerUnit, currentStock, minStock, addStock } = req.body;

    const existing = await prisma.rawMaterial.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({ success: false, message: 'Bahan baku tidak ditemukan' });
    }

    const nextStock =
      addStock !== undefined
        ? Number(existing.currentStock) + (Number(addStock) || 0)
        : currentStock !== undefined
          ? Number(currentStock)
          : undefined;

    const updated = await prisma.rawMaterial.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(unit !== undefined && { unit: String(unit).trim() }),
        ...(costPerUnit !== undefined && { costPerUnit: Number(costPerUnit) || 0 }),
        ...(nextStock !== undefined && { currentStock: nextStock }),
        ...(minStock !== undefined && { minStock: Number(minStock) || 0 }),
      },
    });

    res.json({
      success: true,
      message: `Bahan baku "${updated.name}" berhasil diperbarui`,
      data: {
        id: updated.id,
        outletId: updated.outletId,
        name: updated.name,
        unit: updated.unit,
        costPerUnit: Number(updated.costPerUnit),
        currentStock: Number(updated.currentStock),
        minStock: Number(updated.minStock),
      },
    });
  } catch (error: any) {
    console.error('[RawMaterial Update Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui bahan baku' });
  }
};

export const deleteRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.rawMaterial.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.json({ success: true, message: 'Bahan baku berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus bahan baku' });
  }
};

export const getMenuRecipes = async (req: AuthRequest, res: Response) => {
  try {
    const { menuId } = req.query;
    const whereClause: any = {};
    if (menuId) {
      whereClause.menuId = String(menuId);
    }

    const recipes = await prisma.menuRecipeItem.findMany({
      where: whereClause,
      include: {
        rawMaterial: { select: { id: true, name: true, unit: true, costPerUnit: true } },
        menu: { select: { id: true, name: true, code: true } },
      },
    });

    const formatted = recipes.map((r) => ({
      id: r.id,
      menuId: r.menuId,
      menuName: r.menu?.name,
      rawMaterialId: r.rawMaterialId,
      rawMaterialName: r.rawMaterial?.name,
      unit: r.rawMaterial?.unit || 'pcs',
      costPerUnit: Number(r.rawMaterial?.costPerUnit || 0),
      quantityUsed: Number(r.quantityUsed),
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat resep menu' });
  }
};

export const upsertMenuRecipe = async (req: AuthRequest, res: Response) => {
  try {
    const menuId = String(req.params.menuId);
    const { items } = req.body as { items: Array<{ rawMaterialId: string; quantityUsed: number }> };

    const menu = await prisma.menuItem.findUnique({ where: { id: menuId } });
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.menuRecipeItem.deleteMany({ where: { menuId } });
      if (Array.isArray(items) && items.length > 0) {
        await tx.menuRecipeItem.createMany({
          data: items
            .filter((it) => it.rawMaterialId && Number(it.quantityUsed) > 0)
            .map((it) => ({
              menuId,
              rawMaterialId: it.rawMaterialId,
              quantityUsed: Number(it.quantityUsed),
            })),
        });
      }
    });

    res.json({ success: true, message: `Resep bahan baku untuk "${menu.name}" berhasil disimpan` });
  } catch (error: any) {
    console.error('[Upsert Recipe Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menyimpan resep menu' });
  }
};

export const getShiftOpnameAudit = async (req: AuthRequest, res: Response) => {
  try {
    const { shiftId, outletId, limit = '30' } = req.query;
    const whereClause: any = {};
    if (shiftId) {
      whereClause.shiftId = String(shiftId);
    } else if (outletId && outletId !== 'all') {
      whereClause.shift = { outletId: String(outletId) };
    }

    const logs = await prisma.shiftMaterialOpname.findMany({
      where: whereClause,
      include: {
        rawMaterial: { select: { name: true, unit: true, costPerUnit: true } },
        shift: {
          select: {
            id: true,
            shiftName: true,
            endTime: true,
            outlet: { select: { name: true } },
            cashier: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(limit), 10) || 30,
    });

    const formatted = logs.map((l) => ({
      id: l.id,
      shiftId: l.shiftId,
      shiftName: l.shift?.shiftName || 'Shift',
      outletName: l.shift?.outlet?.name || 'Outlet',
      cashierName: l.shift?.cashier?.name || 'Kasir',
      shiftEndTime: l.shift?.endTime?.toISOString() || l.createdAt.toISOString(),
      rawMaterialId: l.rawMaterialId,
      materialName: l.rawMaterial?.name || 'Bahan',
      unit: l.rawMaterial?.unit || 'pcs',
      openingStock: Number(l.openingStock),
      restockIn: Number(l.restockIn),
      theoreticalUsed: Number(l.theoreticalUsed),
      expectedClosing: Number(l.expectedClosing),
      actualClosing: Number(l.actualClosing),
      variance: Number(l.variance),
      varianceValue: Number(l.varianceValue),
      status: l.status,
      notes: l.notes || undefined,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Opname Audit Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat audit opname' });
  }
};
