import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.SALES_DATABASE_URL || process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'protek_sales_default_secret_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  leadProtectionDays: process.env.LEAD_PROTECTION_DAYS ? parseInt(process.env.LEAD_PROTECTION_DAYS, 10) : 30,
  defaultCommissionPercentage: process.env.DEFAULT_COMMISSION_PERCENTAGE ? parseFloat(process.env.DEFAULT_COMMISSION_PERCENTAGE) : 25.0,
  minimumWithdrawalAmount: process.env.MINIMUM_WITHDRAWAL_AMOUNT ? parseFloat(process.env.MINIMUM_WITHDRAWAL_AMOUNT) : 100000,
  invoiceGracePeriodDays: process.env.INVOICE_GRACE_PERIOD_DAYS ? parseInt(process.env.INVOICE_GRACE_PERIOD_DAYS, 10) : 3,
  cloudPosApiUrl: process.env.CLOUD_POS_API_URL || 'http://localhost:3000/api/v1',
  internalServiceKey: process.env.INTERNAL_SERVICE_KEY || 'protek-cloudpos-sync-secret-2026',
  stitchApiKey: process.env.STITCH_API_KEY || '',
};
