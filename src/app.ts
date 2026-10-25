import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { apiRouter } from './routes';
import { tenantResolutionMiddleware } from './middlewares/tenant';
import { dynamicCors } from './middlewares/cors';

export const app = express();

// 1. Dynamic Multi-Tenant CORS (Section 4.3 Blueprint)
app.use(dynamicCors);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 3. Multi-Tenant Context Resolution (Section 4.1 Blueprint)
app.use(tenantResolutionMiddleware);

// 4. API Routes
app.use('/api/v1', apiRouter);

// 5. Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});
