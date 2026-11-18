import { Router, Request, Response } from 'express';
import { authenticateJwt } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';
import { uploadFileToCloudinary } from '../services/cloudinaryService';

import * as authController from '../controllers/authController';
import * as outletController from '../controllers/outletController';
import * as menuController from '../controllers/menuController';
import * as posController from '../controllers/posController';
import * as shiftController from '../controllers/shiftController';
import * as pettyCashController from '../controllers/pettyCashController';
import * as invoiceController from '../controllers/invoiceController';
import * as expenseController from '../controllers/expenseController';
import * as reportController from '../controllers/reportController';
import * as publicController from '../controllers/publicController';
import * as billingController from '../controllers/billingController';
import * as internalSyncController from '../controllers/internalSyncController';
import * as walletController from '../controllers/walletController';
import * as duitkuController from '../controllers/duitkuController';
import * as paymentGatewayConfigController from '../controllers/paymentGatewayConfigController';
import * as materialController from '../controllers/materialController';

export const apiRouter = Router();

// 1. Health Check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'Cloud Multi-Tenant POS & Accounting System Engine',
    version: '2.0.0-multi-tenant',
    time: new Date().toISOString(),
  });
});

// 2. Public Tenant Metadata (Branding & Dynamic Configuration)
apiRouter.get('/public/tenant-meta', publicController.getTenantMeta);
apiRouter.get('/public/tenant-meta/:slug', publicController.getTenantMeta);

// 3. Autentikasi & Manajemen Pengguna
apiRouter.post('/auth/login', authController.login);
apiRouter.post('/auth/google', authController.googleLogin);
apiRouter.get('/auth/google/start', authController.googleOAuthStart);
apiRouter.get('/auth/google/callback', authController.googleOAuthCallback);
apiRouter.get('/auth/me', authenticateJwt, authController.getMe);
apiRouter.put('/auth/me', authenticateJwt, requireRole(['OWNER']), authController.updateProfile);
apiRouter.put('/auth/pin', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), authController.updatePin);
apiRouter.get('/users', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), authController.getUsers);
apiRouter.post('/users', authenticateJwt, requireRole(['OWNER']), authController.createUser);
apiRouter.put('/users/:id', authenticateJwt, requireRole(['OWNER']), authController.updateUser);
apiRouter.delete('/users/:id', authenticateJwt, requireRole(['OWNER']), authController.deleteUser);

// 4. Outlets
apiRouter.get('/outlets', outletController.getOutlets);
apiRouter.post('/outlets', authenticateJwt, requireRole(['OWNER']), outletController.createOutlet);
apiRouter.put('/outlets/:id', authenticateJwt, requireRole(['OWNER']), outletController.updateOutlet);
apiRouter.delete('/outlets/:id', authenticateJwt, requireRole(['OWNER']), outletController.deleteOutlet);

// 6. POS & Transaksi Penjualan
apiRouter.get('/pos/orders', authenticateJwt, posController.getOrders);
apiRouter.post('/pos/orders', authenticateJwt, posController.createOrder);
apiRouter.post(
  '/pos/orders/:id/void',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  posController.voidOrder
);

// 7. Sesi Shift Kasir & Rekonsiliasi Kas
apiRouter.get('/shifts/current', authenticateJwt, shiftController.getCurrentShift);
apiRouter.get('/shifts/history', authenticateJwt, shiftController.getShiftHistory);
apiRouter.post('/shifts/open', authenticateJwt, shiftController.openShift);
apiRouter.post('/shifts/close', authenticateJwt, shiftController.closeShift);

// 8. Master Menu & HPP
apiRouter.get('/menus', menuController.getMenus);
apiRouter.post('/menus', authenticateJwt, requireRole(['OWNER']), menuController.createMenu);
apiRouter.put('/menus/:id', authenticateJwt, requireRole(['OWNER']), menuController.updateMenu);
apiRouter.patch('/menus/:id/toggle', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), menuController.toggleAvailability);
apiRouter.delete('/menus/:id', authenticateJwt, requireRole(['OWNER']), menuController.deleteMenu);

// 8b. Bahan Baku (Raw Materials), Resep Menu (BOM) & Audit Opname Shift
apiRouter.get('/materials', authenticateJwt, materialController.getRawMaterials);
apiRouter.post('/materials', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), materialController.createRawMaterial);
apiRouter.put('/materials/:id', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), materialController.updateRawMaterial);
apiRouter.delete('/materials/:id', authenticateJwt, requireRole(['OWNER']), materialController.deleteRawMaterial);
apiRouter.get('/recipes', authenticateJwt, materialController.getMenuRecipes);
apiRouter.put('/recipes/:menuId', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), materialController.upsertMenuRecipe);
apiRouter.get('/shifts/opname-audit', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), materialController.getShiftOpnameAudit);

// Cloudinary File Upload Endpoint
apiRouter.post('/upload', authenticateJwt, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Tidak ada file gambar yang diunggah' });
    }
    const secureUrl = await uploadFileToCloudinary(req.file.path, 'dimsum_intan');
    res.json({
      success: true,
      message: 'Foto berhasil disimpan ke Cloudinary CDN',
      url: secureUrl,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengunggah foto ke Cloudinary',
    });
  }
});

// 9. Kas Kecil Outlet (Petty Cash)
apiRouter.get('/petty-cash', authenticateJwt, pettyCashController.getPettyCash);
apiRouter.post('/petty-cash', authenticateJwt, upload.single('receipt'), pettyCashController.createPettyCash);
apiRouter.put('/petty-cash/:id', authenticateJwt, pettyCashController.updatePettyCash);
apiRouter.patch(
  '/petty-cash/:id/verify',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  pettyCashController.verifyPettyCash
);
apiRouter.delete(
  '/petty-cash/:id',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  pettyCashController.deletePettyCash
);

// 10. Tagihan Suplai Pabrik (Factory Invoices)
apiRouter.get('/factory-invoices', authenticateJwt, invoiceController.getInvoices);
apiRouter.post('/factory-invoices', authenticateJwt, requireRole(['OWNER']), invoiceController.createInvoice);
apiRouter.put('/factory-invoices/:id', authenticateJwt, requireRole(['OWNER']), invoiceController.updateInvoice);
apiRouter.patch('/factory-invoices/:id/pay', authenticateJwt, requireRole(['OWNER']), invoiceController.payInvoice);
apiRouter.delete('/factory-invoices/:id', authenticateJwt, requireRole(['OWNER']), invoiceController.deleteInvoice);

// 11. Beban Operasional Tetap (Fixed Expenses)
apiRouter.get('/fixed-expenses', authenticateJwt, expenseController.getExpenses);
apiRouter.post('/fixed-expenses', authenticateJwt, requireRole(['OWNER']), expenseController.createExpense);
apiRouter.put('/fixed-expenses/:id', authenticateJwt, requireRole(['OWNER']), expenseController.updateExpense);
apiRouter.patch('/fixed-expenses/:id/status', authenticateJwt, requireRole(['OWNER']), expenseController.toggleExpenseStatus);
apiRouter.delete('/fixed-expenses/:id', authenticateJwt, requireRole(['OWNER']), expenseController.deleteExpense);

// 12. Laporan Laba Rugi & Arus Kas Konsolidasi
apiRouter.get('/reports/profit-loss', authenticateJwt, reportController.getProfitLoss);

// 13. Manajemen Langganan, Kuota Outlet, & Payment Gateway
apiRouter.get('/billing/status', authenticateJwt, billingController.getBillingStatus);
apiRouter.post(
  '/billing/checkout',
  authenticateJwt,
  requireRole(['OWNER']),
  billingController.createCheckout
);
apiRouter.post(
  '/billing/manual-pay',
  authenticateJwt,
  requireRole(['OWNER']),
  billingController.submitManualPayment
);
apiRouter.get(
  '/billing/invoices',
  authenticateJwt,
  requireRole(['OWNER']),
  billingController.getInvoices
);
apiRouter.post(
  '/billing/pay-mock/:id',
  authenticateJwt,
  requireRole(['OWNER']),
  billingController.simulatePayInvoice
);
apiRouter.post('/billing/webhook/midtrans', billingController.handleMidtransWebhook);

// 14. Duitku Payment Gateway (Subscription SaaS & POS QRIS Kasir)
apiRouter.post(
  '/payment/duitku/subscription-checkout',
  authenticateJwt,
  requireRole(['OWNER']),
  duitkuController.createSubscriptionCheckout
);
apiRouter.post(
  '/payment/duitku/pos-qr',
  authenticateJwt,
  duitkuController.createPosQrPayment
);
apiRouter.post('/payment/duitku/callback', duitkuController.handleDuitkuCallback);
apiRouter.get('/payment/duitku/status/:orderId', duitkuController.checkTransactionStatus);
apiRouter.post(
  '/payment/duitku/simulate/:orderId',
  authenticateJwt,
  duitkuController.simulateDuitkuPayment
);

// 14b. Konfigurasi Mandiri Payment Gateway Tenant (BYOK - Bring Your Own Keys)
apiRouter.get(
  '/payment/gateway/config',
  authenticateJwt,
  requireRole(['OWNER']),
  paymentGatewayConfigController.getPaymentGatewayConfig
);
apiRouter.put(
  '/payment/gateway/config',
  authenticateJwt,
  requireRole(['OWNER']),
  paymentGatewayConfigController.updatePaymentGatewayConfig
);
apiRouter.post(
  '/payment/gateway/test',
  authenticateJwt,
  requireRole(['OWNER']),
  paymentGatewayConfigController.testPaymentGatewayConfig
);

// 15. Dompet Saldo & Penarikan Dana Tenant (Merchant Wallet & Payout)
apiRouter.get(
  '/wallet/summary',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  walletController.getWalletSummary
);
apiRouter.get(
  '/wallet/transactions',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  walletController.getTransactions
);
apiRouter.get(
  '/wallet/withdrawals',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  walletController.getWithdrawals
);
apiRouter.post(
  '/wallet/withdraw',
  authenticateJwt,
  requireRole(['OWNER']),
  walletController.requestWithdrawal
);
apiRouter.put(
  '/wallet/bank-account',
  authenticateJwt,
  requireRole(['OWNER']),
  walletController.updateBankAccount
);

// 16. Paket Lisensi & Integrasi ProtekSales (Inter-Service Communication)
apiRouter.get('/plans', internalSyncController.getAvailablePlans);
apiRouter.post('/license/heartbeat', internalSyncController.checkHeartbeat);
apiRouter.post(
  '/internal/sync-license',
  internalSyncController.verifyInternalServiceSecret,
  internalSyncController.syncLicenseStatus
);
apiRouter.post(
  '/internal/provision-tenant',
  internalSyncController.verifyInternalServiceSecret,
  internalSyncController.provisionTenant
);
apiRouter.get(
  '/internal/tenant/:licenseKey',
  internalSyncController.verifyInternalServiceSecret,
  internalSyncController.getTenantByLicense
);
apiRouter.get(
  '/internal/tenants',
  internalSyncController.verifyInternalServiceSecret,
  internalSyncController.getAllTenants
);
apiRouter.get(
  '/internal/analytics',
  internalSyncController.verifyInternalServiceSecret,
  internalSyncController.getPlatformAnalytics
);
