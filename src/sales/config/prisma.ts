import { salesPrisma } from '../../config/salesDatabase';
export * from '../../generated/sales-client';

export const prisma = salesPrisma;
export default salesPrisma;

