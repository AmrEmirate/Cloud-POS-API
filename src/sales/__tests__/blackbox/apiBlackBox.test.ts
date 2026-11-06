import request from 'supertest';
import express from 'express';
import apiRouter from '../../routes';
import { errorHandler, notFoundHandler } from '../../middlewares/error.middleware';
import { signToken } from '../../utils/jwt';
import prisma from '../../config/prisma';

// Mock Prisma agar Black Box API test tidak bergantung pada koneksi server fisik 192.168.18.59:3013
jest.mock('../../config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  license: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

// Inisialisasi test express app tanpa memblokir port network
const app = express();
app.use(express.json());
app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

describe('Black Box Testing: ProtekSales REST API Contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Public Endpoints (No Auth Required)', () => {
    it('Endpoint: GET /api/health should return 200 and health status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toContain('ProtekSales');
      expect(res.body.timestamp).toBeDefined();
    });

    it('Endpoint: GET /api/plans should return 200 and 4 official POS subscription plans', async () => {
      const res = await request(app).get('/api/plans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4);

      const codes = res.body.data.map((p: any) => p.code);
      expect(codes).toContain('PAKET_100K');
      expect(codes).toContain('PAKET_150K');
      expect(codes).toContain('PAKET_200K');
      expect(codes).toContain('PAKET_250K');
    });

    it('Endpoint: POST /api/license/heartbeat validation guards', async () => {
      // 1. Missing licenseKey returns 400 Bad Request
      const badRes = await request(app)
        .post('/api/license/heartbeat')
        .send({});
      expect(badRes.status).toBe(400);
      expect(badRes.body.success).toBe(false);
      expect(badRes.body.message).toContain('Kunci lisensi (licenseKey) wajib');

      // 2. Non-existent licenseKey returns 200 with canOperate: false
      (prisma.license.findUnique as jest.Mock).mockResolvedValue(null);

      const expiredRes = await request(app)
        .post('/api/license/heartbeat')
        .send({ licenseKey: 'UNKNOWN-KEY-NON-EXISTENT' });
      expect(expiredRes.status).toBe(200);
      expect(expiredRes.body.data.canOperate).toBe(false);
      expect(expiredRes.body.data.status).toBe('EXPIRED');
    });

    it('Endpoint: POST /api/auth/login input validation', async () => {
      // Missing email & password
      const emptyRes = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.success).toBe(false);
      expect(emptyRes.body.message).toContain('Email dan password wajib diisi');

      // Invalid credentials (User not found in DB)
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      if ((prisma.user as any).findFirst) {
        ((prisma.user as any).findFirst as jest.Mock).mockResolvedValue(null);
      }

      const invalidRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@protek.id', password: 'InvalidPassword' });
      expect(invalidRes.status).toBe(401);
      expect(invalidRes.body.success).toBe(false);
      expect(invalidRes.body.message).toContain('Kombinasi email atau password salah');

      // Admin Login dengan akun khusus amremi dan password SelviCantik01)
      const adminLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'amremi', password: 'SelviCantik01)' });
      expect(adminLoginRes.status).toBe(200);
      expect(adminLoginRes.body.success).toBe(true);
      expect(adminLoginRes.body.data.user.role).toBe('ADMIN');
      expect(adminLoginRes.body.data.token).toBeDefined();

      // Admin Login dengan email amremi@protek.id dan password SelviCantik01)
      const adminEmailLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'amremi@protek.id', password: 'SelviCantik01)' });
      expect(adminEmailLoginRes.status).toBe(200);
      expect(adminEmailLoginRes.body.success).toBe(true);
      expect(adminEmailLoginRes.body.data.user.role).toBe('ADMIN');

      // Admin login gagal jika kata sandi salah
      const adminWrongPass = await request(app)
        .post('/api/auth/login')
        .send({ email: 'amremi', password: 'WrongPassword123' });
      expect(adminWrongPass.status).toBe(401);
      expect(adminWrongPass.body.success).toBe(false);
    });
  });

  describe('Protected Endpoints Security Guards (401 & 403 Matrix)', () => {
    it('should return 401 Unauthorized when accessing protected routes without Bearer token', async () => {
      const protectedRoutes = [
        { method: 'get', path: '/api/auth/profile' },
        { method: 'get', path: '/api/leads' },
        { method: 'get', path: '/api/outlets' },
        { method: 'get', path: '/api/commissions/wallet' },
        { method: 'get', path: '/api/admin/metrics' },
      ];

      for (const route of protectedRoutes) {
        const res = await (request(app) as any)[route.method](route.path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Token otentikasi tidak ditemukan');
      }
    });

    it('should return 403 Forbidden when a SALES partner attempts to access ADMIN routes', async () => {
      const salesToken = signToken({
        userId: 'sales-uuid-99',
        email: 'sales@protek.id',
        role: 'SALES',
      });

      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Akses ditolak. Endpoint ini hanya untuk role: ADMIN');
    });

    it('Endpoint: POST /api/admin/sales input validation for missing required fields', async () => {
      const adminToken = signToken({
        userId: 'admin-uuid-1',
        email: 'admin@protek.id',
        role: 'ADMIN',
      });

      const res = await request(app)
        .post('/api/admin/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Nama lengkap');
    });

    it('should return 404 for non-existent routes', async () => {
      const res = await request(app).get('/api/unregistered-path-1234');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('tidak ditemukan');
    });
  });
});
