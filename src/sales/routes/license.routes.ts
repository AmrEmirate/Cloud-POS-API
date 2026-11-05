import { Router } from 'express';
import { LicenseController } from '../controllers/license.controller';

const router = Router();

// Heartbeat Ping dari Aplikasi Kasir / Outlet POS
// POST /api/license/heartbeat
router.post('/heartbeat', LicenseController.heartbeat);

export default router;
