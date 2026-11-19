import { requireRole, requireOutletAccess } from '../middlewares/rbac';
import { AuthRequest } from '../middlewares/auth';
import { Response, NextFunction } from 'express';

describe('White Box Testing: rbac.ts (Role-Based Access Control Middlewares)', () => {
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('White Box: requireRole()', () => {
    it('Branch: unauthenticated user (!req.user) returns 401', () => {
      const middleware = requireRole(['OWNER']);
      const req = {} as AuthRequest;

      middleware(req, mockRes as Response, mockNext as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Harap masuk terlebih dahulu' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Branch: OWNER cannot bypass role restrictions if only SUPERVISOR is allowed', () => {
      const middleware = requireRole(['SUPERVISOR']);
      const req = {
        user: { id: 'u1', username: 'owner', role: 'OWNER' },
      } as AuthRequest;

      middleware(req, mockRes as Response, mockNext as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Branch: user with an allowed role succeeds', () => {
      const middleware = requireRole(['OWNER', 'SUPERVISOR']);
      const req = {
        user: { id: 'u2', username: 'spv', role: 'SUPERVISOR' },
      } as AuthRequest;

      middleware(req, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('Branch: user with disallowed role returns 403', () => {
      const middleware = requireRole(['OWNER']);
      const req = {
        user: { id: 'u3', username: 'kasir1', role: 'KASIR' },
      } as AuthRequest;

      middleware(req, mockRes as Response, mockNext as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('Akses ditolak') })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Branch: AKUNTAN and INVENTORY succeed when included in allowedRoles', () => {
      const financeMw = requireRole(['OWNER', 'AKUNTAN']);
      const reqAkuntan = {
        user: { id: 'u4', username: 'akuntan1', role: 'AKUNTAN' },
      } as AuthRequest;
      financeMw(reqAkuntan, mockRes as Response, mockNext as NextFunction);
      expect(mockNext).toHaveBeenCalledTimes(1);

      const invMw = requireRole(['OWNER', 'SUPERVISOR', 'INVENTORY']);
      const reqInv = {
        user: { id: 'u5', username: 'gudang1', role: 'INVENTORY' },
      } as AuthRequest;
      invMw(reqInv, mockRes as Response, mockNext as NextFunction);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('White Box: requireOutletAccess()', () => {
    it('Branch: unauthenticated user returns 401', () => {
      const req = {} as AuthRequest;

      requireOutletAccess(req, mockRes as Response, mockNext as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Branch: OWNER can access any outlet', () => {
      const req = {
        user: { id: 'u1', username: 'owner', role: 'OWNER' },
        params: { outletId: 'outlet-different' },
      } as unknown as AuthRequest;

      requireOutletAccess(req, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
    });

    it('Branch: AKUNTAN and INVENTORY can access any outlet', () => {
      const reqAkuntan = {
        user: { id: 'u4', username: 'akuntan1', role: 'AKUNTAN' },
        params: { outletId: 'outlet-a' },
      } as unknown as AuthRequest;
      requireOutletAccess(reqAkuntan, mockRes as Response, mockNext as NextFunction);

      const reqInv = {
        user: { id: 'u5', username: 'gudang1', role: 'INVENTORY' },
        params: { outletId: 'outlet-b' },
      } as unknown as AuthRequest;
      requireOutletAccess(reqInv, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('Branch: KASIR accessing assigned outlet succeeds', () => {
      const req = {
        user: { id: 'u2', username: 'kasir1', role: 'KASIR', outletId: 'outlet-a' },
        body: { outletId: 'outlet-a' },
      } as unknown as AuthRequest;

      requireOutletAccess(req, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalled();
    });

    it('Branch: KASIR attempting to access different outlet returns 403', () => {
      const req = {
        user: { id: 'u2', username: 'kasir1', role: 'KASIR', outletId: 'outlet-a' },
        body: { outletId: 'outlet-b' },
      } as unknown as AuthRequest;

      requireOutletAccess(req, mockRes as Response, mockNext as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('Kasir terkunci') })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Branch: AKUNTAN and INVENTORY succeed when included in allowedRoles', () => {
      const financeMw = requireRole(['OWNER', 'AKUNTAN']);
      const reqAkuntan = {
        user: { id: 'u4', username: 'akuntan1', role: 'AKUNTAN' },
      } as AuthRequest;
      financeMw(reqAkuntan, mockRes as Response, mockNext as NextFunction);
      expect(mockNext).toHaveBeenCalledTimes(1);

      const invMw = requireRole(['OWNER', 'SUPERVISOR', 'INVENTORY']);
      const reqInv = {
        user: { id: 'u5', username: 'gudang1', role: 'INVENTORY' },
      } as AuthRequest;
      invMw(reqInv, mockRes as Response, mockNext as NextFunction);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });
});

