import { Router } from 'express';
import { OutletController } from '../controllers/outlet.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Daftar outlet binaan / klien aktif
router.get('/', OutletController.getMyOutlets);

// Detail outlet & status lisensi
router.get('/:id', OutletController.getOutletDetail);

// Live Telemetri & Transaksi Real-time dari Cloud POS
router.get('/:id/cloudpos-live', OutletController.getOutletCloudPosLive);

// Onboarding outlet baru (dari deal prospek atau direct)
router.post('/', OutletController.createOutlet);

export default router;
