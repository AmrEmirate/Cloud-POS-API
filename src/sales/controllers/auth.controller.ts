import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { signToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, phone, role, commissionRate } = req.body;

      if (!name || !email || !password || !phone) {
        return sendError(res, 'Nama, email, password, dan nomor telepon wajib diisi.', 400);
      }

      const cleanEmail = email.toLowerCase().trim();

      // Kebijakan Sistem: Hanya diperbolehkan 1 akun Admin tunggal di seluruh platform (amremi).
      // Akun Mitra Sales diperbolehkan banyak (unlimited).
      if (
        role === 'ADMIN' ||
        cleanEmail === 'amremi' ||
        cleanEmail === 'amremi@protek.id' ||
        cleanEmail === 'admin@protek.id'
      ) {
        return sendError(
          res,
          'Sistem dibatasi hanya untuk 1 Akun Admin Utama (amremi). Pendaftaran akun Admin baru dinonaktifkan.',
          403
        );
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existingUser) {
        return sendError(res, 'Email sudah terdaftar.', 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const cleanPhone = sanitizePhoneNumber(phone);

      // Seluruh akun baru yang didaftarkan berstatus Mitra Sales
      const user = await prisma.user.create({
        data: {
          name,
          email: cleanEmail,
          password: hashedPassword,
          phone: cleanPhone,
          role: 'SALES',
          commissionRate: commissionRate ? parseFloat(commissionRate) : 25.0,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          commissionRate: true,
          createdAt: true,
        },
      });

      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return sendSuccess(res, 'Registrasi berhasil sebagai Mitra Sales.', { user, token }, 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return sendError(res, 'Email dan password wajib diisi.', 400);
      }

      const cleanIdentifier = String(email).trim().toLowerCase();

      // Super Admin ProTek HQ: username 'amremi' atau 'amremi@protek.id' dengan kata sandi 'SelviCantik01)'
      const isAmremiAdmin =
        (cleanIdentifier === 'amremi' ||
          cleanIdentifier === 'amremi@protek.id' ||
          cleanIdentifier === 'admin@protek.id') &&
        password === 'SelviCantik01)';

      if (isAmremiAdmin) {
        let adminUser: any = null;
        try {
          if (typeof prisma.user.findFirst === 'function') {
            adminUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { email: 'amremi@protek.id' },
                  { email: 'admin@protek.id' },
                  { email: cleanIdentifier },
                ],
              },
            });
          } else {
            adminUser = await prisma.user.findUnique({
              where: { email: cleanIdentifier.includes('@') ? cleanIdentifier : `${cleanIdentifier}@protek.id` },
            });
          }
        } catch {
          // Fallback dev/mock resilience
        }

        const adminId = adminUser?.id || 'admin-amremi-hq-uuid';
        const adminEmail = adminUser?.email || (cleanIdentifier.includes('@') ? cleanIdentifier : 'amremi@protek.id');
        const adminName = adminUser?.name || 'Amremi (Super Admin ProTek)';

        const token = signToken({
          userId: adminId,
          email: adminEmail,
          role: 'ADMIN',
        });

        return sendSuccess(res, 'Login berhasil sebagai Administrator ProTek HQ.', {
          user: {
            id: adminId,
            name: adminName,
            email: adminEmail,
            phone: adminUser?.phone || '6281234567890',
            role: 'ADMIN',
            commissionRate: adminUser?.commissionRate ?? 0,
            bankName: adminUser?.bankName ?? null,
            bankAccountNumber: adminUser?.bankAccountNumber ?? null,
            bankAccountHolder: adminUser?.bankAccountHolder ?? null,
          },
          token,
        });
      }

      const lookupEmail = cleanIdentifier.includes('@') ? cleanIdentifier : `${cleanIdentifier}@protek.id`;
      let user: any = null;
      if (typeof prisma.user.findFirst === 'function') {
        user = await prisma.user.findFirst({
          where: {
            OR: [{ email: cleanIdentifier }, { email: lookupEmail }],
          },
        });
      } else {
        user = await prisma.user.findUnique({
          where: { email: lookupEmail },
        });
      }

      if (!user) {
        return sendError(res, 'Kombinasi email atau password salah.', 401);
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return sendError(res, 'Kombinasi email atau password salah.', 401);
      }

      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return sendSuccess(res, 'Login berhasil.', {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          commissionRate: user.commissionRate,
          bankName: user.bankName,
          bankAccountNumber: user.bankAccountNumber,
          bankAccountHolder: user.bankAccountHolder,
        },
        token,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          commissionRate: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
          createdAt: true,
        },
      });

      if (!user) {
        return sendError(res, 'Pengguna tidak ditemukan.', 404);
      }

      return sendSuccess(res, 'Profil berhasil diambil.', user);
    } catch (error) {
      next(error);
    }
  }

  static async updateBankInfo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { bankName, bankAccountNumber, bankAccountHolder } = req.body;

      if (!bankName || !bankAccountNumber || !bankAccountHolder) {
        return sendError(res, 'Nama bank, nomor rekening, dan nama pemilik rekening wajib diisi.', 400);
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          bankName,
          bankAccountNumber,
          bankAccountHolder,
        },
        select: {
          id: true,
          name: true,
          email: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
        },
      });

      return sendSuccess(res, 'Informasi rekening bank berhasil diperbarui.', updatedUser);
    } catch (error) {
      next(error);
    }
  }
}
