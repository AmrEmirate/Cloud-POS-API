import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { LeadService } from '../services/lead.service';
import { sendSuccess, sendError } from '../utils/response';
import prisma from '../config/prisma';
import { LeadStatus } from '../constants/enums';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';

export class LeadController {
  /**
   * 1. Cek & Kunci Prospek (Lead Protection Check)
   * GET /api/leads/check?phone=...
   */
  static async checkAvailability(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { phone } = req.query;
      if (!phone || typeof phone !== 'string') {
        return sendError(res, 'Nomor telepon/WhatsApp wajib disertakan.', 400);
      }

      const currentSalesId = req.user?.userId;
      const result = await LeadService.checkLeadAvailability(phone, currentSalesId);

      return sendSuccess(res, result.message, result);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * 2. Form Check-in Kunjungan Baru
   * POST /api/leads/check-in
   */
  static async checkIn(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const { storeName, ownerName, phone, address, latitude, longitude, notes, photoUrl } = req.body;

      if (!storeName || !ownerName || !phone || !address) {
        return sendError(res, 'Nama toko, nama pemilik, nomor WA, dan alamat wajib diisi.', 400);
      }

      const result = await LeadService.registerOrCheckinLead({
        salesId,
        storeName,
        ownerName,
        phone,
        address,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        notes,
        photoUrl,
      });

      return sendSuccess(res, 'Check-in kunjungan dan proteksi prospek berhasil dicatat.', result, 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal melakukan check-in kunjungan.', 400);
    }
  }

  /**
   * 3. Pipeline Prospek Sales Saya
   * GET /api/leads
   */
  static async getMyLeads(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const { status, search } = req.query;

      const whereClause: any = { salesId };

      if (status && typeof status === 'string') {
        whereClause.status = status as LeadStatus;
      }

      if (search && typeof search === 'string') {
        const cleanSearch = sanitizePhoneNumber(search);
        whereClause.OR = [
          { storeName: { contains: search, mode: 'insensitive' } },
          { ownerName: { contains: search, mode: 'insensitive' } },
          ...(cleanSearch ? [{ phone: { contains: cleanSearch } }] : []),
        ];
      }

      const leads = await prisma.lead.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        include: {
          visits: {
            orderBy: { visitDate: 'desc' },
            take: 1,
          },
          outlet: {
            select: {
              id: true,
              name: true,
              license: {
                select: {
                  status: true,
                  licenseKey: true,
                },
              },
            },
          },
        },
      });

      return sendSuccess(res, 'Daftar prospek berhasil diambil.', leads);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Detail Prospek & Histori Kunjungan
   * GET /api/leads/:id
   */
  static async getLeadDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const salesId = req.user!.userId;
      const userRole = req.user!.role;

      const lead = await prisma.lead.findUnique({
        where: { id },
        include: {
          sales: {
            select: { id: true, name: true, phone: true },
          },
          visits: {
            orderBy: { visitDate: 'desc' },
          },
          outlet: {
            include: {
              license: true,
              invoices: {
                orderBy: { dueDate: 'desc' },
              },
            },
          },
          disputes: true,
        },
      });

      if (!lead) {
        return sendError(res, 'Data prospek tidak ditemukan.', 404);
      }

      if (userRole !== 'ADMIN' && lead.salesId !== salesId) {
        return sendError(res, 'Anda tidak memiliki akses ke prospek ini.', 403);
      }

      return sendSuccess(res, 'Detail prospek berhasil diambil.', lead);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Status Pipeline (NEW -> DEMO -> DEAL -> LOST)
   * PATCH /api/leads/:id/status
   */
  static async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const salesId = req.user!.userId;
      const { status, notes } = req.body;

      if (!status || !Object.values(LeadStatus).includes(status)) {
        return sendError(res, 'Status tidak valid. Pilihan: NEW, DEMO, DEAL, LOST.', 400);
      }

      const updatedLead = await LeadService.updatePipelineStatus(id, salesId, status, notes);

      return sendSuccess(res, `Status prospek berhasil diperbarui menjadi ${status}.`, updatedLead);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal memperbarui status prospek.', 400);
    }
  }

  /**
   * Tambah Log Kunjungan Tambahan ke Prospek
   * POST /api/leads/:id/visits
   */
  static async addVisitLog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const salesId = req.user!.userId;
      const { notes, photoUrl, statusAtVisit } = req.body;

      if (!notes) {
        return sendError(res, 'Catatan kunjungan wajib diisi.', 400);
      }

      const lead = await prisma.lead.findUnique({ where: { id } });
      if (!lead) {
        return sendError(res, 'Prospek tidak ditemukan.', 404);
      }

      if (lead.salesId !== salesId && req.user!.role !== 'ADMIN') {
        return sendError(res, 'Anda tidak memiliki akses ke prospek ini.', 403);
      }

      const visit = await prisma.visitLog.create({
        data: {
          leadId: id,
          salesId,
          notes,
          photoUrl,
          statusAtVisit: statusAtVisit || lead.status,
        },
      });

      return sendSuccess(res, 'Catatan kunjungan berhasil ditambahkan.', visit, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ajukan Banding / Sengketa Prospek (Dispute Claim)
   * POST /api/leads/:id/dispute
   */
  static async fileDispute(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const claimantSalesId = req.user!.userId;
      const { reason, proofUrl } = req.body;

      if (!reason) {
        return sendError(res, 'Alasan sengketa / klaim wajib diisi.', 400);
      }

      const lead = await prisma.lead.findUnique({ where: { id } });
      if (!lead) {
        return sendError(res, 'Prospek tidak ditemukan.', 404);
      }

      const dispute = await prisma.disputeClaim.create({
        data: {
          leadId: id,
          claimantSalesId,
          reason,
          proofUrl,
        },
      });

      return sendSuccess(res, 'Permohonan sengketa berhasil diajukan dan akan ditinjau Admin.', dispute, 201);
    } catch (error) {
      next(error);
    }
  }
}
