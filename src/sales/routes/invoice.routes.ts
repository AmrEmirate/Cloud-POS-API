import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Daftar tagihan / invoice
router.get('/', InvoiceController.getInvoices);

// Buat invoice baru manual
router.post('/', InvoiceController.createInvoice);

// Upload bukti transfer tagihan
router.post('/:id/payment-proof', InvoiceController.uploadPaymentProof);

// Dapatkan teks & link pengingat WhatsApp
router.get('/:id/reminder-link', InvoiceController.getReminderWhatsAppLink);

export default router;
