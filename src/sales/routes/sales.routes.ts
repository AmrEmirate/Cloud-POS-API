import { Router } from 'express';
import { SalesController } from '../controllers/sales.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// 1. Papan Peringkat Insentif Sales
router.get('/leaderboard', SalesController.getLeaderboard);

// 2. Profil Sales, KPI & Tier Komisi
router.get('/kpi', SalesController.getSalesKPI);

// 3. Peta Rute Kunjungan & Optimasi Wilayah Sales
router.get('/routes-map', SalesController.getSalesRouteMap);

// 4. Kalkulator ROI Simulasi Keuntungan Outlet POS
router.post('/roi-calculator', SalesController.calculateROI);

export default router;
