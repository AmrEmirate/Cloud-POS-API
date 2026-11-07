import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { LeadService } from '../services/lead.service';
import { sendSuccess, sendError } from '../utils/response';
import prisma from '../config/prisma';
import { LeadStatus, LicenseStatus } from '../constants/enums';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';
import { basePrisma } from '../../config/database';
import { getPlanDetails } from '../../config/plans';
import { Role as BaseRole } from '@prisma/client';

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
      const {
        storeName,
        ownerName,
        phone,
        address,
        latitude,
        longitude,
        notes,
        photoUrl,
        salesType,
        outletCount,
        outcome,
        rejectionReason,
        followUpDate,
      } = req.body;

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
        salesType,
        outletCount: outletCount ? parseInt(outletCount, 10) : undefined,
        outcome,
        rejectionReason,
        followUpDate,
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
      const userRole = req.user!.role;
      const { status, search, scope } = req.query;

      // Jika scope === 'all' atau user role ADMIN, tampilkan seluruh prospek dan outlet yang terproteksi/approved di sistem
      const whereClause: any = userRole === 'ADMIN' || scope === 'all' ? {} : { salesId };

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
          sales: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          visits: {
            orderBy: { visitDate: 'desc' },
            take: 1,
          },
          outlet: {
            select: {
              id: true,
              name: true,
              monthlyFee: true,
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

  /**
   * 8. Antigravity Automated Provisioning dari Check-in Deal UMKM
   * POST /api/leads/provision-tenant
   */
  static async provisionTenantFromLead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const {
        leadId,
        storeName,
        ownerName,
        phone,
        address,
        category,
        subdomain: rawSlug,
        customDomain,
        planCode = 'PAKET_150K',
        username,
        password,
        themeColor = '#ea580c',
        themeConfig,
        outletCount = 1,
      } = req.body;

      if (!storeName || !storeName.trim()) {
        return sendError(res, 'Nama usaha / toko UMKM wajib diisi!', 400);
      }
      if (!username || !username.trim()) {
        return sendError(res, 'Username akun pemilik UMKM wajib diisi!', 400);
      }
      if (!password || password.length < 6) {
        return sendError(res, 'Password akun pemilik UMKM minimal 6 karakter!', 400);
      }

      const cleanPhone = sanitizePhoneNumber(phone || '081200000000');
      const cleanSlug = (rawSlug || storeName.toLowerCase().replace(/[^a-z0-9-]/g, '')).trim();

      // Cek apakah slug sudah ada di database tenant
      const existingSlug = await basePrisma.tenant.findUnique({ where: { slug: cleanSlug } });
      if (existingSlug) {
        return sendError(res, `Subdomain / Slug "${cleanSlug}" sudah dipakai tenant lain. Silakan pilih slug lain.`, 400);
      }

      // Cek apakah username sudah ada di database tenant
      const existingUser = await basePrisma.user.findFirst({ where: { username: username.trim() } });
      if (existingUser) {
        return sendError(res, `Username "${username}" sudah digunakan di Cloud POS. Silakan gunakan username lain.`, 400);
      }

      const planConfig = getPlanDetails(planCode);
      const licenseKey = `LIC-${cleanSlug.toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const passwordHash = await bcrypt.hash(password, 10);
      const pinHash = await bcrypt.hash('1234', 10);

      // 1. Buat Tenant, Outlet Utama, dan Owner di database tenant (dimsum_db / basePrisma)
      const tenantResult = await basePrisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: storeName.trim(),
            slug: cleanSlug,
            customDomain: customDomain ? customDomain.trim().toLowerCase() : `${cleanSlug}.vimtk.cloud`,
            plan: planConfig.code,
            pricePerOutlet: planConfig.price,
            maxOutlets: Number(outletCount) || 1,
            dailyTxLimitPerOutlet: planConfig.dailyTxLimit,
            licenseKey,
            status: 'ACTIVE',
            themeColor: themeColor || '#ea580c',
            themeConfig: themeConfig || {
              storeName: storeName.trim(),
              category: category || 'F&B Retail',
              primaryColor: themeColor || '#ea580c',
            },
          },
        });

        const outlet = await tx.outlet.create({
          data: {
            tenantId: tenant.id,
            code: 'CB-01',
            name: `${storeName.trim()} Cabang Utama`,
            city: 'Indonesia',
            address: address ? address.trim() : 'Alamat Operasional',
            phone: cleanPhone,
            plan: planConfig.code,
            dailyTxLimit: planConfig.dailyTxLimit || 200,
            targetDailySales: 5000000,
          },
        });

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            outletId: outlet.id,
            name: (ownerName || 'Pemilik Toko').trim(),
            username: username.trim(),
            passwordHash,
            pinHash,
            role: BaseRole.OWNER,
          },
        });

        return { tenant, outlet, owner };
      });

      // 2. Buat Outlet & Lisensi di ProtekSales (proteksales_db) ditautkan ke sales ini
      const protekOutlet = await prisma.outlet.create({
        data: {
          leadId: leadId || undefined,
          salesId,
          name: storeName.trim(),
          ownerName: (ownerName || 'Pemilik Toko').trim(),
          phone: cleanPhone,
          address: address ? address.trim() : 'Alamat Operasional',
          monthlyFee: planConfig.price,
          license: {
            create: {
              licenseKey,
              status: LicenseStatus.ACTIVE,
            },
          },
        },
        include: { license: true },
      });

      // 3. Terbitkan invoice perdana di ProtekSales
      const invDate = new Date();
      const invoiceNumber = `INV-${invDate.getFullYear()}${String(invDate.getMonth() + 1).padStart(2, '0')}-${protekOutlet.id.slice(0, 4).toUpperCase()}`;
      await prisma.invoice.create({
        data: {
          outletId: protekOutlet.id,
          invoiceNumber,
          amount: planConfig.price,
          billingPeriod: `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // 4. Update status lead menjadi DEAL jika leadId ada atau phone cocok
      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: LeadStatus.DEAL,
          },
        }).catch(() => {});
      } else {
        await prisma.lead.updateMany({
          where: { phone: cleanPhone, salesId },
          data: {
            status: LeadStatus.DEAL,
          },
        }).catch(() => {});
      }

      return sendSuccess(res, `Sistem Cloud POS untuk "${storeName}" berhasil dibuat otomatis oleh Antigravity!`, {
        tenant: {
          id: tenantResult.tenant.id,
          name: tenantResult.tenant.name,
          slug: tenantResult.tenant.slug,
          domain: tenantResult.tenant.customDomain,
          webUrl: `https://${tenantResult.tenant.slug}.vimtk.cloud`,
          licenseKey,
          plan: planConfig.name,
          monthlyFee: planConfig.price,
        },
        credentials: {
          username: username.trim(),
          password,
          loginUrl: `https://${tenantResult.tenant.slug}.vimtk.cloud`,
        },
        protekOutletId: protekOutlet.id,
      }, 201);
    } catch (error) {
      next(error);
    }
  }
}
