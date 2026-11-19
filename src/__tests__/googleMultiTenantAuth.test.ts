import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const mockFindFirstTenant = jest.fn();
const mockFindUniqueTenant = jest.fn();
const mockFindFirstUser = jest.fn();
const mockCreateUser = jest.fn();

jest.mock('../config/database', () => ({
  basePrisma: {
    tenant: {
      findFirst: mockFindFirstTenant,
      findUnique: mockFindUniqueTenant,
    },
    user: {
      findFirst: mockFindFirstUser,
    },
  },
  prisma: {
    user: {
      create: mockCreateUser,
    },
  },
}));

import {
  googleLogin,
  googleOAuthStart,
  googleOAuthCallback,
  createUser,
} from '../controllers/authController';

const makeRes = () => {
  const res: any = {
    statusCode: 200,
    body: null,
    redirectUrl: null,
    status: jest.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: any) => {
      res.body = data;
      return res;
    }),
    redirect: jest.fn().mockImplementation((url: string) => {
      res.redirectUrl = url;
      return res;
    }),
  };
  return res as Response & { statusCode: number; body: any; redirectUrl: string | null };
};

describe('Multi-Tenant Google Social Login Isolation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('allows Google login when user belongs to the target tenant (Tenant 1)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: process.env.GOOGLE_CLIENT_ID || '',
        email: 'owner1@gmail.com',
        email_verified: true,
      }),
    } as any);

    mockFindFirstTenant.mockResolvedValue({
      id: 'tenant-1',
      slug: 'tenant1',
      name: 'Tenant Satu',
      status: 'ACTIVE',
    });
    mockFindFirstUser.mockResolvedValue({
      id: 'user-1',
      name: 'Owner Satu',
      username: 'owner1@gmail.com',
      role: 'OWNER',
      outletId: null,
      tenantId: 'tenant-1',
      outlet: null,
      tenant: { id: 'tenant-1', slug: 'tenant1', name: 'Tenant Satu', status: 'ACTIVE' },
    });

    const req = {
      body: { credential: 'valid-id-token' },
      headers: { 'x-tenant-slug': 'tenant1' },
      query: {},
    } as unknown as Request;
    const res = makeRes();

    await googleLogin(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it('blocks Tenant 1 Google account from logging into Tenant 2 (cross-tenant collision)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: process.env.GOOGLE_CLIENT_ID || '',
        email: 'owner1@gmail.com',
        email_verified: true,
      }),
    } as any);

    mockFindFirstTenant.mockResolvedValue({
      id: 'tenant-2',
      slug: 'tenant2',
      name: 'Tenant Dua',
      status: 'ACTIVE',
    });
    mockFindFirstUser.mockResolvedValue({
      id: 'user-1',
      name: 'Owner Satu',
      username: 'owner1@gmail.com',
      role: 'OWNER',
      outletId: null,
      tenantId: 'tenant-1',
      outlet: null,
      tenant: { id: 'tenant-1', slug: 'tenant1', name: 'Tenant Satu', status: 'ACTIVE' },
    });

    const req = {
      body: { credential: 'valid-id-token' },
      headers: { 'x-tenant-slug': 'tenant2' },
      query: {},
    } as unknown as Request;
    const res = makeRes();

    await googleLogin(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/tenant lain/i);
  });

  it('enforces tenant binding in googleOAuthStart -> googleOAuthCallback and blocks cross-tenant redirect login', async () => {
    mockFindFirstTenant.mockResolvedValue({
      id: 'tenant-2',
      slug: 'tenant2',
      name: 'Tenant Dua',
      status: 'ACTIVE',
    });

    const startReq = {
      query: {
        redirect_origin: 'https://tenant2.vimtk.cloud',
        tenant_slug: 'tenant2',
      },
      headers: {},
      get: () => 'api.vimtk.cloud',
    } as unknown as Request;
    const startRes = makeRes();

    await googleOAuthStart(startReq, startRes);

    expect(startRes.redirectUrl).toContain('accounts.google.com');
    const authUrl = new URL(startRes.redirectUrl!);
    const state = authUrl.searchParams.get('state')!;
    const decodedState = jwt.decode(state) as any;
    expect(decodedState.tenantId).toBe('tenant-2');
    expect(decodedState.origin).toBe('https://tenant2.vimtk.cloud');

    // Now simulate Google callback returning Tenant 1's user email
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'mock-id-token' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aud: process.env.GOOGLE_CLIENT_ID || '',
          email: 'owner1@gmail.com',
          email_verified: true,
        }),
      } as any);

    mockFindFirstUser.mockResolvedValue({
      id: 'user-1',
      name: 'Owner Satu',
      username: 'owner1@gmail.com',
      role: 'OWNER',
      outletId: null,
      tenantId: 'tenant-1',
      outlet: null,
      tenant: { id: 'tenant-1', slug: 'tenant1', name: 'Tenant Satu', status: 'ACTIVE' },
    });

    const cbReq = {
      query: { code: 'oauth-code', state },
      headers: {},
      get: () => 'api.vimtk.cloud',
    } as unknown as Request;
    const cbRes = makeRes();

    await googleOAuthCallback(cbReq, cbRes);

    expect(cbRes.redirectUrl).toContain('https://tenant2.vimtk.cloud/?google_error=');
    expect(cbRes.redirectUrl).not.toContain('google_token=');
  });

  it('prevents registering the same Google email across multiple tenants (case-insensitive)', async () => {
    mockFindFirstUser.mockResolvedValue({
      id: 'user-1',
      username: 'owner1@gmail.com',
      tenantId: 'tenant-1',
    });

    const req = {
      user: { id: 'admin-2', tenantId: 'tenant-2', role: 'OWNER' },
      body: {
        name: 'Kasir Duplikat',
        username: 'Owner1@Gmail.com',
        role: 'KASIR',
      },
    } as any;
    const res = makeRes();

    await createUser(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/sudah digunakan/i);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});
