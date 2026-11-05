import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { CommissionService } from '../services/commission.service';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/response';

export class CommissionController {
  /**
   * Ringkasan Dompet Komisi Sales
   * GET /api/commissions/wallet
   */
  static async getWallet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const wallet = await CommissionService.getSalesWalletSummary(salesId);

      return sendSuccess(res, 'Ringkasan dompet komisi berhasil diambil.', wallet);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Riwayat Komisi yang Didapatkan
   * GET /api/commissions/history
   */
  static async getCommissionHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const { status } = req.query;

      const whereClause: any = { salesId };
      if (status && typeof status === 'string') {
        whereClause.status = status;
      }

      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: {
          invoice: {
            include: {
              outlet: {
                select: { id: true, name: true, phone: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return sendSuccess(res, 'Riwayat komisi berhasil diambil.', commissions);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Form Pengajuan Penarikan Saldo Komisi ke Rekening Bank
   * POST /api/commissions/withdraw
   */
  static async requestWithdrawal(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const { amount, bankName, accountNumber, accountHolder } = req.body;

      if (!amount || isNaN(Number(amount))) {
        return sendError(res, 'Nominal penarikan dana wajib diisi.', 400);
      }

      // Ambil rekening tersimpan jika tidak diinput di request body
      const user = await prisma.user.findUnique({ where: { id: salesId } });
      const targetBankName = bankName || user?.bankName;
      const targetAccountNumber = accountNumber || user?.bankAccountNumber;
      const targetAccountHolder = accountHolder || user?.bankAccountHolder;

      if (!targetBankName || !targetAccountNumber || !targetAccountHolder) {
        return sendError(
          res,
          'Data rekening bank tujuan belum lengkap. Mohon lengkapi nama bank, nomor rekening, dan pemilik rekening.',
          400
        );
      }

      const withdrawal = await CommissionService.requestWithdrawal(salesId, parseFloat(amount), {
        bankName: targetBankName,
        accountNumber: targetAccountNumber,
        accountHolder: targetAccountHolder,
      });

      return sendSuccess(res, 'Pengajuan penarikan dana berhasil dikirim, menunggu persetujuan admin.', withdrawal, 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal mengajukan penarikan dana.', 400);
    }
  }

  /**
   * Riwayat Penarikan Dana (Withdrawals)
   * GET /api/commissions/withdrawals
   */
  static async getWithdrawals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const userRole = req.user!.role;

      const whereClause: any = userRole === 'ADMIN' ? {} : { salesId };

      const withdrawals = await prisma.withdrawal.findMany({
        where: whereClause,
        include: {
          sales: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return sendSuccess(res, 'Riwayat penarikan dana berhasil diambil.', withdrawals);
    } catch (error) {
      next(error);
    }
  }
}
