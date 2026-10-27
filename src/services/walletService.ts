import { basePrisma } from '../config/database';
import { Prisma } from '@prisma/client';

export class WalletService {
  /**
   * Tambah Saldo Masuk (CREDIT) dari transaksi kasir POS QRIS Duitku
   */
  public static async creditBalance(params: {
    tenantId: string;
    outletId?: string | null;
    amount: number;
    category: 'POS_SALES' | 'ADJUSTMENT' | 'REFUND';
    referenceId?: string | null;
    description: string;
  }) {
    const numAmount = Math.max(0, Math.round(params.amount));
    if (numAmount <= 0) return null;

    return await basePrisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: params.tenantId },
        select: { id: true, walletBalance: true },
      });

      if (!tenant) throw new Error('Tenant tidak ditemukan');

      const balanceBefore = Number(tenant.walletBalance || 0);
      const balanceAfter = balanceBefore + numAmount;

      // 1. Update Saldo Tenant
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { walletBalance: balanceAfter },
      });

      // 2. Catat Mutasi Saldo Masuk
      const transaction = await tx.walletTransaction.create({
        data: {
          tenantId: tenant.id,
          outletId: params.outletId || null,
          type: 'CREDIT',
          category: params.category,
          amount: numAmount,
          balanceBefore,
          balanceAfter,
          referenceId: params.referenceId || null,
          description: params.description,
        },
      });

      return {
        transaction,
        balanceBefore,
        balanceAfter,
      };
    });
  }

  /**
   * Buat Pengajuan Tarik Saldo (WITHDRAWAL) ke Rekening Bank Pemilik Toko
   */
  public static async requestWithdrawal(params: {
    tenantId: string;
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
    notes?: string;
  }) {
    const numAmount = Math.round(params.amount);
    if (numAmount < 20000) {
      throw new Error('Nominal penarikan saldo minimal Rp 20.000!');
    }

    if (!params.bankName || !params.bankAccountNumber || !params.bankAccountName) {
      throw new Error('Informasi rekening bank tujuan wajib diisi lengkap!');
    }

    return await basePrisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: params.tenantId },
        select: { id: true, walletBalance: true },
      });

      if (!tenant) throw new Error('Tenant tidak ditemukan');

      const currentBalance = Number(tenant.walletBalance || 0);
      if (currentBalance < numAmount) {
        throw new Error(
          `Saldo dompet Anda tidak mencukupi! Saldo saat ini: Rp ${currentBalance.toLocaleString('id-ID')}`
        );
      }

      const balanceBefore = currentBalance;
      const balanceAfter = currentBalance - numAmount;
      const fee = 0; // Bebas biaya admin transfer
      const netAmount = numAmount - fee;

      // 1. Kurangi Saldo Aktif Tenant
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          walletBalance: balanceAfter,
          bankName: params.bankName.trim(),
          bankAccountNumber: params.bankAccountNumber.trim(),
          bankAccountName: params.bankAccountName.trim(),
        },
      });

      // 2. Buat Nomor Penarikan Unik (WD-YYYYMMDD-XXXX)
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const withdrawalNumber = `WD-${dateStr}-${randSuffix}`;

      // 3. Catat Permintaan Penarikan
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          tenantId: tenant.id,
          withdrawalNumber,
          amount: numAmount,
          fee,
          netAmount,
          bankName: params.bankName.trim(),
          bankAccountNumber: params.bankAccountNumber.trim(),
          bankAccountName: params.bankAccountName.trim(),
          status: 'PENDING',
          notes: params.notes || null,
        },
      });

      // 4. Catat Mutasi Saldo Keluar (DEBIT)
      const walletTx = await tx.walletTransaction.create({
        data: {
          tenantId: tenant.id,
          type: 'DEBIT',
          category: 'WITHDRAWAL',
          amount: numAmount,
          balanceBefore,
          balanceAfter,
          referenceId: withdrawal.id,
          description: `Penarikan Saldo (${withdrawalNumber}) ke ${params.bankName} - ${params.bankAccountNumber} a/n ${params.bankAccountName}`,
        },
      });

      return {
        withdrawal,
        walletTx,
        balanceBefore,
        balanceAfter,
      };
    });
  }

  /**
   * Dapatkan Ringkasan Saldo, Rekening Bank, dan Statistik Dompet
   */
  public static async getWalletSummary(tenantId: string) {
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        walletBalance: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
      },
    });

    if (!tenant) throw new Error('Tenant tidak ditemukan');

    // Agregasi mutasi saldo
    const [aggregates, pendingWithdrawals, recentTransactions, recentWithdrawals] = await Promise.all([
      basePrisma.walletTransaction.groupBy({
        by: ['type'],
        where: { tenantId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      basePrisma.withdrawalRequest.aggregate({
        where: { tenantId, status: 'PENDING' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      basePrisma.walletTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          outlet: { select: { name: true, code: true } },
        },
      }),
      basePrisma.withdrawalRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    let totalCredited = 0;
    let totalDebited = 0;

    for (const agg of aggregates) {
      if (agg.type === 'CREDIT') totalCredited = Number(agg._sum.amount || 0);
      if (agg.type === 'DEBIT') totalDebited = Number(agg._sum.amount || 0);
    }

    return {
      walletBalance: Number(tenant.walletBalance || 0),
      totalCredited,
      totalDebited,
      pendingWithdrawalAmount: Number(pendingWithdrawals._sum.amount || 0),
      pendingWithdrawalCount: pendingWithdrawals._count.id || 0,
      bankInfo: {
        bankName: tenant.bankName || '',
        bankAccountNumber: tenant.bankAccountNumber || '',
        bankAccountName: tenant.bankAccountName || '',
      },
      recentTransactions,
      recentWithdrawals,
    };
  }

  /**
   * Update Pengaturan Rekening Bank Pemilik Toko
   */
  public static async updateBankAccount(
    tenantId: string,
    data: { bankName: string; bankAccountNumber: string; bankAccountName: string }
  ) {
    return await basePrisma.tenant.update({
      where: { id: tenantId },
      data: {
        bankName: data.bankName.trim(),
        bankAccountNumber: data.bankAccountNumber.trim(),
        bankAccountName: data.bankAccountName.trim(),
      },
      select: {
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
      },
    });
  }

  /**
   * Superadmin Memproses Permohonan Penarikan Dana (Approve / Reject)
   */
  public static async processWithdrawalBySuperadmin(params: {
    withdrawalId: string;
    status: 'PROCESSED' | 'REJECTED';
    rejectionReason?: string;
    proofImageUrl?: string;
  }) {
    return await basePrisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawalRequest.findUnique({
        where: { id: params.withdrawalId },
        include: { tenant: true },
      });

      if (!withdrawal) throw new Error('Pengajuan penarikan dana tidak ditemukan');
      if (withdrawal.status !== 'PENDING') {
        throw new Error(`Pengajuan ini sudah berstatus ${withdrawal.status}!`);
      }

      if (params.status === 'PROCESSED') {
        // Tandai selesai ditransfer
        return await tx.withdrawalRequest.update({
          where: { id: withdrawal.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            proofImageUrl: params.proofImageUrl || null,
          },
        });
      }

      // Jika REJECTED: Kembalikan saldo ke dompet tenant (REFUND)
      const refundAmount = Number(withdrawal.amount);
      const balanceBefore = Number(withdrawal.tenant.walletBalance || 0);
      const balanceAfter = balanceBefore + refundAmount;

      await tx.tenant.update({
        where: { id: withdrawal.tenantId },
        data: { walletBalance: balanceAfter },
      });

      // Catat mutasi pengembalian dana
      await tx.walletTransaction.create({
        data: {
          tenantId: withdrawal.tenantId,
          type: 'CREDIT',
          category: 'REFUND',
          amount: refundAmount,
          balanceBefore,
          balanceAfter,
          referenceId: withdrawal.id,
          description: `Pengembalian Saldo (${withdrawal.withdrawalNumber}) Ditolak: ${params.rejectionReason || 'Alasan administratif'}`,
        },
      });

      return await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'REJECTED',
          rejectionReason: params.rejectionReason || 'Ditolak oleh admin',
          processedAt: new Date(),
        },
      });
    });
  }
}
