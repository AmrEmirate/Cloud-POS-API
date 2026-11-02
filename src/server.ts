import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { ensurePaymentGatewayColumns } from './services/dbInitService';

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[Dimsum Intan API Server] Aktif pada port http://localhost:${PORT}`);
  console.log(`[API v1 Endpoint] http://localhost:${PORT}/api/v1/health`);
  await ensurePaymentGatewayColumns();
});
