import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Semua rute prospek memerlukan login
router.use(authenticate);

// 1. Cek & Kunci Prospek (Lead Protection Check)
router.get('/check', LeadController.checkAvailability);

// 2. Form Check-in Kunjungan Baru
router.post('/check-in', LeadController.checkIn);

// 3. Daftar Prospek Sales (Pipeline)
router.get('/', LeadController.getMyLeads);

// 4. Detail Prospek & Histori Kunjungan
router.get('/:id', LeadController.getLeadDetail);

// 5. Update Status Pipeline
router.patch('/:id/status', LeadController.updateStatus);

// 6. Tambah Catatan Kunjungan Tambahan
router.post('/:id/visits', LeadController.addVisitLog);

// 7. Ajukan Banding Sengketa Prospek
router.post('/:id/dispute', LeadController.fileDispute);

export default router;
