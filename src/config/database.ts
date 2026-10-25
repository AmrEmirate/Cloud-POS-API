import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';

export interface TenantContext {
  tenantId?: string;
  isSuperAdmin?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

const TENANT_MODELS = new Set([
  'Outlet',
  'User',
  'MenuItem',
  'Order',
  'ShiftSession',
  'PettyCash',
  'FactoryInvoice',
  'FixedExpense',
]);

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
      async findFirst({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
      async count({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
      async aggregate({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
      async groupBy({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args as any);
      },
      async create({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.data = { tenantId: store.tenantId, ...(args.data as any) };
        }
        return query(args);
      },
      async createMany({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: any) => ({ tenantId: store.tenantId, ...item }));
          }
        }
        return query(args);
      },
      async updateMany({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
      async deleteMany({ model, args, query }) {
        const store = tenantStorage.getStore();
        if (store?.tenantId && !store.isSuperAdmin && TENANT_MODELS.has(model)) {
          args.where = { ...(args.where || {}), tenantId: store.tenantId } as any;
        }
        return query(args);
      },
    },
  },
});
