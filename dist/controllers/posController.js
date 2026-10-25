"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.voidOrder = exports.createOrder = exports.getOrders = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const client_1 = require("@prisma/client");
const getOrders = async (req, res) => {
    try {
        const { outletId } = req.query;
        const whereClause = {};
        if (outletId && outletId !== 'all') {
            whereClause.outletId = String(outletId);
        }
        const orders = await database_1.prisma.order.findMany({
            where: whereClause,
            include: {
                items: true,
                cashier: { select: { name: true } },
                outlet: { select: { name: true, code: true } },
                voidedBy: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const formatted = orders.map((o) => ({
            id: o.id,
            invoiceNumber: o.invoiceNumber,
            outletId: o.outletId,
            outletName: o.outlet?.name || 'Outlet',
            orderType: o.orderType.toLowerCase(),
            tableNumber: o.tableNumber || undefined,
            customerName: o.customerName || undefined,
            items: o.items.map((it) => ({
                menuId: it.menuId,
                name: it.name,
                price: Number(it.price),
                costPrice: Number(it.costPrice),
                quantity: it.quantity,
                notes: it.notes || undefined,
            })),
            subtotal: Number(o.subtotal),
            discount: Number(o.discount),
            total: Number(o.total),
            hppTotal: Number(o.hppTotal),
            paymentMethod: o.paymentMethod,
            cashReceived: o.cashReceived ? Number(o.cashReceived) : undefined,
            changeAmount: o.changeAmount ? Number(o.changeAmount) : undefined,
            cashierName: o.cashier.name,
            status: o.status,
            voidReason: o.voidReason || undefined,
            voidAuthorizedBy: o.voidedBy ? o.voidedBy.name : undefined,
            createdAt: o.createdAt.toISOString(),
        }));
        res.json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('[POS Orders Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal mengambil riwayat transaksi' });
    }
};
exports.getOrders = getOrders;
const createOrder = async (req, res) => {
    try {
        const { outletId, orderType, tableNumber, customerName, items, subtotal, discount = 0, total, hppTotal, paymentMethod, cashReceived, changeAmount, } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Keranjang belanja tidak boleh kosong' });
        }
        const cashierId = req.user?.id;
        if (!cashierId) {
            return res.status(401).json({ success: false, message: 'Kasir tidak teridentifikasi. Harap login kembali.' });
        }
        // Resolve outlet
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
        const outlet = await database_1.prisma.outlet.findUnique({ where: { id: targetOutletId } });
        const outletCode = outlet ? outlet.code.replace('-', '') : 'DU01';
        // Generate Invoice Number
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayCount = await database_1.prisma.order.count({
            where: {
                outletId: targetOutletId,
                createdAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                },
            },
        });
        const invoiceNumber = `INV/${outletCode}/${todayStr}/${String(todayCount + 1).padStart(3, '0')}`;
        // Execute Prisma Transaction
        const createdOrder = await database_1.prisma.$transaction(async (tx) => {
            // 1. Create Order
            const ord = await tx.order.create({
                data: {
                    invoiceNumber,
                    outletId: targetOutletId,
                    orderType: orderType === 'dine-in' ? client_1.OrderType.DINE_IN : client_1.OrderType.TAKEAWAY,
                    tableNumber: tableNumber || null,
                    customerName: customerName || null,
                    subtotal: subtotal,
                    discount: discount,
                    total: total,
                    hppTotal: hppTotal,
                    paymentMethod: paymentMethod === 'QRIS' ? client_1.PaymentMethod.QRIS : client_1.PaymentMethod.CASH,
                    cashReceived: cashReceived || null,
                    changeAmount: changeAmount || null,
                    cashierId: cashierId,
                    status: client_1.OrderStatus.PAID,
                    items: {
                        create: items.map((it) => ({
                            menuId: it.menuId,
                            name: it.name,
                            price: it.price,
                            costPrice: it.costPrice,
                            quantity: it.quantity,
                            notes: it.notes || null,
                        })),
                    },
                },
                include: {
                    items: true,
                    cashier: { select: { name: true } },
                    outlet: { select: { name: true } },
                },
            });
            // 2. Decrement Menu Stock
            for (const it of items) {
                if (it.menuId) {
                    await tx.menuItem.update({
                        where: { id: it.menuId },
                        data: {
                            stock: {
                                decrement: it.quantity,
                            },
                        },
                    }).catch(() => null);
                }
            }
            // 3. Update Active Shift totals if open
            const activeShift = await tx.shiftSession.findFirst({
                where: {
                    outletId: targetOutletId,
                    status: 'ACTIVE',
                },
            });
            if (activeShift) {
                if (paymentMethod === 'CASH') {
                    await tx.shiftSession.update({
                        where: { id: activeShift.id },
                        data: {
                            cashSales: { increment: total },
                            expectedCash: { increment: total },
                        },
                    });
                }
                else {
                    await tx.shiftSession.update({
                        where: { id: activeShift.id },
                        data: {
                            qrisSales: { increment: total },
                        },
                    });
                }
            }
            return ord;
        });
        res.status(201).json({
            success: true,
            message: 'Transaksi berhasil diproses',
            data: {
                id: createdOrder.id,
                invoiceNumber: createdOrder.invoiceNumber,
                outletId: createdOrder.outletId,
                outletName: createdOrder.outlet?.name || 'Outlet',
                orderType: createdOrder.orderType.toLowerCase(),
                tableNumber: createdOrder.tableNumber,
                customerName: createdOrder.customerName,
                items: createdOrder.items.map((it) => ({
                    menuId: it.menuId,
                    name: it.name,
                    price: Number(it.price),
                    costPrice: Number(it.costPrice),
                    quantity: it.quantity,
                    notes: it.notes,
                })),
                subtotal: Number(createdOrder.subtotal),
                discount: Number(createdOrder.discount),
                total: Number(createdOrder.total),
                hppTotal: Number(createdOrder.hppTotal),
                paymentMethod: createdOrder.paymentMethod,
                cashReceived: createdOrder.cashReceived ? Number(createdOrder.cashReceived) : undefined,
                changeAmount: createdOrder.changeAmount ? Number(createdOrder.changeAmount) : undefined,
                cashierName: createdOrder.cashier.name,
                status: createdOrder.status,
                createdAt: createdOrder.createdAt.toISOString(),
            },
        });
    }
    catch (error) {
        console.error('[Create Order Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memproses transaksi pesanan' });
    }
};
exports.createOrder = createOrder;
const voidOrder = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { pin, reason } = req.body;
        if (!pin) {
            return res.status(400).json({ success: false, message: 'PIN Otorisasi Supervisor wajib diisi!' });
        }
        // Verify PIN against supervisors or owners
        const supervisors = await database_1.prisma.user.findMany({
            where: {
                role: { in: ['OWNER', 'SUPERVISOR'] },
                pinHash: { not: null },
            },
        });
        let authorizedUser = null;
        for (const spv of supervisors) {
            if (spv.pinHash) {
                const isPinMatch = await bcryptjs_1.default.compare(pin, spv.pinHash);
                if (isPinMatch) {
                    authorizedUser = spv;
                    break;
                }
            }
        }
        if (!authorizedUser) {
            return res.status(403).json({ success: false, message: 'PIN Supervisor salah atau tidak memiliki wewenang!' });
        }
        const order = await database_1.prisma.order.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
        }
        if (order.status === client_1.OrderStatus.VOIDED) {
            return res.status(400).json({ success: false, message: 'Pesanan ini sudah dibatalkan (VOID) sebelumnya' });
        }
        // Execute Void Transaction
        await database_1.prisma.$transaction(async (tx) => {
            // 1. Update order status
            await tx.order.update({
                where: { id },
                data: {
                    status: client_1.OrderStatus.VOIDED,
                    voidReason: reason || 'Permintaan Supervisor',
                    voidedById: authorizedUser?.id || null,
                },
            });
            // 2. Restore menu stocks
            for (const it of order.items) {
                await tx.menuItem.update({
                    where: { id: it.menuId },
                    data: {
                        stock: {
                            increment: it.quantity,
                        },
                    },
                }).catch(() => null);
            }
            // 3. Reconcile shift if within active shift
            const activeShift = await tx.shiftSession.findFirst({
                where: {
                    outletId: order.outletId,
                    status: 'ACTIVE',
                },
            });
            if (activeShift) {
                if (order.paymentMethod === client_1.PaymentMethod.CASH) {
                    await tx.shiftSession.update({
                        where: { id: activeShift.id },
                        data: {
                            cashSales: { decrement: order.total },
                            expectedCash: { decrement: order.total },
                        },
                    });
                }
                else {
                    await tx.shiftSession.update({
                        where: { id: activeShift.id },
                        data: {
                            qrisSales: { decrement: order.total },
                        },
                    });
                }
            }
        });
        res.json({
            success: true,
            message: `Nota ${order.invoiceNumber} berhasil di-VOID dan stok menu telah dipulihkan.`,
        });
    }
    catch (error) {
        console.error('[Void Order Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Gagal membatalkan transaksi' });
    }
};
exports.voidOrder = voidOrder;
