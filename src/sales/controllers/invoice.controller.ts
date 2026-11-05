import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import { InvoiceStatus } from '../constants/enums';
import { sendSuccess, sendError } from '../utils/response';
import { BillingService } from '../services/billing.service';

export class InvoiceController {
  /**
   * Mengambil daftar invoice (Filter by outlet, status, dll)
   * GET /api/invoices
   */
  static async getInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const userRole = req.user!.role;
      const { outletId, status } = req.query;

      const whereClause: any = {};

      if (userRole !== 'ADMIN') {
        whereClause.outlet = { salesId };
      }

      if (outletId && typeof outletId === 'string') {
        whereClause.outletId = outletId;
      }

      if (status && typeof status === 'string') {
        whereClause.status = status as InvoiceStatus;
      }

      const invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: {
          outlet: {
            include: {
              sales: { select: { id: true, name: true, phone: true } },
              license: { select: { status: true, licenseKey: true } },
            },
          },
          commission: true,
        },
        orderBy: { dueDate: 'desc' },
      });

      return sendSuccess(res, 'Daftar invoice berhasil diambil.', invoices);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Buat Invoice Baru Manual untuk Outlet
   * POST /api/invoices
   */
  static async createInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { outletId, amount, billingPeriod, dueDate } = req.body;

      if (!outletId || !amount || !billingPeriod || !dueDate) {
        return sendError(res, 'Outlet, nominal, periode tagihan, dan tanggal jatuh tempo wajib diisi.', 400);
      }

      const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) {
        return sendError(res, 'Outlet tidak ditemukan.', 404);
      }

      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

      const invoice = await prisma.invoice.create({
        data: {
          outletId,
          invoiceNumber,
          amount: parseFloat(amount),
          billingPeriod,
          dueDate: new Date(dueDate),
          status: InvoiceStatus.UNPAID,
        },
        include: {
          outlet: true,
        },
      });

      return sendSuccess(res, 'Invoice tagihan berhasil dibuat.', invoice, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload Bukti Transfer Tagihan dari Outlet
   * POST /api/invoices/:id/payment-proof
   */
  static async uploadPaymentProof(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { proofUrl, notes } = req.body;

      if (!proofUrl) {
        return sendError(res, 'URL / berkas bukti transfer wajib disertakan.', 400);
      }

      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return sendError(res, 'Invoice tidak ditemukan.', 404);
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          paymentProofUrl: proofUrl,
          paymentNotes: notes || invoice.paymentNotes,
        },
      });

      return sendSuccess(res, 'Bukti transfer berhasil diunggah, menunggu verifikasi Admin.', updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generator Teks & Link Pengingat WhatsApp Tagihan
   * GET /api/invoices/:id/reminder-link
   */
  static async getReminderWhatsAppLink(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          outlet: true,
        },
      });

      if (!invoice) {
        return sendError(res, 'Invoice tidak ditemukan.', 404);
      }

      const message = BillingService.generateWhatsAppReminderMessage({
        name: invoice.outlet.name,
        ownerName: invoice.outlet.ownerName,
        phone: invoice.outlet.phone,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        billingPeriod: invoice.billingPeriod,
        dueDate: invoice.dueDate,
      });

      const waLink = `https://wa.me/${invoice.outlet.phone}?text=${encodeURIComponent(message)}`;

      return sendSuccess(res, 'Link pengingat WhatsApp berhasil dibuat.', {
        message,
        waLink,
        phone: invoice.outlet.phone,
      });
    } catch (error) {
      next(error);
    }
  }
}
