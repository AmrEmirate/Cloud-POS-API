import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, basePrisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'dimsum_intan_super_secure_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi',
      });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    // Look up user globally
    const user = await basePrisma.user.findUnique({
      where: { username: cleanUsername },
      include: { outlet: true, tenant: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Pengguna tidak ditemukan atau kredensial salah',
      });
    }

    // Verify tenant status if user belongs to a tenant
    if (user.tenant && user.tenant.status === 'SUSPENDED' && user.role !== 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Akun bisnis (tenant) Anda sedang dinonaktifkan/disuspensi. Silakan hubungi admin platform.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah',
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        outletId: user.outletId,
        tenantId: user.tenantId,
        tenantSlug: user.tenant?.slug,
        tenantName: user.tenant?.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    res.json({
      success: true,
      message: `Selamat datang, ${user.name}`,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        outletId: user.outletId,
        outletName: user.outlet
          ? user.outlet.name
          : user.role === 'SUPERADMIN'
          ? 'Platform Superadmin'
          : user.role === 'OWNER'
          ? 'Seluruh Outlet (Pusat)'
          : 'Supervisor Area',
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              name: user.tenant.name,
              slug: user.tenant.slug,
              customDomain: user.tenant.customDomain,
              logoUrl: user.tenant.logoUrl,
              themeColor: user.tenant.themeColor || '#ea580c',
              plan: user.tenant.plan,
              status: user.tenant.status,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('[Auth Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan server' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
    }

    const user = await basePrisma.user.findUnique({
      where: { id: req.user.id },
      include: { outlet: true, tenant: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        outletId: user.outletId,
        outletName: user.outlet
          ? user.outlet.name
          : user.role === 'SUPERADMIN'
          ? 'Platform Superadmin'
          : user.role === 'OWNER'
          ? 'Seluruh Outlet (Pusat)'
          : 'Supervisor Area',
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              name: user.tenant.name,
              slug: user.tenant.slug,
              customDomain: user.tenant.customDomain,
              logoUrl: user.tenant.logoUrl,
              themeColor: user.tenant.themeColor || '#ea580c',
              plan: user.tenant.plan,
              status: user.tenant.status,
            }
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePin = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
    }

    const { newPin } = req.body;
    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ success: false, message: 'PIN minimal 4 digit angka!' });
    }

    const pinHash = await bcrypt.hash(String(newPin), 10);
    await basePrisma.user.update({
      where: { id: req.user.id },
      data: { pinHash },
    });

    res.json({ success: true, message: 'PIN otorisasi berhasil diperbarui' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal mengubah PIN' });
  }
};

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = req.user?.role === 'SUPERADMIN';
    const targetTenantId = req.headers['x-tenant-id'] as string || req.user?.tenantId;

    const users = await (isSuperAdmin && !targetTenantId
      ? basePrisma.user.findMany({
          include: { outlet: true, tenant: true },
          orderBy: { createdAt: 'asc' },
        })
      : prisma.user.findMany({
          include: { outlet: true, tenant: true },
          orderBy: { createdAt: 'asc' },
        }));

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      outletId: u.outletId,
      outletName: u.outlet
        ? u.outlet.name
        : u.role === 'SUPERADMIN'
        ? 'Platform Superadmin'
        : u.role === 'OWNER'
        ? 'Seluruh Outlet (Pusat)'
        : 'Supervisor Area',
      tenantId: u.tenantId,
      tenantName: u.tenant ? u.tenant.name : 'Platform',
      createdAt: u.createdAt,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal mengambil data pengguna' });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, username, password, role, outletId, pin } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Nama, username, password, dan peran (role) wajib diisi!',
      });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    const existing = await basePrisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Username "${cleanUsername}" sudah digunakan!`,
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;

    const tenantIdToAssign = req.user?.role === 'SUPERADMIN'
      ? (req.body.tenantId || req.user?.tenantId || null)
      : req.user?.tenantId;

    const newUser = await prisma.user.create({
      data: {
        name: String(name).trim(),
        username: cleanUsername,
        passwordHash,
        pinHash,
        role,
        outletId: outletId || null,
        tenantId: tenantIdToAssign,
      },
      include: { outlet: true },
    });

    res.status(201).json({
      success: true,
      message: `Akun ${newUser.name} (${newUser.role}) berhasil didaftarkan!`,
      data: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role,
        outletId: newUser.outletId,
        outletName: newUser.outlet
          ? newUser.outlet.name
          : newUser.role === 'OWNER'
          ? 'Seluruh Outlet (Pusat)'
          : 'Supervisor Area',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menambahkan pengguna' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        message: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login!',
      });
    }

    const user = await basePrisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }

    if (user.role === 'SUPERADMIN') {
      const superadminCount = await basePrisma.user.count({ where: { role: 'SUPERADMIN' } });
      if (superadminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Tidak dapat menghapus satu-satunya akun Superadmin platform!',
        });
      }
    } else if (user.role === 'OWNER' && user.tenantId) {
      const ownerCount = await basePrisma.user.count({
        where: { role: 'OWNER', tenantId: user.tenantId },
      });
      if (ownerCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Tidak dapat menghapus akun Owner utama terakhir dari tenant ini!',
        });
      }
    }

    await basePrisma.user.delete({ where: { id } });

    res.json({ success: true, message: 'Akun staf berhasil dihapus!' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menghapus pengguna' });
  }
};
