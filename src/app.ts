import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './routes';
import { tenantResolutionMiddleware } from './middlewares/tenant';
import { basePrisma } from './config/database';

export const app = express();

// 1. Dynamic Multi-Tenant CORS
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: async (origin, callback) => {
      if (!origin) return callback(null, true);

      // Localhost, LAN, or configured origins
      if (
        configuredOrigins.includes(origin) ||
        configuredOrigins.includes('*') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('192.168.') ||
        origin.endsWith('.posmu.cloud') ||
        origin.endsWith('.vimtk.cloud')
      ) {
        return callback(null, true);
      }

      // Check registered custom tenant domains
      try {
        const cleanHost = origin.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
        const customTenant = await basePrisma.tenant.findFirst({
          where: { customDomain: cleanHost },
        });
        if (customTenant) {
          return callback(null, true);
        }
      } catch (e) {
        // Fallback
      }

      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 3. Multi-Tenant Context Resolution
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
