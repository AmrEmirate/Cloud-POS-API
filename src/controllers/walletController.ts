import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { WalletService } from '../services/walletService';
import { basePrisma } from '../config/database';

export const getWalletSummary = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const summary = await WalletService.getWalletSummary(tenantId);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[Get Wallet Summary Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat saldo dompet' });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const { type, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const takeNum = Math.min(100, Math.max(5, parseInt(String(limit)) || 50));
    const skipNum = (pageNum - 1) * takeNum;

    const where: any = { tenantId };
    if (type && (type === 'CREDIT' || type === 'DEBIT')) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      basePrisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
        include: {
          outlet: { select: { id: true, name: true, code: true } },
        },
      }),
      basePrisma.walletTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: pageNum,
          limit: takeNum,
          totalPages: Math.ceil(total / takeNum),
        },
      },
    });
  } catch (error: any) {
    console.error('[Get Transactions Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat riwayat mutasi' });
  }
};

export const getWithdrawals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const withdrawals = await basePrisma.withdrawalRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: withdrawals });
  } catch (error: any) {
    console.error('[Get Withdrawals Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat riwayat penarikan' });
  }
};

export const requestWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const { amount, bankName, bankAccountNumber, bankAccountName, notes } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Nominal penarikan dana wajib diisi!' });
    }

    const result = await WalletService.requestWithdrawal({
      tenantId,
      amount: parseFloat(amount),
      bankName,
      bankAccountNumber,
      bankAccountName,
      notes,
    });

    res.json({
      success: true,
      message: `Permohonan penarikan saldo sebesar Rp ${Number(result.withdrawal.amount).toLocaleString('id-ID')} berhasil diajukan! Admin akan memproses transfer.`,
      data: result,
    });
  } catch (error: any) {
    console.error('[Request Withdrawal Error]', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal mengajukan penarikan saldo' });
  }
};

export const updateBankAccount = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const { bankName, bankAccountNumber, bankAccountName } = req.body;
    if (!bankName || !bankAccountNumber || !bankAccountName) {
      return res.status(400).json({
        success: false,
        message: 'Nama Bank, Nomor Rekening, dan Nama Pemilik Rekening wajib diisi!',
      });
    }

    const updated = await WalletService.updateBankAccount(tenantId, {
      bankName,
      bankAccountNumber,
      bankAccountName,
    });

    res.json({
      success: true,
      message: 'Rekening bank penarikan saldo berhasil disimpan!',
      data: updated,
    });
  } catch (error: any) {
    console.error('[Update Bank Account Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menyimpan rekening bank' });
  }
};

// ==========================================
// SUPERADMIN WITHDRAWAL AUDIT & PROCESSING
// ==========================================

export const getSuperadminWithdrawals = async (_req: AuthRequest, res: Response) => {
  try {
    const withdrawals = await basePrisma.withdrawalRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            walletBalance: true,
          },
        },
      },
    });

    res.json({ success: true, data: withdrawals });
  } catch (error: any) {
    console.error('[Superadmin Get Withdrawals Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat daftar penarikan' });
  }
};

export const processSuperadminWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, proofImageUrl } = req.body;

    if (!id || (status !== 'PROCESSED' && status !== 'REJECTED')) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tidak valid. Status harus PROCESSED atau REJECTED.',
      });
    }

    const result = await WalletService.processWithdrawalBySuperadmin({
      withdrawalId: String(id),
      status,
      rejectionReason,
      proofImageUrl,
    });

    res.json({
      success: true,
      message:
        status === 'PROCESSED'
          ? 'Penarikan dana telah disetujui & ditandai berhasil ditransfer!'
          : 'Penarikan dana ditolak dan saldo telah dikembalikan ke dompet tenant.',
      data: result,
    });
  } catch (error: any) {
    console.error('[Process Withdrawal Error]', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal memproses penarikan saldo' });
  }
};
