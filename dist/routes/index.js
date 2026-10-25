"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const rbac_1 = require("../middlewares/rbac");
const upload_1 = require("../middlewares/upload");
const authController = __importStar(require("../controllers/authController"));
const outletController = __importStar(require("../controllers/outletController"));
const menuController = __importStar(require("../controllers/menuController"));
const posController = __importStar(require("../controllers/posController"));
const shiftController = __importStar(require("../controllers/shiftController"));
const pettyCashController = __importStar(require("../controllers/pettyCashController"));
const invoiceController = __importStar(require("../controllers/invoiceController"));
const expenseController = __importStar(require("../controllers/expenseController"));
const reportController = __importStar(require("../controllers/reportController"));
exports.apiRouter = (0, express_1.Router)();
// 1. Health Check
exports.apiRouter.get('/health', (_req, res) => {
    res.json({
        status: 'online',
        system: 'Dimsum Intan Cloud POS & Accounting System API',
        version: '1.0.0',
        time: new Date().toISOString(),
    });
});
// 2. Autentikasi & Manajemen Pengguna
exports.apiRouter.post('/auth/login', authController.login);
exports.apiRouter.get('/auth/me', auth_1.authenticateJwt, authController.getMe);
exports.apiRouter.put('/auth/pin', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), authController.updatePin);
exports.apiRouter.get('/users', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), authController.getUsers);
exports.apiRouter.post('/users', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), authController.createUser);
exports.apiRouter.delete('/users/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), authController.deleteUser);
// 3. Outlets
exports.apiRouter.get('/outlets', outletController.getOutlets);
exports.apiRouter.post('/outlets', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), outletController.createOutlet);
exports.apiRouter.put('/outlets/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), outletController.updateOutlet);
exports.apiRouter.delete('/outlets/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), outletController.deleteOutlet);
// 4. POS & Transaksi Penjualan
exports.apiRouter.get('/pos/orders', auth_1.authenticateJwt, posController.getOrders);
exports.apiRouter.post('/pos/orders', auth_1.authenticateJwt, posController.createOrder);
exports.apiRouter.post('/pos/orders/:id/void', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), posController.voidOrder);
// 5. Sesi Shift Kasir & Rekonsiliasi Kas
exports.apiRouter.get('/shifts/current', auth_1.authenticateJwt, shiftController.getCurrentShift);
exports.apiRouter.get('/shifts/history', auth_1.authenticateJwt, shiftController.getShiftHistory);
exports.apiRouter.post('/shifts/open', auth_1.authenticateJwt, shiftController.openShift);
exports.apiRouter.post('/shifts/close', auth_1.authenticateJwt, shiftController.closeShift);
// 6. Master Menu Dimsum & HPP
exports.apiRouter.get('/menus', menuController.getMenus);
exports.apiRouter.post('/menus', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), menuController.createMenu);
exports.apiRouter.put('/menus/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), menuController.updateMenu);
exports.apiRouter.patch('/menus/:id/toggle', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), menuController.toggleAvailability);
exports.apiRouter.delete('/menus/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), menuController.deleteMenu);
// 7. Kas Kecil Outlet (Petty Cash)
exports.apiRouter.get('/petty-cash', auth_1.authenticateJwt, pettyCashController.getPettyCash);
exports.apiRouter.post('/petty-cash', auth_1.authenticateJwt, upload_1.upload.single('receipt'), pettyCashController.createPettyCash);
exports.apiRouter.put('/petty-cash/:id', auth_1.authenticateJwt, pettyCashController.updatePettyCash);
exports.apiRouter.patch('/petty-cash/:id/verify', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), pettyCashController.verifyPettyCash);
exports.apiRouter.delete('/petty-cash/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER', 'SUPERVISOR']), pettyCashController.deletePettyCash);
// 8. Tagihan Suplai Pabrik (Factory Invoices)
exports.apiRouter.get('/factory-invoices', auth_1.authenticateJwt, invoiceController.getInvoices);
exports.apiRouter.post('/factory-invoices', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), invoiceController.createInvoice);
exports.apiRouter.put('/factory-invoices/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), invoiceController.updateInvoice);
exports.apiRouter.patch('/factory-invoices/:id/pay', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), invoiceController.payInvoice);
exports.apiRouter.delete('/factory-invoices/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), invoiceController.deleteInvoice);
// 9. Beban Operasional Tetap (Fixed Expenses)
exports.apiRouter.get('/fixed-expenses', auth_1.authenticateJwt, expenseController.getExpenses);
exports.apiRouter.post('/fixed-expenses', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), expenseController.createExpense);
exports.apiRouter.put('/fixed-expenses/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), expenseController.updateExpense);
exports.apiRouter.patch('/fixed-expenses/:id/status', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), expenseController.toggleExpenseStatus);
exports.apiRouter.delete('/fixed-expenses/:id', auth_1.authenticateJwt, (0, rbac_1.requireRole)(['OWNER']), expenseController.deleteExpense);
// 10. Laporan Laba Rugi & Arus Kas Konsolidasi
exports.apiRouter.get('/reports/profit-loss', auth_1.authenticateJwt, reportController.getProfitLoss);
