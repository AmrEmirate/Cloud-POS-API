import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const resolveSalesJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be set (>= 16 chars) in production.');
  }
  return 'protek_sales_default_secret_key_2026';
};

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.SALES_DATABASE_URL || process.env.DATABASE_URL || '',
  jwtSecret: resolveSalesJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  leadProtectionDays: process.env.LEAD_PROTECTION_DAYS ? parseInt(process.env.LEAD_PROTECTION_DAYS, 10) : 30,
  defaultCommissionPercentage: process.env.DEFAULT_COMMISSION_PERCENTAGE ? parseFloat(process.env.DEFAULT_COMMISSION_PERCENTAGE) : 20.0,
  defaultOrgCommissionPercentage: process.env.DEFAULT_ORG_COMMISSION_PERCENTAGE ? parseFloat(process.env.DEFAULT_ORG_COMMISSION_PERCENTAGE) : 10.0,
  minimumWithdrawalAmount: process.env.MINIMUM_WITHDRAWAL_AMOUNT ? parseFloat(process.env.MINIMUM_WITHDRAWAL_AMOUNT) : 100000,
  invoiceGracePeriodDays: process.env.INVOICE_GRACE_PERIOD_DAYS ? parseInt(process.env.INVOICE_GRACE_PERIOD_DAYS, 10) : 3,
  cloudPosApiUrl: process.env.CLOUD_POS_API_URL || 'http://localhost:3000/api/v1',
  internalServiceKey: process.env.INTERNAL_SERVICE_KEY || 'protek-cloudpos-sync-secret-2026',
  stitchApiKey: process.env.STITCH_API_KEY || '',
};
