import { Router } from 'express';
import authRoutes from './auth.routes';
import leadRoutes from './lead.routes';
import outletRoutes from './outlet.routes';
import commissionRoutes from './commission.routes';
import invoiceRoutes from './invoice.routes';
import licenseRoutes from './license.routes';
import adminRoutes from './admin.routes';
import salesRoutes from './sales.routes';
import uiDesignRoutes from './uiDesign.routes';
import { PROTEK_PACKAGES } from '../constants/plans';

const router = Router();

router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/outlets', outletRoutes);
router.use('/commissions', commissionRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/license', licenseRoutes);
router.use('/admin', adminRoutes);
router.use('/sales', salesRoutes);
router.use('/ui-design', uiDesignRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ProtekSales API Server',
    timestamp: new Date().toISOString(),
  });
});

// Paket Berlangganan POS (4 Paket Resmi)
router.get('/plans', (_req, res) => {
  res.status(200).json({
    success: true,
    data: Object.values(PROTEK_PACKAGES),
  });
});

export default router;
