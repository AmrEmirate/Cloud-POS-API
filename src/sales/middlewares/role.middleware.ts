import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { sendError } from '../utils/response';

export const authorizeRole = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Autentikasi diperlukan.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Akses ditolak. Endpoint ini hanya untuk role: ${allowedRoles.join(', ')}.`,
        403
      );
    }

    next();
  };
};
