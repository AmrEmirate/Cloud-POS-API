import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export type TenantRole = 'OWNER' | 'SUPERVISOR' | 'KASIR' | 'AKUNTAN' | 'INVENTORY';

export const requireRole = (allowedRoles: TenantRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Harap masuk terlebih dahulu' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Akses ditolak. Fitur ini hanya untuk peran: ${allowedRoles.join(', ')}`,
    });
  };
};

export const requireOutletAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });

  // Owner, Supervisor, Akuntan, and Inventory have access to all outlets within their tenant
  if (req.user.role !== 'KASIR') {
    return next();
  }

  // Kasir is locked to their own outlet
  const targetOutletId = req.params?.outletId || req.body?.outletId || req.query?.outletId;
  if (targetOutletId && req.user.outletId && targetOutletId !== req.user.outletId) {
    return res.status(403).json({
      success: false,
      message: 'Kasir terkunci pada outlet yang ditugaskan!',
    });
  }

  next();
};
