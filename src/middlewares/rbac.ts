import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireRole = (allowedRoles: ('SUPERADMIN' | 'OWNER' | 'SUPERVISOR' | 'KASIR')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Harap masuk terlebih dahulu' });
    }

    // SUPERADMIN always has access to all roles
    if (req.user.role === 'SUPERADMIN' || allowedRoles.includes(req.user.role)) {
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

  // Superadmin, Owner, and Supervisor have access to all outlets
  if (req.user.role === 'SUPERADMIN' || req.user.role === 'OWNER' || req.user.role === 'SUPERVISOR') {
    return next();
  }

  // Kasir is locked to their own outlet
  const targetOutletId = req.params.outletId || req.body.outletId || req.query.outletId;
  if (targetOutletId && req.user.outletId && targetOutletId !== req.user.outletId) {
    return res.status(403).json({
      success: false,
      message: 'Kasir terkunci pada outlet yang ditugaskan!',
    });
  }

  next();
};
