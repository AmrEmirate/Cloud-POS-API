import prisma from '../config/prisma';
import { CommissionStatus, WithdrawalStatus, InvoiceStatus } from '../constants/enums';
import { config } from '../config/env';

export class CommissionService {
  /**
   * Membuat komisi otomatis saat tagihan outlet berstatus PAID
   */
  static async processInvoiceCommission(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        outlet: {
          include: {
            sales: true,
          },
        },
        commission: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice tidak ditemukan.');
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      throw new Error('Invoice belum lunas. Komisi hanya dibuat untuk invoice yang sudah lunas (PAID).');
    }

    // Jika komisi untuk invoice ini sudah pernah dibuat
    if (invoice.commission) {
      return invoice.commission;
    }

    const sales = invoice.outlet.sales;

    // Outlet Binaan Langsung Admin HQ:
    // Pendapatan langganan 100% masuk ke kas pusat Admin tanpa potongan komisi mitra sales pihak ketiga
    if (sales.role === 'ADMIN' || sales.email?.toLowerCase().includes('amremi')) {
      return null;
    }

    const percentage = sales.commissionRate || config.defaultCommissionPercentage;
    const amount = (invoice.amount * percentage) / 100;

    const commission = await prisma.commission.create({
      data: {
        salesId: sales.id,
        invoiceId: invoice.id,
        invoiceAmount: invoice.amount,
        percentage,
        amount,
        status: CommissionStatus.READY,
      },
    });

    return commission;
  }

  /**
   * Mengambil ringkasan saldo dompet komisi sales
   */
  static async getSalesWalletSummary(salesId: string) {
    // 1. Total Komisi Siap Ditarik (READY)
    const readyCommissions = await prisma.commission.aggregate({
      where: {
        salesId,
        status: CommissionStatus.READY,
      },
      _sum: {
        amount: true,
      },
    });

    // 2. Total Komisi Sedang Diajukan Penarikan (PENDING withdrawal)
    const pendingWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        salesId,
        status: WithdrawalStatus.PENDING,
      },
      _sum: {
        amount: true,
      },
    });

    // 3. Total Komisi Sudah Ditarik (COMPLETED withdrawal)
    const completedWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        salesId,
        status: WithdrawalStatus.COMPLETED,
      },
      _sum: {
        amount: true,
      },
    });

    // 4. Komisi Tertahan / Potensi Komisi dari outlet yang tagihannya belum dibayar (UNPAID / OVERDUE)
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        outlet: {
          salesId,
        },
        status: {
          in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE],
        },
      },
      include: {
        outlet: {
          include: {
            sales: true,
          },
        },
      },
    });

    let pendingPotentialCommission = 0;
    for (const inv of unpaidInvoices) {
      const rate = inv.outlet.sales.commissionRate || config.defaultCommissionPercentage;
      pendingPotentialCommission += (inv.amount * rate) / 100;
    }

    const totalReady = readyCommissions._sum.amount || 0;
    const totalPendingWithdrawal = pendingWithdrawals._sum.amount || 0;
    const availableToWithdraw = Math.max(0, totalReady - totalPendingWithdrawal);

    return {
      readyBalance: availableToWithdraw,
      totalEarnedReady: totalReady,
      pendingCommission: pendingPotentialCommission,
      pendingWithdrawalAmount: totalPendingWithdrawal,
      totalWithdrawn: completedWithdrawals._sum.amount || 0,
      minimumWithdrawal: config.minimumWithdrawalAmount,
    };
  }

  /**
   * Pengajuan penarikan dana komisi oleh sales
   * Aturan Mutlak:
   * 1. Penarikan hanya boleh 1 kali per bulan kalender.
   * 2. 1 kali penarikan WAJIB menghabiskan SEMUA saldo yang ada (All-or-Nothing).
   */
  static async requestWithdrawal(
    salesId: string,
    amount: number,
    bankInfo: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    }
  ) {
    // 1. Cek apakah ada penarikan yang masih berstatus PENDING
    const pendingWithdrawal = await prisma.withdrawal.findFirst({
      where: {
        salesId,
        status: WithdrawalStatus.PENDING,
      },
    });

    if (pendingWithdrawal) {
      throw new Error(
        'Anda masih memiliki pengajuan penarikan berstatus PENDING. Harap menunggu hingga Admin memproses transfer manual.'
      );
    }

    // 2. Cek frekuensi: Hanya boleh melakukan penarikan 1 bulan sekali
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const existingThisMonth = await prisma.withdrawal.findFirst({
      where: {
        salesId,
        createdAt: {
          gte: startOfMonth,
        },
        status: {
          not: WithdrawalStatus.REJECTED,
        },
      },
    });

    if (existingThisMonth) {
      throw new Error(
        'Penarikan komisi hanya dapat dilakukan 1 kali per bulan. Anda sudah memiliki transaksi penarikan pada periode bulan ini.'
      );
    }

    // 3. Ambil ringkasan dompet komisi sales
    const wallet = await this.getSalesWalletSummary(salesId);

    if (wallet.readyBalance <= 0) {
      throw new Error('Tidak ada saldo komisi yang siap ditarik saat ini.');
    }

    if (wallet.readyBalance < config.minimumWithdrawalAmount) {
      throw new Error(
        `Batas minimum saldo untuk penarikan adalah Rp ${config.minimumWithdrawalAmount.toLocaleString('id-ID')}. Saldo Anda saat ini: Rp ${wallet.readyBalance.toLocaleString('id-ID')}.`
      );
    }

    // 4. Validasi All-or-Nothing: 1 kali penarikan WAJIB menghabiskan SEMUA saldo yang ada
    if (Math.round(amount) !== Math.round(wallet.readyBalance)) {
      throw new Error(
        `Penarikan komisi wajib mencairkan seluruh saldo yang tersedia (Rp ${Math.round(wallet.readyBalance).toLocaleString('id-ID')}). Penarikan sebagian tidak diperkenankan sesuai kebijakan kemitraan PT Pro Teknologi.`
      );
    }

    const user = await prisma.user.findUnique({ where: { id: salesId } });
    // PPh 21: 2.5% jika memiliki NPWP, 3% jika belum memiliki NPWP
    const taxRate = user?.npwp ? 2.5 : 3.0;
    const taxAmount = (amount * taxRate) / 100;
    const netAmount = amount - taxAmount;

    const withdrawal = await prisma.withdrawal.create({
      data: {
        salesId,
        amount,
        taxAmount,
        netAmount,
        bankName: bankInfo.bankName,
        accountNumber: bankInfo.accountNumber,
        accountHolder: bankInfo.accountHolder,
        status: WithdrawalStatus.PENDING,
      },
    });

    return withdrawal;
  }
}
