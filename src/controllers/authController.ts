import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, basePrisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'dimsum_intan_super_secure_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const getCallbackUrl = (req: Request): string => {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL.trim();
  }
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `http://${host}/api/v1/auth/google/callback`;
  }
  return 'https://vimtk.cloud/api/v1/auth/google/callback';
};

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
    if (user.tenant && user.tenant.status === 'SUSPENDED') {
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

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Token Google (credential) wajib disertakan.',
      });
    }

    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential))}`
    );
    if (!verifyRes.ok) {
      return res.status(401).json({
        success: false,
        message: 'Token Google tidak valid atau sudah kedaluwarsa.',
      });
    }

    const tokenInfo: any = await verifyRes.json();
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({
        success: false,
        message: 'Google Client ID tidak sesuai dengan aplikasi ini.',
      });
    }

    const isEmailVerified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
    if (!tokenInfo.email || !isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Email akun Google belum terverifikasi.',
      });
    }

    const cleanEmail = String(tokenInfo.email).trim().toLowerCase();

    // Strict whitelist: hanya akun yang sudah didaftarkan oleh Admin/Owner yang boleh masuk
    const user = await basePrisma.user.findUnique({
      where: { username: cleanEmail },
      include: { outlet: true, tenant: true },
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: `Akun Google (${cleanEmail}) belum terdaftar oleh Admin/Owner. Hubungi Admin untuk mendaftarkan email Google Anda terlebih dahulu.`,
      });
    }

    if (user.tenant && user.tenant.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Akun bisnis (tenant) Anda sedang dinonaktifkan/disuspensi. Silakan hubungi admin platform.',
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
      message: `Login Google berhasil (${user.name})`,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        outletId: user.outletId,
        outletName: user.outlet
          ? user.outlet.name
          : user.role === 'OWNER'
          ? 'Seluruh Outlet (Pusat)'
          : 'Supervisor Area',
        tenantId: user.tenantId,
        tenant: user.tenant || null,
      },
    });
  } catch (error: any) {
    console.error('[Google Login Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal memproses login Google',
    });
  }
};

const isSafeRedirectOrigin = (origin: string): boolean =>
  /^https?:\/\/[^/]+$/i.test(origin) || /^dimsumintan:\/\/auth$/i.test(origin);

const buildOAuthRedirectUrl = (
  origin: string,
  key: 'google_token' | 'google_error',
  value: string
): string => {
  const base = origin.startsWith('dimsumintan://') ? origin : `${origin}/`;
  return `${base}?${key}=${encodeURIComponent(value)}`;
};

export const googleOAuthStart = (req: Request, res: Response) => {
  const rawOrigin = String(req.query.redirect_origin || '').trim();
  const safeOrigin = isSafeRedirectOrigin(rawOrigin)
    ? rawOrigin
    : 'https://dimsumintan.vimtk.cloud';

  const state = Buffer.from(JSON.stringify({ origin: safeOrigin })).toString('base64url');
  const redirectUri = getCallbackUrl(req);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return res.redirect(authUrl.toString());
};

export const googleOAuthCallback = async (req: Request, res: Response) => {
  let redirectOrigin = 'https://dimsumintan.vimtk.cloud';
  try {
    if (req.query.state) {
      const parsed = JSON.parse(Buffer.from(String(req.query.state), 'base64url').toString('utf8'));
      if (parsed?.origin && isSafeRedirectOrigin(parsed.origin)) {
        redirectOrigin = parsed.origin;
      }
    }

    const code = req.query.code ? String(req.query.code) : '';
    if (!code) {
      return res.redirect(
        buildOAuthRedirectUrl(redirectOrigin, 'google_error', 'Login Google dibatalkan atau gagal.')
      );
    }

    const redirectUri = getCallbackUrl(req);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.id_token) {
      return res.redirect(
        buildOAuthRedirectUrl(
          redirectOrigin,
          'google_error',
          tokenJson?.error_description || 'Gagal menukar kode otorisasi Google.'
        )
      );
    }

    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(tokenJson.id_token))}`
    );
    const tokenInfo: any = await verifyRes.json();
    const isEmailVerified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

    if (!verifyRes.ok || tokenInfo.aud !== GOOGLE_CLIENT_ID || !tokenInfo.email || !isEmailVerified) {
      return res.redirect(
        buildOAuthRedirectUrl(redirectOrigin, 'google_error', 'Akun Google tidak valid atau belum terverifikasi.')
      );
    }

    const cleanEmail = String(tokenInfo.email).trim().toLowerCase();
    const user = await basePrisma.user.findUnique({
      where: { username: cleanEmail },
      include: { outlet: true, tenant: true },
    });

    if (!user) {
      return res.redirect(
        buildOAuthRedirectUrl(
          redirectOrigin,
          'google_error',
          `Akun Google (${cleanEmail}) belum terdaftar oleh Admin/Owner. Hubungi Admin untuk mendaftarkan email Google Anda.`
        )
      );
    }

    if (user.tenant && user.tenant.status === 'SUSPENDED') {
      return res.redirect(
        buildOAuthRedirectUrl(
          redirectOrigin,
          'google_error',
          'Akun bisnis (tenant) Anda sedang dinonaktifkan/disuspensi.'
        )
      );
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

    return res.redirect(buildOAuthRedirectUrl(redirectOrigin, 'google_token', token));
  } catch (error: any) {
    console.error('[Google OAuth Callback Error]', error);
    return res.redirect(
      buildOAuthRedirectUrl(redirectOrigin, 'google_error', 'Terjadi kesalahan saat memproses login Google.')
    );
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

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
    }

    const { name, username, password } = req.body;
    const cleanName = String(name || '').trim();
    const cleanUsername = String(username || '').trim().toLowerCase();

    if (!cleanName || !cleanUsername) {
      return res.status(400).json({
        success: false,
        message: 'Nama lengkap dan username wajib diisi!',
      });
    }

    const existingUsername = await basePrisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existingUsername && existingUsername.id !== req.user.id) {
      return res.status(400).json({
        success: false,
        message: `Username "${cleanUsername}" sudah digunakan oleh akun lain!`,
      });
    }

    const updateData: any = {
      name: cleanName,
      username: cleanUsername,
    };

    if (password && String(password).trim().length > 0) {
      if (String(password).trim().length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Kata sandi baru minimal 4 karakter!',
        });
      }
      updateData.passwordHash = await bcrypt.hash(String(password).trim(), 10);
    }

    const updated = await basePrisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: { outlet: true },
    });

    res.json({
      success: true,
      message: 'Informasi akun berhasil diperbarui!',
      data: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        role: updated.role,
        outletId: updated.outletId,
        outletName: updated.outlet ? updated.outlet.name : undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui informasi akun' });
  }
};

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { outlet: true, tenant: true },
      orderBy: { createdAt: 'asc' },
    });

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      outletId: u.outletId,
      outletName: u.outlet
        ? u.outlet.name
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

    const cleanUsername = String(username || '').trim().toLowerCase();
    const isGoogleEmail = cleanUsername.includes('@');

    if (!name || !cleanUsername || (!password && !isGoogleEmail) || !role) {
      return res.status(400).json({
        success: false,
        message: 'Nama, username/email, password, dan peran (role) wajib diisi!',
      });
    }

    if (String(role) === 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Role SUPERADMIN tidak diizinkan pada aplikasi tenant!',
      });
    }

    const existing = await basePrisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Username "${cleanUsername}" sudah digunakan!`,
      });
    }

    const rawPassword = password ? String(password) : `google_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;

    const tenantIdToAssign = req.user?.tenantId;

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

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, username, password, role, outletId, pin } = req.body;

    const existingUser = await basePrisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'Akun staf tidak ditemukan!' });
    }

    if (existingUser.tenantId !== req.user?.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Anda tidak berhak mengubah akun tenant lain!',
      });
    }

    if (String(role) === 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Role SUPERADMIN tidak diizinkan pada aplikasi tenant!',
      });
    }

    const cleanName = String(name || existingUser.name).trim();
    const cleanUsername = String(username || existingUser.username).trim().toLowerCase();

    if (!cleanName || !cleanUsername) {
      return res.status(400).json({
        success: false,
        message: 'Nama lengkap dan username tidak boleh kosong!',
      });
    }

    if (cleanUsername !== existingUser.username) {
      const duplicate = await basePrisma.user.findUnique({
        where: { username: cleanUsername },
      });
      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({
          success: false,
          message: `Username "${cleanUsername}" sudah digunakan!`,
        });
      }
    }

    const nextRole = role || existingUser.role;
    const updateData: any = {
      name: cleanName,
      username: cleanUsername,
      role: nextRole,
      outletId: nextRole === 'OWNER' ? null : (outletId !== undefined ? (outletId || null) : existingUser.outletId),
    };

    if (password && String(password).trim().length > 0) {
      if (String(password).trim().length < 4) {
        return res.status(400).json({ success: false, message: 'Kata sandi baru minimal 4 karakter!' });
      }
      updateData.passwordHash = await bcrypt.hash(String(password).trim(), 10);
    }

    if (pin && String(pin).trim().length > 0) {
      if (String(pin).trim().length < 4) {
        return res.status(400).json({ success: false, message: 'PIN minimal 4 digit!' });
      }
      updateData.pinHash = await bcrypt.hash(String(pin).trim(), 10);
    }

    const updated = await basePrisma.user.update({
      where: { id },
      data: updateData,
      include: { outlet: true },
    });

    res.json({
      success: true,
      message: `Data akun ${updated.name} berhasil diperbarui!`,
      data: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        role: updated.role,
        outletId: updated.outletId,
        outletName: updated.outlet
          ? updated.outlet.name
          : updated.role === 'OWNER'
          ? 'Seluruh Outlet (Pusat)'
          : 'Supervisor Area',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Gagal memperbarui akun staf' });
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

    if (user.tenantId && req.user?.tenantId && user.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Pengguna bukan bagian dari organisasi/toko Anda',
      });
    }

    if (user.role === 'OWNER' && user.tenantId) {
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
