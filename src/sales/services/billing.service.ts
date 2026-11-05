import prisma from '../config/prisma';
import { InvoiceStatus, LicenseStatus } from '../constants/enums';
import { CommissionService } from './commission.service';
import { config } from '../config/env';
import { CloudPosIntegrationService } from './cloudPosIntegration';

export class BillingService {
  /**
   * Mengupdate status invoice menjadi PAID dan otomatis mentrigger pembuatan komisi sales
   */
  static async verifyAndMarkInvoiceAsPaid(
    invoiceId: string,
    notes?: string
  ) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        outlet: {
          include: {
            license: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new Error('Invoice tidak ditemukan.');
    }

    // Update status invoice
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        paymentNotes: notes || 'Pembayaran diverifikasi oleh Admin.',
      },
    });

    // Jika lisensi outlet sebelumnya disuspend karena overdue, aktifkan kembali
    if (invoice.outlet.license && invoice.outlet.license.status === LicenseStatus.SUSPENDED) {
      // Pastikan tidak ada invoice lain yang masih overdue
      const remainingOverdue = await prisma.invoice.count({
        where: {
          outletId: invoice.outletId,
          status: InvoiceStatus.OVERDUE,
          id: { not: invoiceId },
        },
      });

      if (remainingOverdue === 0) {
        await prisma.license.update({
          where: { id: invoice.outlet.license.id },
          data: {
            status: LicenseStatus.ACTIVE,
            suspendedReason: null,
          },
        });

        // Sinkronkan aktivasi lisensi ke Cloud POS
        CloudPosIntegrationService.syncLicenseToCloudPos(
          invoice.outlet.license.licenseKey,
          'ACTIVE'
        ).catch((err) => console.warn('[CloudPosSync Warning]', err));
      }
    }

    // Trigger kalkulasi komisi otomatis untuk sales
    const commission = await CommissionService.processInvoiceCommission(invoice.id);

    return { invoice: updatedInvoice, commission };
  }

  /**
   * Cron Job: Cek status invoice yang melewati tanggal jatuh tempo + toleransi (grace period)
   * Mengubah status menjadi OVERDUE dan otomatis suspend lisensi
   */
  static async checkAndProcessOverdueInvoices(): Promise<number> {
    const now = new Date();
    // Batas toleransi hari (misal 3 hari setelah dueDate)
    const gracePeriodMs = config.invoiceGracePeriodDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(now.getTime() - gracePeriodMs);

    // Cari invoice UNPAID yang dueDate-nya sudah melewati batas toleransi
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.UNPAID,
        dueDate: {
          lt: cutoffDate,
        },
      },
      include: {
        outlet: {
          include: {
            license: true,
          },
        },
      },
    });

    for (const inv of overdueInvoices) {
      // Ubah status invoice ke OVERDUE
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          status: InvoiceStatus.OVERDUE,
        },
      });

      // Suspensi lisensi outlet jika lisensi aktif
      if (inv.outlet.license && inv.outlet.license.status === LicenseStatus.ACTIVE) {
        await prisma.license.update({
          where: { id: inv.outlet.license.id },
          data: {
            status: LicenseStatus.SUSPENDED,
            suspendedReason: `Tagihan periode ${inv.billingPeriod} menunggak melewati batas toleransi.`,
          },
        });

        // Sinkronkan suspensi kill-switch ke Cloud POS
        CloudPosIntegrationService.syncLicenseToCloudPos(
          inv.outlet.license.licenseKey,
          'SUSPENDED',
          `Tagihan periode ${inv.billingPeriod} menunggak melewati batas toleransi.`
        ).catch((err) => console.warn('[CloudPosSync Warning]', err));
      }
    }

    return overdueInvoices.length;
  }

  /**
   * Helper format template teks pesan WhatsApp reminder tagihan
   */
  static generateWhatsAppReminderMessage(outlet: {
    name: string;
    ownerName: string;
    phone: string;
    invoiceNumber: string;
    amount: number;
    billingPeriod: string;
    dueDate: Date;
  }): string {
    const formattedAmount = `Rp ${outlet.amount.toLocaleString('id-ID')}`;
    const formattedDueDate = outlet.dueDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return (
      `Halo Bapak/Ibu ${outlet.ownerName} (${outlet.name}),\n\n` +
      `Kami dari Tim Protek menginformasikan tagihan langganan sistem POS Protek untuk periode ${outlet.billingPeriod}.\n\n` +
      `📄 No Invoice: ${outlet.invoiceNumber}\n` +
      `💰 Total: ${formattedAmount}\n` +
      `📅 Jatuh Tempo: ${formattedDueDate}\n\n` +
      `Silakan melakukan transfer ke:\n` +
      `Bank: BCA\n` +
      `No Rek: 8830192831\n` +
      `A/N: PT PRO TEKNOLOGI INDONESIA\n\n` +
      `Mohon kirimkan bukti transfer agar lisensi sistem tetap aktif normal. Terima kasih!`
    );
  }
}
