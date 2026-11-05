import { PrismaClient as SalesPrismaClient } from '../generated/sales-client';

const salesDatabaseUrl =
  process.env.SALES_DATABASE_URL ||
  'postgresql://postgres:MasterPostgresPassword2026!@unified-postgres:5432/proteksales_db?schema=public';

export const salesPrisma = new SalesPrismaClient({
  datasources: {
    db: {
      url: salesDatabaseUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export default salesPrisma;
