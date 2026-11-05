import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { ensurePaymentGatewayColumns } from './services/dbInitService';
import { initSalesScheduler } from './sales';

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[Cloud POS & ProtekSales Unified API] Aktif pada port http://localhost:${PORT}`);
  console.log(`[API v1 Endpoint] http://localhost:${PORT}/api/v1/health`);
  console.log(`[Sales API Endpoint] http://localhost:${PORT}/api/health`);
  try {
    initSalesScheduler();
  } catch (err: any) {
    console.error('Failed to init sales scheduler:', err.message);
  }
  await ensurePaymentGatewayColumns();
});
