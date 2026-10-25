import { Router, Request, Response } from 'express';
import { authenticateJwt } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { upload } from '../middlewares/upload';

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
import * as superadminController from '../controllers/superadminController';

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

// 3. Superadmin Portal (Platform Owner Management & Instant Onboarding)
apiRouter.get(
  '/superadmin/stats',
  authenticateJwt,
  requireRole(['SUPERADMIN']),
  superadminController.getStats
);
apiRouter.get(
  '/superadmin/tenants',
  authenticateJwt,
  requireRole(['SUPERADMIN']),
  superadminController.getTenants
);
apiRouter.post(
  '/superadmin/tenants',
  authenticateJwt,
  requireRole(['SUPERADMIN']),
  superadminController.createTenant
);
apiRouter.put(
  '/superadmin/tenants/:id',
  authenticateJwt,
  requireRole(['SUPERADMIN']),
  superadminController.updateTenant
);
apiRouter.delete(
  '/superadmin/tenants/:id',
  authenticateJwt,
  requireRole(['SUPERADMIN']),
  superadminController.deleteTenant
);

// 4. Autentikasi & Manajemen Pengguna
apiRouter.post('/auth/login', authController.login);
apiRouter.get('/auth/me', authenticateJwt, authController.getMe);
apiRouter.put('/auth/pin', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']), authController.updatePin);
apiRouter.get('/users', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']), authController.getUsers);
apiRouter.post('/users', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), authController.createUser);
apiRouter.delete('/users/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), authController.deleteUser);

// 5. Outlets
apiRouter.get('/outlets', outletController.getOutlets);
apiRouter.post('/outlets', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), outletController.createOutlet);
apiRouter.put('/outlets/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), outletController.updateOutlet);
apiRouter.delete('/outlets/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), outletController.deleteOutlet);

// 6. POS & Transaksi Penjualan
apiRouter.get('/pos/orders', authenticateJwt, posController.getOrders);
apiRouter.post('/pos/orders', authenticateJwt, posController.createOrder);
apiRouter.post(
  '/pos/orders/:id/void',
  authenticateJwt,
  requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']),
  posController.voidOrder
);

// 7. Sesi Shift Kasir & Rekonsiliasi Kas
apiRouter.get('/shifts/current', authenticateJwt, shiftController.getCurrentShift);
apiRouter.get('/shifts/history', authenticateJwt, shiftController.getShiftHistory);
apiRouter.post('/shifts/open', authenticateJwt, shiftController.openShift);
apiRouter.post('/shifts/close', authenticateJwt, shiftController.closeShift);

// 8. Master Menu & HPP
apiRouter.get('/menus', menuController.getMenus);
apiRouter.post('/menus', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), menuController.createMenu);
apiRouter.put('/menus/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), menuController.updateMenu);
apiRouter.patch('/menus/:id/toggle', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']), menuController.toggleAvailability);
apiRouter.delete('/menus/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), menuController.deleteMenu);

// 9. Kas Kecil Outlet (Petty Cash)
apiRouter.get('/petty-cash', authenticateJwt, pettyCashController.getPettyCash);
apiRouter.post('/petty-cash', authenticateJwt, upload.single('receipt'), pettyCashController.createPettyCash);
apiRouter.put('/petty-cash/:id', authenticateJwt, pettyCashController.updatePettyCash);
apiRouter.patch(
  '/petty-cash/:id/verify',
  authenticateJwt,
  requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']),
  pettyCashController.verifyPettyCash
);
apiRouter.delete(
  '/petty-cash/:id',
  authenticateJwt,
  requireRole(['SUPERADMIN', 'OWNER', 'SUPERVISOR']),
  pettyCashController.deletePettyCash
);

// 10. Tagihan Suplai Pabrik (Factory Invoices)
apiRouter.get('/factory-invoices', authenticateJwt, invoiceController.getInvoices);
apiRouter.post('/factory-invoices', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), invoiceController.createInvoice);
apiRouter.put('/factory-invoices/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), invoiceController.updateInvoice);
apiRouter.patch('/factory-invoices/:id/pay', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), invoiceController.payInvoice);
apiRouter.delete('/factory-invoices/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), invoiceController.deleteInvoice);

// 11. Beban Operasional Tetap (Fixed Expenses)
apiRouter.get('/fixed-expenses', authenticateJwt, expenseController.getExpenses);
apiRouter.post('/fixed-expenses', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), expenseController.createExpense);
apiRouter.put('/fixed-expenses/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), expenseController.updateExpense);
apiRouter.patch('/fixed-expenses/:id/status', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), expenseController.toggleExpenseStatus);
apiRouter.delete('/fixed-expenses/:id', authenticateJwt, requireRole(['SUPERADMIN', 'OWNER']), expenseController.deleteExpense);

// 12. Laporan Laba Rugi & Arus Kas Konsolidasi
apiRouter.get('/reports/profit-loss', authenticateJwt, reportController.getProfitLoss);
