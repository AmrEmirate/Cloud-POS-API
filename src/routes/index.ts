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
import { whatsappService } from '../services/whatsapp';

export const apiRouter = Router();

// 1. Health Check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'Dimsum Intan Cloud POS & Accounting System API',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

// 2. Autentikasi & Manajemen Pengguna
apiRouter.post('/auth/login', authController.login);
apiRouter.get('/auth/me', authenticateJwt, authController.getMe);
apiRouter.put('/auth/pin', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), authController.updatePin);
apiRouter.get('/users', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), authController.getUsers);
apiRouter.post('/users', authenticateJwt, requireRole(['OWNER']), authController.createUser);
apiRouter.delete('/users/:id', authenticateJwt, requireRole(['OWNER']), authController.deleteUser);

// 3. Outlets
apiRouter.get('/outlets', outletController.getOutlets);
apiRouter.post('/outlets', authenticateJwt, requireRole(['OWNER']), outletController.createOutlet);
apiRouter.put('/outlets/:id', authenticateJwt, requireRole(['OWNER']), outletController.updateOutlet);
apiRouter.delete('/outlets/:id', authenticateJwt, requireRole(['OWNER']), outletController.deleteOutlet);

// 4. POS & Transaksi Penjualan
apiRouter.get('/pos/orders', authenticateJwt, posController.getOrders);
apiRouter.post('/pos/orders', authenticateJwt, posController.createOrder);
apiRouter.post(
  '/pos/orders/:id/void',
  authenticateJwt,
  requireRole(['OWNER', 'SUPERVISOR']),
  posController.voidOrder
);

// 5. Sesi Shift Kasir & Rekonsiliasi Kas
apiRouter.get('/shifts/current', authenticateJwt, shiftController.getCurrentShift);
apiRouter.get('/shifts/history', authenticateJwt, shiftController.getShiftHistory);
apiRouter.post('/shifts/open', authenticateJwt, shiftController.openShift);
apiRouter.post('/shifts/close', authenticateJwt, shiftController.closeShift);

// 6. Master Menu Dimsum & HPP
apiRouter.get('/menus', menuController.getMenus);
apiRouter.post('/menus', authenticateJwt, requireRole(['OWNER']), menuController.createMenu);
apiRouter.put('/menus/:id', authenticateJwt, requireRole(['OWNER']), menuController.updateMenu);
apiRouter.patch('/menus/:id/toggle', authenticateJwt, requireRole(['OWNER', 'SUPERVISOR']), menuController.toggleAvailability);
apiRouter.delete('/menus/:id', authenticateJwt, requireRole(['OWNER']), menuController.deleteMenu);

// 7. Kas Kecil Outlet (Petty Cash)
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

// 8. Tagihan Suplai Pabrik (Factory Invoices)
apiRouter.get('/factory-invoices', authenticateJwt, invoiceController.getInvoices);
apiRouter.post('/factory-invoices', authenticateJwt, requireRole(['OWNER']), invoiceController.createInvoice);
apiRouter.put('/factory-invoices/:id', authenticateJwt, requireRole(['OWNER']), invoiceController.updateInvoice);
apiRouter.patch('/factory-invoices/:id/pay', authenticateJwt, requireRole(['OWNER']), invoiceController.payInvoice);
apiRouter.delete('/factory-invoices/:id', authenticateJwt, requireRole(['OWNER']), invoiceController.deleteInvoice);

// 9. Beban Operasional Tetap (Fixed Expenses)
apiRouter.get('/fixed-expenses', authenticateJwt, expenseController.getExpenses);
apiRouter.post('/fixed-expenses', authenticateJwt, requireRole(['OWNER']), expenseController.createExpense);
apiRouter.put('/fixed-expenses/:id', authenticateJwt, requireRole(['OWNER']), expenseController.updateExpense);
apiRouter.patch('/fixed-expenses/:id/status', authenticateJwt, requireRole(['OWNER']), expenseController.toggleExpenseStatus);
apiRouter.delete('/fixed-expenses/:id', authenticateJwt, requireRole(['OWNER']), expenseController.deleteExpense);

// 10. Laporan Laba Rugi & Arus Kas Konsolidasi
apiRouter.get('/reports/profit-loss', authenticateJwt, reportController.getProfitLoss);

// 11. WhatsApp Bot Status & QR
apiRouter.get('/whatsapp/status', authenticateJwt, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: whatsappService.getStatus(),
  });
});


