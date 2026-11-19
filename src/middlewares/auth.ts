import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { tenantStorage } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'OWNER' | 'SUPERVISOR' | 'KASIR' | 'AKUNTAN' | 'INVENTORY';
    outletId?: string;
    tenantId?: string;
    tenantSlug?: string;
    tenantName?: string;
  };
  tenantId?: string;
  tenant?: any;
}

export const getJwtSecret = (): string => {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set (>= 16 chars) in production.');
  }
  return 'dimsum_intan_dev_only_jwt_secret_2026';
};

const JWT_SECRET = getJwtSecret();

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

    // Run downstream inside tenant storage context strictly scoped to decoded.tenantId
    tenantStorage.run({ tenantId: decoded.tenantId, isSuperAdmin: false }, () => {
      next();
    });
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Token otentikasi tidak valid atau telah kedaluwarsa' });
  }
};

/**
 * Optional JWT Authentication: populates req.user & tenant context if valid token is provided,
 * otherwise proceeds unauthenticated (allowing controller to mask sensitive internal fields).
 */
export const optionalAuthenticateJwt = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
    }
    return tenantStorage.run({ tenantId: decoded.tenantId || req.tenantId, isSuperAdmin: false }, () => {
      next();
    });
  } catch {
    return next();
  }
};
