"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInvoice = exports.updateInvoice = exports.payInvoice = exports.createInvoice = exports.getInvoices = void 0;
const database_1 = require("../config/database");
const client_1 = require("@prisma/client");
const getInvoices = async (req, res) => {
    try {
        const { outletId } = req.query;
        const whereClause = {};
        if (outletId && outletId !== 'all') {
            whereClause.outletId = String(outletId);
        }
        const invoices = await database_1.prisma.factoryInvoice.findMany({
            where: whereClause,
            include: {
                items: true,
                outlet: { select: { name: true } },
            },
            orderBy: { issueDate: 'desc' },
        });
        const formatted = invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.supplierName,
            outletId: inv.outletId,
            outletName: inv.outlet?.name || 'Outlet',
            issueDate: inv.issueDate.toISOString().slice(0, 10),
            dueDate: inv.dueDate.toISOString().slice(0, 10),
            totalAmount: Number(inv.totalAmount),
            status: inv.status,
            bankAccount: inv.bankAccount,
            paidAt: inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : undefined,
            proofImageUrl: inv.proofImageUrl || undefined,
            items: inv.items.map((it) => ({
                itemName: it.itemName,
                quantity: it.quantity,
                unit: it.unit,
                unitCost: Number(it.unitCost),
                total: Number(it.total),
            })),
        }));
        res.json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('[Invoice Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memuat faktur tagihan pabrik' });
    }
};
exports.getInvoices = getInvoices;
const createInvoice = async (req, res) => {
    try {
        const { supplierName, outletId, issueDate, dueDate, totalAmount, bankAccount, items } = req.body;
        let targetOutletId = outletId;
        if (!targetOutletId || targetOutletId === 'all') {
            const firstOutlet = await database_1.prisma.outlet.findFirst();
            targetOutletId = firstOutlet ? firstOutlet.id : 'du';
        }
        const count = await database_1.prisma.factoryInvoice.count();
        const invoiceNumber = `INV-PBR-${new Date().toISOString().slice(0, 7)}-${String(count + 1).padStart(2, '0')}`;
        const created = await database_1.prisma.factoryInvoice.create({
            data: {
                invoiceNumber,
                supplierName: supplierName || 'PT Dimsum Prima Rasa (Pusat)',
                outletId: targetOutletId,
                issueDate: new Date(issueDate || Date.now()),
                dueDate: new Date(dueDate || Date.now() + 10 * 24 * 60 * 60 * 1000),
                totalAmount: totalAmount,
                bankAccount: bankAccount || 'BCA 7788-990-112 a.n PT Dimsum Prima Rasa',
                status: client_1.InvoiceStatus.BELUM_LUNAS,
                items: {
                    create: (items || []).map((it) => ({
                        itemName: it.itemName,
                        quantity: it.quantity,
                        unit: it.unit || 'Pouch',
                        unitCost: it.unitCost,
                        total: it.total,
                    })),
                },
            },
            include: {
                items: true,
                outlet: { select: { name: true } },
            },
        });
        // Otomatis restock menu items yang berelasi dengan kiriman pabrik
        if (items && Array.isArray(items)) {
            for (const it of items) {
                if (!it.itemName)
                    continue;
                const keywords = it.itemName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 2);
                for (const kw of keywords) {
                    if (['beku', 'pouch', 'pcs', 'pack', 'dimsum'].includes(kw))
                        continue;
                    const matched = await database_1.prisma.menuItem.findFirst({
                        where: {
                            name: { contains: kw, mode: 'insensitive' },
                            isDeleted: false,
                        },
                    });
                    if (matched) {
                        // Misal 1 pouch isi 100 pcs = 25 porsi (4 pcs per porsi)
                        const multiplier = it.itemName.includes('100') ? 25 : (it.unit?.toLowerCase().includes('pouch') ? 10 : 1);
                        const addedStock = (parseInt(it.quantity) || 1) * multiplier;
                        await database_1.prisma.menuItem.update({
                            where: { id: matched.id },
                            data: { stock: { increment: addedStock } },
                        }).catch(() => null);
                        break;
                    }
                }
            }
        }
        res.status(201).json({
            success: true,
            message: `Faktur tagihan pabrik ${created.invoiceNumber} berhasil dicatat & stok otomatis disinkronkan`,
            data: {
                ...created,
                totalAmount: Number(created.totalAmount),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal membuat tagihan pabrik' });
    }
};
exports.createInvoice = createInvoice;
const payInvoice = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { proofImageUrl } = req.body;
        const updated = await database_1.prisma.factoryInvoice.update({
            where: { id },
            data: {
                status: client_1.InvoiceStatus.LUNAS,
                paidAt: new Date(),
                proofImageUrl: proofImageUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500&auto=format&fit=crop&q=80',
            },
        });
        res.json({
            success: true,
            message: `Faktur ${updated.invoiceNumber} berhasil ditandai LUNAS`,
            data: updated,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal memproses pembayaran faktur' });
    }
};
exports.payInvoice = payInvoice;
const updateInvoice = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { supplierName, outletId, issueDate, dueDate, totalAmount, bankAccount, items, status } = req.body;
        const existing = await database_1.prisma.factoryInvoice.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Faktur tagihan pabrik tidak ditemukan' });
        }
        let targetOutletId = outletId || existing.outletId;
        if (targetOutletId === 'all') {
            const firstOutlet = await database_1.prisma.outlet.findFirst();
            targetOutletId = firstOutlet ? firstOutlet.id : existing.outletId;
        }
        // Recreate items if provided
        if (Array.isArray(items) && items.length > 0) {
            await database_1.prisma.factoryInvoiceItem.deleteMany({ where: { invoiceId: id } });
        }
        const updated = await database_1.prisma.factoryInvoice.update({
            where: { id },
            data: {
                supplierName: supplierName ?? existing.supplierName,
                outletId: targetOutletId,
                issueDate: issueDate ? new Date(issueDate) : existing.issueDate,
                dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
                totalAmount: totalAmount !== undefined ? totalAmount : existing.totalAmount,
                bankAccount: bankAccount ?? existing.bankAccount,
                status: status ? status : existing.status,
                ...(Array.isArray(items) && items.length > 0
                    ? {
                        items: {
                            create: items.map((it) => ({
                                itemName: it.itemName,
                                quantity: Number(it.quantity) || 1,
                                unit: it.unit || 'Pouch',
                                unitCost: Number(it.unitCost) || 0,
                                total: Number(it.total) || 0,
                            })),
                        },
                    }
                    : {}),
            },
            include: {
                items: true,
                outlet: { select: { name: true } },
            },
        });
        res.json({
            success: true,
            message: `Faktur tagihan ${updated.invoiceNumber} berhasil diperbarui`,
            data: {
                id: updated.id,
                invoiceNumber: updated.invoiceNumber,
                supplierName: updated.supplierName,
                outletId: updated.outletId,
                outletName: updated.outlet?.name || 'Outlet',
                issueDate: updated.issueDate.toISOString().slice(0, 10),
                dueDate: updated.dueDate.toISOString().slice(0, 10),
                totalAmount: Number(updated.totalAmount),
                status: updated.status,
                bankAccount: updated.bankAccount,
                paidAt: updated.paidAt ? updated.paidAt.toISOString().slice(0, 10) : undefined,
                proofImageUrl: updated.proofImageUrl || undefined,
                items: updated.items.map((it) => ({
                    itemName: it.itemName,
                    quantity: it.quantity,
                    unit: it.unit,
                    unitCost: Number(it.unitCost),
                    total: Number(it.total),
                })),
            },
        });
    }
    catch (error) {
        console.error('[Invoice Update Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui tagihan pabrik' });
    }
};
exports.updateInvoice = updateInvoice;
const deleteInvoice = async (req, res) => {
    try {
        const id = String(req.params.id);
        const existing = await database_1.prisma.factoryInvoice.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Faktur tagihan pabrik tidak ditemukan' });
        }
        await database_1.prisma.factoryInvoice.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: `Faktur tagihan ${existing.invoiceNumber} berhasil dihapus dari sistem`,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal menghapus tagihan pabrik' });
    }
};
exports.deleteInvoice = deleteInvoice;
