import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { createRateLimiter } from '../../middlewares/security';

const router = Router();

const salesAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyPrefix: 'sales-auth',
  message: 'Terlalu banyak percobaan autentikasi Sales. Silakan coba lagi dalam 15 menit.',
});

router.post('/register', salesAuthRateLimiter, AuthController.register);
router.post('/login', salesAuthRateLimiter, AuthController.login);
router.get('/profile', authenticate, AuthController.getProfile);
router.put('/bank-info', authenticate, AuthController.updateBankInfo);

export default router;
