import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { apiRouter } from './routes';
import { salesApiRouter } from './sales';
import { tenantResolutionMiddleware } from './middlewares/tenant';
import { dynamicCors } from './middlewares/cors';
import { securityHeaders, createRateLimiter } from './middlewares/security';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// 0. Security HTTP Headers & Global API Rate Limiter
app.use(securityHeaders);
app.use(
  '/api',
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    keyPrefix: 'global-api',
    message: 'Terlalu banyak permintaan API. Silakan tunggu sebentar.',
  })
);

// 1. Dynamic Multi-Tenant CORS (Section 4.3 Blueprint)
app.use(dynamicCors);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 2. Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 3. Multi-Tenant Context Resolution (Section 4.1 Blueprint)
app.use(tenantResolutionMiddleware);

// 4. API Routes - Cloud POS Core API
app.use('/api/v1', apiRouter);

// 5. API Routes - ProtekSales CRM API (Dual Mount: /api/v1/sales & /api)
app.use('/api/v1/sales', salesApiRouter);
app.use('/api', salesApiRouter);

// 6. Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});
