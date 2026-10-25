"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOutlet = exports.updateOutlet = exports.createOutlet = exports.getOutlets = void 0;
const database_1 = require("../config/database");
const getOutlets = async (_req, res) => {
    try {
        const outlets = await database_1.prisma.outlet.findMany({
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
    }
    catch (error) {
        console.error('[Outlet Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengambil data outlet' });
    }
};
exports.getOutlets = getOutlets;
const createOutlet = async (req, res) => {
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
        const existing = await database_1.prisma.outlet.findUnique({
            where: { code: cleanCode },
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Kode cabang "${cleanCode}" sudah digunakan oleh outlet lain!`,
            });
        }
        const newOutlet = await database_1.prisma.outlet.create({
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
    }
    catch (error) {
        console.error('[Create Outlet Error]', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal menambahkan cabang baru',
        });
    }
};
exports.createOutlet = createOutlet;
const updateOutlet = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { code, name, city, address, phone, targetDailySales } = req.body;
        const existing = await database_1.prisma.outlet.findUnique({
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
            const codeTaken = await database_1.prisma.outlet.findUnique({
                where: { code: cleanCode },
            });
            if (codeTaken) {
                return res.status(400).json({
                    success: false,
                    message: `Kode cabang "${cleanCode}" sudah digunakan!`,
                });
            }
        }
        const updated = await database_1.prisma.outlet.update({
            where: { id },
            data: {
                code: cleanCode,
                name: name !== undefined ? String(name).trim() : existing.name,
                city: city !== undefined ? String(city).trim() : existing.city,
                address: address !== undefined ? String(address).trim() : existing.address,
                phone: phone !== undefined ? String(phone).trim() : existing.phone,
                targetDailySales: targetDailySales !== undefined
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
    }
    catch (error) {
        console.error('[Update Outlet Error]', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal memperbarui data cabang',
        });
    }
};
exports.updateOutlet = updateOutlet;
const deleteOutlet = async (req, res) => {
    try {
        const id = String(req.params.id);
        // Check relations
        const [orderCount, shiftCount, pcCount, invCount, expCount] = await Promise.all([
            database_1.prisma.order.count({ where: { outletId: id } }),
            database_1.prisma.shiftSession.count({ where: { outletId: id } }),
            database_1.prisma.pettyCash.count({ where: { outletId: id } }),
            database_1.prisma.factoryInvoice.count({ where: { outletId: id } }),
            database_1.prisma.fixedExpense.count({ where: { outletId: id } }),
        ]);
        const totalRecords = orderCount + shiftCount + pcCount + invCount + expCount;
        if (totalRecords > 0) {
            return res.status(400).json({
                success: false,
                message: `Cabang tidak dapat dihapus karena telah memiliki ${totalRecords} data transaksi/shift/biaya terkait!`,
            });
        }
        await database_1.prisma.outlet.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: 'Cabang berhasil dihapus!',
        });
    }
    catch (error) {
        console.error('[Delete Outlet Error]', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal menghapus cabang',
        });
    }
};
exports.deleteOutlet = deleteOutlet;
