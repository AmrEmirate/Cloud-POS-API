import { Router } from 'express';
import { CommissionController } from '../controllers/commission.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// 1. Ringkasan Dompet Komisi (Ready, Pending, Withdrawn)
router.get('/wallet', CommissionController.getWallet);

// 2. Riwayat Komisi
router.get('/history', CommissionController.getCommissionHistory);

// 3. Form Pengajuan Penarikan Saldo Komisi
router.post('/withdraw', CommissionController.requestWithdrawal);

// 4. Riwayat Penarikan Dana
router.get('/withdrawals', CommissionController.getWithdrawals);

export default router;
