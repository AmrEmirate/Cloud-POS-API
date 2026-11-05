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

      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return sendError(res, 'Email sudah terdaftar.', 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const cleanPhone = sanitizePhoneNumber(phone);

      const user = await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          phone: cleanPhone,
          role: role === 'ADMIN' ? 'ADMIN' : 'SALES',
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

      return sendSuccess(res, 'Registrasi berhasil.', { user, token }, 201);
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

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

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
