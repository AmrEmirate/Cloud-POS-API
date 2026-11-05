import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import { LeadStatus, LicenseStatus } from '../constants/enums';
import { sendSuccess, sendError } from '../utils/response';
import { StitchService } from '../services/stitch.service';
import { CloudPosIntegrationService } from '../services/cloudPosIntegration';
import { TenantFeGeneratorService } from '../services/feGenerator.service';
import { CloudflareDnsService } from '../services/cloudflareDns.service';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';

export class UiDesignController {
  /**
   * 1. Pengajuan UI Request oleh Sales untuk Calon Tenant UMKM
   * Memicu otomatis Google Stitch AI lewat MCP
   */
  static async requestUiDesign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const { leadId, storeName, category, primaryColor, styleNotes, referenceImageUrl } = req.body;

      if (!storeName || !storeName.trim()) {
        return sendError(res, 'Nama toko / tenant wajib diisi.', 400);
      }

      let targetLead = null;
      if (leadId) {
        targetLead = await (prisma as any).lead.findUnique({
          where: { id: leadId },
        });
      }

      const cleanStoreName = storeName.trim();
      const finalCategory = category || 'F&B (Kafe / Restoran)';
      const finalPrimaryColor = primaryColor || '#ea580c';

      // 1. Catat status awal di database
      const designRequest = await (prisma as any).uiDesignRequest.create({
        data: {
          leadId: leadId || null,
          salesId,
          storeName: cleanStoreName,
          category: finalCategory,
          primaryColor: finalPrimaryColor,
          referenceImageUrl: referenceImageUrl || null,
          styleNotes: styleNotes || null,
          status: 'GENERATING',
        },
      });

      // 2. Eksekusi Google Stitch MCP secara asynchronous / sinkron
      try {
        const stitchResult = await StitchService.createTenantUiMockup({
          storeName: cleanStoreName,
          category: finalCategory,
          primaryColor: finalPrimaryColor,
          styleNotes,
          referenceImageUrl,
        });

        const updatedRequest = await (prisma as any).uiDesignRequest.update({
          where: { id: designRequest.id },
          data: {
            stitchProjectId: stitchResult.projectId,
            stitchScreenId: stitchResult.screenId || null,
            previewUrl: stitchResult.previewUrl || null,
            themeConfig: stitchResult.themeConfig || {},
            status: 'READY_REVIEW',
          },
        });

        return sendSuccess(
          res,
          `UI Mockup untuk "${cleanStoreName}" berhasil di-generate via Google Stitch AI!`,
          updatedRequest,
          201
        );
      } catch (stitchError: any) {
        console.error('[Stitch MCP Generation Error]', stitchError);

        // Jika Stitch timeout atau error, simpan request dengan status REQUESTED
        const fallbackRequest = await (prisma as any).uiDesignRequest.update({
          where: { id: designRequest.id },
          data: {
            status: 'REQUESTED',
            styleNotes: `${styleNotes ? styleNotes + ' | ' : ''}Catatan: Background AI generator antre (${stitchError.message})`,
          },
        });

        return sendSuccess(
          res,
          `UI Request untuk "${cleanStoreName}" tersimpan. Generasi AI sedang diproses antrian.`,
          fallbackRequest,
          202
        );
      }
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal memproses request UI.', 500);
    }
  }

  /**
   * 2. Ambil Riwayat Request UI berdasarkan Lead
   */
  static async getUiDesignsByLead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { leadId } = req.params;
      const requests = await (prisma as any).uiDesignRequest.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });
      return sendSuccess(res, 'Daftar request UI berhasil diambil.', requests);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal mengambil data request UI.', 500);
    }
  }

  /**
   * 3. Ambil Detail Request UI & Token Tema
   */
  static async getUiDesignDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const request = await (prisma as any).uiDesignRequest.findUnique({
        where: { id },
        include: {
          lead: true,
          sales: { select: { id: true, name: true, phone: true } },
        },
      });

      if (!request) {
        return sendError(res, 'Request UI tidak ditemukan.', 404);
      }

      return sendSuccess(res, 'Detail request UI berhasil diambil.', request);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal mengambil detail request UI.', 500);
    }
  }

  /**
   * 4. Kirim Revisi Desain ke Google Stitch AI
   */
  static async reviseUiDesign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { revisionNotes } = req.body;

      if (!revisionNotes || !revisionNotes.trim()) {
        return sendError(res, 'Catatan revisi wajib diisi.', 400);
      }

      const designRequest = await (prisma as any).uiDesignRequest.findUnique({
        where: { id },
      });

      if (!designRequest) {
        return sendError(res, 'Request UI tidak ditemukan.', 404);
      }

      if (!designRequest.stitchProjectId) {
        return sendError(res, 'Project Stitch belum terinisialisasi pada request ini.', 400);
      }

      const history = Array.isArray(designRequest.revisionHistory) ? designRequest.revisionHistory : [];
      const newHistoryItem = {
        revisionNotes: revisionNotes.trim(),
        requestedAt: new Date().toISOString(),
      };

      // Minta revisi ke Stitch MCP
      const revisionRes = await StitchService.reviseTenantUiMockup({
        projectId: designRequest.stitchProjectId,
        screenId: designRequest.stitchScreenId || '',
        revisionPrompt: revisionNotes.trim(),
      });

      const updated = await (prisma as any).uiDesignRequest.update({
        where: { id },
        data: {
          revisionNotes: revisionNotes.trim(),
          revisionHistory: [...history, newHistoryItem],
          stitchScreenId: revisionRes.screenId || designRequest.stitchScreenId,
          previewUrl: revisionRes.previewUrl || designRequest.previewUrl,
          themeConfig: revisionRes.themeConfig || designRequest.themeConfig,
          status: 'READY_REVIEW',
        },
      });

      return sendSuccess(res, 'Revisi desain berhasil diterapkan oleh Google Stitch AI.', updated);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal memproses revisi desain.', 500);
    }
  }

  /**
   * 5. Approval Final & Otomatisasi Provisioning ke Cloud POS API
   * (Antigravity Pipeline: Ekstraksi Desain -> Sambungkan ke Backend)
   */
  static async approveUiDesign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const currentSalesId = req.user!.userId;

      const designRequest = await (prisma as any).uiDesignRequest.findUnique({
        where: { id },
        include: { lead: true },
      });

      if (!designRequest) {
        return sendError(res, 'Request UI tidak ditemukan.', 404);
      }

      const storeName = designRequest.storeName;
      const ownerName = designRequest.lead?.ownerName || 'Pemilik Toko';
      const rawPhone = designRequest.lead?.phone || '6281200000000';
      const cleanPhone = sanitizePhoneNumber(rawPhone);
      const address = designRequest.lead?.address || 'Alamat Operasional Outlet';

      // Generate lisensi acak: PROPOS-XXXX-XXXX
      const randomKeyPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomKeyPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const generatedLicenseKey = `PROPOS-${randomKeyPart1}-${randomKeyPart2}`;

      // 1. Buat Outlet dan Lisensi di ProtekSales
      const outlet = await (prisma as any).outlet.create({
        data: {
          leadId: designRequest.leadId || undefined,
          salesId: designRequest.salesId || currentSalesId,
          name: storeName,
          ownerName,
          phone: cleanPhone,
          address,
          monthlyFee: 150000,
          license: {
            create: {
              licenseKey: generatedLicenseKey,
              status: LicenseStatus.ACTIVE,
            },
          },
        },
        include: { license: true },
      });

      // 2. Update status Lead menjadi DEAL
      if (designRequest.leadId) {
        await (prisma as any).lead.update({
          where: { id: designRequest.leadId },
          data: { status: LeadStatus.DEAL },
        });
      }

      // 3. Provisioning Tenant ke Cloud POS Engine dengan Theme Config Stitch
      console.log(`[AutoDeploy] Menginjeksi tema Stitch dan provisioning "${storeName}" ke Cloud POS...`);
      const cloudPosResult = await CloudPosIntegrationService.provisionTenantToCloudPos({
        name: storeName,
        ownerName,
        phone: cleanPhone,
        planCode: 'PAKET_150K',
        licenseKey: generatedLicenseKey,
        themeColor: designRequest.primaryColor || '#f97316',
        themeConfig: designRequest.themeConfig || null,
      });

      const deployedSlug =
        (cloudPosResult as any)?.data?.tenantSlug ||
        storeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      // 4. Otomatis Daftarkan Subdomain Online di Cloudflare (HTTPS SSL Aktif)
      const dnsResult = await CloudflareDnsService.createTenantSubdomain(deployedSlug);
      const onlinePosUrl = dnsResult.liveUrl;

      // 5. Generate Frontend Mandiri (Dedicated FE) & Sambungkan ke API Cloud POS
      let feBundle = null;
      try {
        let screenHtml = designRequest.htmlCode;
        if (!screenHtml && designRequest.stitchScreenId && designRequest.stitchProjectId) {
          screenHtml = await StitchService.fetchScreenCode(
            `projects/${designRequest.stitchProjectId}/screens/${designRequest.stitchScreenId}`
          ).catch(() => '');
        }

        feBundle = await TenantFeGeneratorService.generateTenantFrontend({
          tenantSlug: deployedSlug,
          storeName,
          licenseKey: generatedLicenseKey,
          themeColor: designRequest.primaryColor || '#f97316',
          themeConfig: designRequest.themeConfig,
          htmlCode: screenHtml,
        });
      } catch (feErr: any) {
        console.warn('[FE Generator Warning]', feErr.message);
      }

      // 6. Update status Request UI menjadi APPROVED & DEPLOYED
      const finalizedRequest = await (prisma as any).uiDesignRequest.update({
        where: { id },
        data: {
          status: 'DEPLOYED',
          outletId: outlet.id,
          deployedTenantSlug: deployedSlug,
        },
      });

      return sendSuccess(
        res,
        `Selamat! Desain UI "${storeName}" telah disetujui (APPROVED). Subdomain "${dnsResult.fullDomain}" telah dibuat dan online!`,
        {
          uiRequest: finalizedRequest,
          outlet,
          tenantSlug: deployedSlug,
          subdomain: dnsResult.fullDomain,
          posUrl: onlinePosUrl,
          licenseKey: generatedLicenseKey,
          feBundle,
        }
      );
    } catch (error: any) {
      console.error('[Approve UI Design Error]', error);
      return sendError(res, error.message || 'Gagal melakukan approval dan deployment UI.', 500);
    }
  }
}
