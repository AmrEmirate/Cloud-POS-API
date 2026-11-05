import { Router } from 'express';
import { UiDesignController } from '../controllers/uiDesign.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// 1. Submit UI Request baru untuk calon tenant (Stitch MCP Trigger)
router.post('/request', UiDesignController.requestUiDesign);

// 2. Ambil riwayat request UI untuk lead tertentu
router.get('/lead/:leadId', UiDesignController.getUiDesignsByLead);

// 3. Ambil detail request UI & token styling
router.get('/:id', UiDesignController.getUiDesignDetail);

// 4. Kirim revisi desain UMKM ke Stitch AI
router.post('/:id/revise', UiDesignController.reviseUiDesign);

// 5. Final Approval & Otomatisasi Antigravity Deployment ke Cloud POS
router.post('/:id/approve', UiDesignController.approveUiDesign);

export default router;
