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

    // Sales Net 20% flat (net tidak ada peringkat)
    const percentage = 20.0;
    const amount = (invoice.amount * percentage) / 100;

    // Organisasi 10% net (hanya jika sales berasal dari organisasi tersebut)
    let orgId: string | null = null;
    let orgPercentage = 0.0;
    let orgAmount = 0.0;

    if (sales.organizationId) {
      const orgUser = await prisma.user.findUnique({
        where: { id: sales.organizationId },
      });
      if (orgUser && orgUser.role === 'ORGANISASI') {
        orgId = orgUser.id;
        orgPercentage = 10.0;
        orgAmount = (invoice.amount * orgPercentage) / 100;
      }
    }

    const commission = await prisma.commission.create({
      data: {
        salesId: sales.id,
        orgId,
        invoiceId: invoice.id,
        invoiceAmount: invoice.amount,
        percentage,
        amount,
        orgPercentage,
        orgAmount,
        status: CommissionStatus.READY,
        orgStatus: orgId ? 'READY' : 'NONE',
      },
    });

    return commission;
  }

  /**
   * Mengambil ringkasan saldo dompet komisi sales atau organisasi
   */
  static async getSalesWalletSummary(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User tidak ditemukan.');
    }

    // Role ORGANISASI: Menarik hak bagi hasil 10% dari sales-sales binaannya
    if (user.role === 'ORGANISASI') {
      const readyOrgCommissions = await prisma.commission.aggregate({
        where: {
          orgId: userId,
          orgStatus: 'READY',
        },
        _sum: {
          orgAmount: true,
        },
      });

      const pendingWithdrawals = await prisma.withdrawal.aggregate({
        where: {
          salesId: userId,
          status: WithdrawalStatus.PENDING,
        },
        _sum: {
          amount: true,
        },
      });

      const completedWithdrawals = await prisma.withdrawal.aggregate({
        where: {
          salesId: userId,
          status: WithdrawalStatus.COMPLETED,
        },
        _sum: {
          amount: true,
        },
      });

      // Potensi komisi organisasi dari outlet binaan sales yang belum bayar
      const salesMembers = await prisma.user.findMany({
        where: { organizationId: userId },
        select: { id: true },
      });
      const memberIds = salesMembers.map((m) => m.id);

      let pendingPotentialOrgCommission = 0;
      if (memberIds.length > 0) {
        const unpaidInvoices = await prisma.invoice.findMany({
          where: {
            outlet: {
              salesId: { in: memberIds },
            },
            status: {
              in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE],
            },
          },
        });
        pendingPotentialOrgCommission = unpaidInvoices.reduce(
          (acc, inv) => acc + (inv.amount * 10.0) / 100,
          0
        );
      }

      const totalReady = readyOrgCommissions._sum.orgAmount || 0;
      const totalPendingWithdrawal = pendingWithdrawals._sum.amount || 0;
      const availableToWithdraw = Math.max(0, totalReady - totalPendingWithdrawal);

      return {
        role: 'ORGANISASI',
        readyBalance: availableToWithdraw,
        totalEarnedReady: totalReady,
        orgReadyBalance: totalReady,
        pendingCommission: pendingPotentialOrgCommission,
        pendingOrgCommission: pendingPotentialOrgCommission,
        pendingWithdrawalAmount: totalPendingWithdrawal,
        totalWithdrawn: completedWithdrawals._sum.amount || 0,
        minimumWithdrawal: config.minimumWithdrawalAmount,
        salesCommissionRate: 0.0,
        orgCommissionRate: 10.0,
        organizationName: user.name,
      };
    }

    // Role SALES: Hak komisi 20% net dari outlet binaan sendiri
    // 1. Total Komisi Siap Ditarik (READY)
    const readyCommissions = await prisma.commission.aggregate({
      where: {
        salesId: userId,
        status: CommissionStatus.READY,
      },
      _sum: {
        amount: true,
      },
    });

    // 2. Total Komisi Sedang Diajukan Penarikan (PENDING withdrawal)
    const pendingWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        salesId: userId,
        status: WithdrawalStatus.PENDING,
      },
      _sum: {
        amount: true,
      },
    });

    // 3. Total Komisi Sudah Ditarik (COMPLETED withdrawal)
    const completedWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        salesId: userId,
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
          salesId: userId,
        },
        status: {
          in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE],
        },
      },
    });

    const pendingPotentialCommission = unpaidInvoices.reduce(
      (acc, inv) => acc + (inv.amount * 20.0) / 100,
      0
    );

    const totalReady = readyCommissions._sum.amount || 0;
    const totalPendingWithdrawal = pendingWithdrawals._sum.amount || 0;
    const availableToWithdraw = Math.max(0, totalReady - totalPendingWithdrawal);

    return {
      role: 'SALES',
      readyBalance: availableToWithdraw,
      totalEarnedReady: totalReady,
      orgReadyBalance: 0,
      pendingCommission: pendingPotentialCommission,
      pendingOrgCommission: 0,
      pendingWithdrawalAmount: totalPendingWithdrawal,
      totalWithdrawn: completedWithdrawals._sum.amount || 0,
      minimumWithdrawal: config.minimumWithdrawalAmount,
      salesCommissionRate: 20.0,
      orgCommissionRate: user.organizationId ? 10.0 : 0.0,
      organizationName: user.organizationName ?? null,
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
