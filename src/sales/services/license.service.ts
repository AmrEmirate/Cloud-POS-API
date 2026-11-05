import prisma from '../config/prisma';
import { LicenseStatus, InvoiceStatus } from '../constants/enums';
import { CloudPosIntegrationService } from './cloudPosIntegration';

export interface HeartbeatResult {
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  canOperate: boolean;
  message: string;
  outlet?: {
    id: string;
    name: string;
    ownerName: string;
  };
  licenseKey: string;
  invoiceStatus?: string;
  overdueInvoice?: {
    invoiceNumber: string;
    amount: number;
    billingPeriod: string;
    dueDate: Date;
  };
  paymentInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
}

export class LicenseService {
  /**
   * Remote Kill-Switch Heartbeat Ping dari Aplikasi Kasir/POS Outlet
   */
  static async processHeartbeat(licenseKey: string, machineId?: string): Promise<HeartbeatResult> {
    const license = await prisma.license.findUnique({
      where: { licenseKey },
      include: {
        outlet: {
          include: {
            invoices: {
              where: {
                status: { in: [InvoiceStatus.OVERDUE, InvoiceStatus.UNPAID] },
              },
              orderBy: { dueDate: 'asc' },
            },
          },
        },
      },
    });

    if (!license) {
      return {
        status: 'EXPIRED',
        canOperate: false,
        message: 'Kunci lisensi tidak valid atau tidak terdaftar di sistem.',
        licenseKey,
      };
    }

    // Update last heartbeat dan machine id jika dikirim
    await prisma.license.update({
      where: { id: license.id },
      data: {
        lastHeartbeatAt: new Date(),
        ...(machineId && { machineId }),
      },
    });

    // 1. Cek jika saklar lisensi dimatikan secara manual oleh Admin
    if (license.status === LicenseStatus.SUSPENDED) {
      return {
        status: 'SUSPENDED',
        canOperate: false,
        message: license.suspendedReason || 'Lisensi dinonaktifkan oleh administrator.',
        outlet: {
          id: license.outlet.id,
          name: license.outlet.name,
          ownerName: license.outlet.ownerName,
        },
        licenseKey,
        paymentInfo: {
          bankName: 'BCA',
          accountNumber: '8830192831',
          accountHolder: 'PT PRO TEKNOLOGI INDONESIA',
        },
      };
    }

    // 2. Cek apakah ada invoice yang OVERDUE
    const overdueInvoice = license.outlet.invoices.find(
      (inv) => inv.status === InvoiceStatus.OVERDUE
    );

    if (overdueInvoice) {
      // Otomatis ubah status lisensi ke SUSPENDED karena tagihan overdue
      await prisma.license.update({
        where: { id: license.id },
        data: {
          status: LicenseStatus.SUSPENDED,
          suspendedReason: `Tagihan periode ${overdueInvoice.billingPeriod} telah melewati batas jatuh tempo.`,
        },
      });

      return {
        status: 'SUSPENDED',
        canOperate: false,
        message: `Akses transaksi dikunci. Tagihan periode ${overdueInvoice.billingPeriod} belum lunas dan melewati batas toleransi jatuh tempo.`,
        outlet: {
          id: license.outlet.id,
          name: license.outlet.name,
          ownerName: license.outlet.ownerName,
        },
        licenseKey,
        invoiceStatus: InvoiceStatus.OVERDUE,
        overdueInvoice: {
          invoiceNumber: overdueInvoice.invoiceNumber,
          amount: overdueInvoice.amount,
          billingPeriod: overdueInvoice.billingPeriod,
          dueDate: overdueInvoice.dueDate,
        },
        paymentInfo: {
          bankName: 'BCA',
          accountNumber: '8830192831',
          accountHolder: 'PT PRO TEKNOLOGI INDONESIA',
        },
      };
    }

    // 3. Status lisensi normal dan invoice aktif
    return {
      status: 'ACTIVE',
      canOperate: true,
      message: 'Aplikasi operasional normal.',
      outlet: {
        id: license.outlet.id,
        name: license.outlet.name,
        ownerName: license.outlet.ownerName,
      },
      licenseKey,
    };
  }

  /**
   * Saklar Remote Kill-Switch oleh Admin (Manual Toggle)
   */
  static async toggleLicenseStatus(
    licenseId: string,
    targetStatus: LicenseStatus,
    reason?: string
  ) {
    const updatedLicense = await prisma.license.update({
      where: { id: licenseId },
      data: {
        status: targetStatus,
        suspendedReason: targetStatus === LicenseStatus.SUSPENDED ? (reason || 'Dinonaktifkan oleh Admin.') : null,
      },
      include: {
        outlet: true,
      },
    });

    // Sinkronkan status saklar langsung ke Cloud POS Engine
    CloudPosIntegrationService.syncLicenseToCloudPos(
      updatedLicense.licenseKey,
      targetStatus,
      updatedLicense.suspendedReason || undefined
    ).catch((err) => console.warn('[CloudPosSync Warning]', err));

    return updatedLicense;
  }
}
