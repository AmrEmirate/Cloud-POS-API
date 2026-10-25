import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { tenantStorage } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'SUPERADMIN' | 'OWNER' | 'SUPERVISOR' | 'KASIR';
    outletId?: string;
    tenantId?: string;
    tenantSlug?: string;
    tenantName?: string;
  };
  tenantId?: string;
  tenant?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dimsum_intan_super_secure_jwt_secret_key_2026';

export const authenticateJwt = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token otentikasi tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;

    // If token has tenantId, associate it with the request
    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
    }

    // Run downstream inside tenant storage context if user has tenantId or is superadmin
    const isSuperAdmin = decoded.role === 'SUPERADMIN';
    const effectiveTenantId = isSuperAdmin ? (req.headers['x-tenant-id'] as string || undefined) : decoded.tenantId;

    tenantStorage.run({ tenantId: effectiveTenantId, isSuperAdmin: isSuperAdmin && !effectiveTenantId }, () => {
      next();
    });
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Token otentikasi tidak valid atau telah kedaluwarsa' });
  }
};
