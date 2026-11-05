export const LEAD_STATUS = {
  NEW: 'NEW',
  DEMO: 'DEMO',
  DEAL: 'DEAL',
  LOST: 'LOST',
  EXPIRED: 'EXPIRED',
} as const;

export const INVOICE_STATUS = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
} as const;

export const LICENSE_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
} as const;

export const COMMISSION_STATUS = {
  READY: 'READY',
  PENDING: 'PENDING',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export const WITHDRAWAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
} as const;

export const ROLE = {
  ADMIN: 'ADMIN',
  SALES: 'SALES',
} as const;
