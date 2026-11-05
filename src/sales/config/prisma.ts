import { salesPrisma } from '../../config/salesDatabase';
export * from '@prisma/sales-client';

export const prisma = salesPrisma;
export default salesPrisma;

