import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import { Role, LicenseStatus, WithdrawalStatus, DisputeStatus, CommissionStatus } from '../constants/enums';
import { sendSuccess, sendError } from '../utils/response';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';
import { BillingService } from '../services/billing.service';
import { LicenseService } from '../services/license.service';
import { CloudPosIntegrationService } from '../services/cloudPosIntegration';
import { basePrisma } from '../../config/database';
import { getPlanDetails } from '../../config/plans';
import { Role as BaseRole } from '@prisma/client';

export class AdminController {
  /**
   * 1. Dashboard Metrics Summary
   * GET /api/admin/metrics
   */
  static async getDashboardMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const totalSales = await prisma.user.count({ where: { role: 'SALES' } });
      const totalLeads = await prisma.lead.count();
      const totalOutlets = await prisma.outlet.count();
      const activeLicenses = await prisma.license.count({ where: { status: LicenseStatus.ACTIVE } });
      const suspendedLicenses = await prisma.license.count({ where: { status: LicenseStatus.SUSPENDED } });

      const pendingWithdrawals = await prisma.withdrawal.aggregate({
        where: { status: WithdrawalStatus.PENDING },
        _count: true,
        _sum: { amount: true },
      });

      const unpaidInvoices = await prisma.invoice.aggregate({
        where: { status: 'UNPAID' },
        _count: true,
        _sum: { amount: true },
      });

      const overdueInvoices = await prisma.invoice.aggregate({
        where: { status: 'OVERDUE' },
        _count: true,
        _sum: { amount: true },
      });

      return sendSuccess(res, 'Metrik dashboard admin berhasil diambil.', {
        totalSales,
        totalLeads,
        totalOutlets,
        licenses: {
          active: activeLicenses,
          suspended: suspendedLicenses,
        },
        withdrawals: {
          pendingCount: pendingWithdrawals._count || 0,
          pendingAmount: pendingWithdrawals._sum.amount || 0,
        },
        invoices: {
          unpaidCount: unpaidInvoices._count || 0,
          unpaidAmount: unpaidInvoices._sum.amount || 0,
          overdueCount: overdueInvoices._count || 0,
          overdueAmount: overdueInvoices._sum.amount || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 2. Peta Sebaran & Prospek Seluruh Sales
   * GET /api/admin/leads/map
   */
  static async getAllLeadsForMap(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const leads = await prisma.lead.findMany({
        include: {
          sales: { select: { id: true, name: true, phone: true } },
          visits: { orderBy: { visitDate: 'desc' }, take: 1 },
        },
      });

      return sendSuccess(res, 'Data prospek untuk peta sebaran berhasil diambil.', leads);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 3. Verifikasi Bukti Transfer Invoice Outlet (Approval Finansial)
   * POST /api/admin/invoices/:id/verify
   */
  static async verifyInvoicePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { notes } = req.body;

      const result = await BillingService.verifyAndMarkInvoiceAsPaid(id, notes);

      return sendSuccess(
        res,
        'Pembayaran tagihan berhasil diverifikasi dan komisi sales otomatis diterbitkan (Status: Ready).',
        result
      );
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal memverifikasi pembayaran tagihan.', 400);
    }
  }

  /**
   * 4. Approval Permintaan Pencairan Komisi Sales (Payout Approval)
   * POST /api/admin/withdrawals/:id/process
   */
  static async processWithdrawal(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { status, adminNotes, proofUrl } = req.body;

      if (!status || ![WithdrawalStatus.APPROVED, WithdrawalStatus.REJECTED, WithdrawalStatus.COMPLETED].includes(status)) {
        return sendError(res, 'Status proses harus salah satu dari: APPROVED, REJECTED, COMPLETED.', 400);
      }

      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
      });

      if (!withdrawal) {
        return sendError(res, 'Data penarikan dana tidak ditemukan.', 404);
      }

      const finalStatus =
        status === WithdrawalStatus.APPROVED ? WithdrawalStatus.COMPLETED : status;

      const updated = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: finalStatus,
          adminNotes: adminNotes || withdrawal.adminNotes,
          proofUrl: proofUrl || withdrawal.proofUrl,
          processedAt: new Date(),
        },
      });

      // Jika completed atau approved, update status komisi sales terkait menjadi WITHDRAWN
      if (finalStatus === WithdrawalStatus.COMPLETED) {
        // Ambil komisi-komisi READY milik sales tersebut hingga mencukupi amount withdrawal
        const readyCommissions = await prisma.commission.findMany({
          where: { salesId: withdrawal.salesId, status: CommissionStatus.READY },
          orderBy: { createdAt: 'asc' },
        });

        let remainingToDeduct = withdrawal.amount;
        for (const comm of readyCommissions) {
          if (remainingToDeduct <= 0) break;
          await prisma.commission.update({
            where: { id: comm.id },
            data: { status: CommissionStatus.WITHDRAWN },
          });
          remainingToDeduct -= comm.amount;
        }
      }

      return sendSuccess(res, `Pengajuan penarikan dana berhasil diperbarui menjadi ${finalStatus}.`, updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 5. Saklar Lisensi Outlet Remote (Kill-Switch Toggle)
   * POST /api/admin/licenses/:id/toggle
   */
  static async toggleLicenseSwitch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { status, reason } = req.body;

      if (!status || ![LicenseStatus.ACTIVE, LicenseStatus.SUSPENDED, LicenseStatus.EXPIRED].includes(status)) {
        return sendError(res, 'Status lisensi harus salah satu dari: ACTIVE, SUSPENDED, EXPIRED.', 400);
      }

      const updatedLicense = await LicenseService.toggleLicenseStatus(id, status, reason);

      return sendSuccess(
        res,
        `Status lisensi outlet berhasil diubah menjadi ${status}.`,
        updatedLicense
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * 6. Penyelesaian Sengketa Klaim Outlet Antarsales (Dispute Resolution)
   * GET /api/admin/disputes
   */
  static async getDisputes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const disputes = await prisma.disputeClaim.findMany({
        include: {
          lead: {
            include: {
              sales: { select: { id: true, name: true, phone: true } },
            },
          },
          claimantSales: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return sendSuccess(res, 'Daftar sengketa klaim prospek berhasil diambil.', disputes);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/disputes/:id/resolve
   */
  static async resolveDispute(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { action, resolutionNotes } = req.body;

      const isApprove = action === 'APPROVE_CLAIMANT' || action === 'TRANSFER';
      const isReject = action === 'REJECT_CLAIMANT' || action === 'REJECT';

      if (!action || (!isApprove && !isReject)) {
        return sendError(
          res,
          'Aksi penyelesaian harus salah satu dari: APPROVE_CLAIMANT / TRANSFER (alihkan hak ke pelapor) atau REJECT_CLAIMANT / REJECT (pertahankan pemilik saat ini).',
          400
        );
      }

      const dispute = await prisma.disputeClaim.findUnique({
        where: { id },
        include: { lead: true },
      });

      if (!dispute) {
        return sendError(res, 'Data sengketa tidak ditemukan.', 404);
      }

      if (isApprove) {
        // Alihkan kepemilikan lead ke claimantSalesId
        await prisma.lead.update({
          where: { id: dispute.leadId },
          data: {
            salesId: dispute.claimantSalesId,
            // Berikan proteksi 30 hari lagi untuk sales baru
            protectedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const updatedDispute = await prisma.disputeClaim.update({
          where: { id },
          data: {
            status: DisputeStatus.APPROVED,
            resolutionNotes: resolutionNotes || 'Klaim disetujui, hak prospek dialihkan ke sales pelapor.',
            resolvedAt: new Date(),
          },
        });

        return sendSuccess(res, 'Sengketa diselesaikan: Hak prospek berhasil dialihkan.', updatedDispute);
      } else {
        const updatedDispute = await prisma.disputeClaim.update({
          where: { id },
          data: {
            status: DisputeStatus.REJECTED,
            resolutionNotes: resolutionNotes || 'Klaim ditolak, hak prospek tetap pada sales awal.',
            resolvedAt: new Date(),
          },
        });

        return sendSuccess(res, 'Sengketa diselesaikan: Klaim ditolak.', updatedDispute);
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * 7. Kelola Seluruh Data Sales
   * GET /api/admin/sales
   */
  static async getAllSales(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesList = await prisma.user.findMany({
        where: { role: 'SALES' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          commissionRate: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
          _count: {
            select: {
              leads: true,
              outlets: true,
            },
          },
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      });

      return sendSuccess(res, 'Daftar sales berhasil diambil.', salesList);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 8. Cek Status Koneksi Cloud POS Backend Engine
   * GET /api/admin/cloudpos/health
   */
  static async getCloudPosHealth(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const health = await CloudPosIntegrationService.checkCloudPosHealth();
      return sendSuccess(res, 'Status koneksi Cloud POS berhasil diperiksa.', health);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 9. Mengambil Seluruh Tenant dari Cloud POS BE & Cross-check dengan Outlet ProtekSales
   * GET /api/admin/cloudpos/tenants
   */
  static async getCloudPosTenants(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const cloudTenants = await CloudPosIntegrationService.getAllTenants();
      const protekOutlets = await prisma.outlet.findMany({
        include: {
          license: true,
          sales: { select: { id: true, name: true, phone: true } },
        },
      });

      // Mapping status integrasi
      const mappedTenants = cloudTenants.map((t: any) => {
        const matchingOutlet = protekOutlets.find(
          (o) => (t.licenseKey && o.license?.licenseKey === t.licenseKey) ||
                 (t.mainOutlet?.phone && o.phone === t.mainOutlet.phone) ||
                 (t.name && o.name?.toLowerCase().includes(t.name.toLowerCase()))
        );

        return {
          ...t,
          isLinkedToProtek: !!matchingOutlet,
          licenseId: matchingOutlet?.license?.id || t.licenseKey,
          protekOutlet: matchingOutlet
            ? {
                id: matchingOutlet.id,
                name: matchingOutlet.name,
                salesName: matchingOutlet.sales?.name,
                licenseId: matchingOutlet.license?.id,
                licenseKey: matchingOutlet.license?.licenseKey,
                licenseStatus: matchingOutlet.license?.status,
              }
            : null,
        };
      });

      return sendSuccess(res, 'Daftar tenant Cloud POS berhasil diambil.', {
        total: mappedTenants.length,
        linkedCount: mappedTenants.filter((t: any) => t.isLinkedToProtek).length,
        unlinkedCount: mappedTenants.filter((t: any) => !t.isLinkedToProtek).length,
        tenants: mappedTenants,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 10. Tambah Tenant Bisnis Baru secara Real ke Database Cloud POS & ProtekSales
   * POST /api/admin/cloudpos/tenants
   */
  static async createCloudPosTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const adminUserId = req.user!.userId;
      const {
        name,
        slug: rawSlug,
        customDomain,
        plan = 'GROWTH',
        maxOutlets = 5,
        pricePerOutlet,
        ownerName = 'Pemilik Bisnis',
        ownerEmail,
        ownerPhone = '081200000000',
        ownerUsername,
        ownerPassword = 'Password123!',
        city = 'Bandung',
        address = 'Alamat Bisnis',
      } = req.body;

      if (!name || !name.trim()) {
        return sendError(res, 'Nama bisnis wajib diisi!', 400);
      }

      const cleanSlug = (rawSlug || name.toLowerCase().replace(/[^a-z0-9-]/g, '')).trim();
      const planConfig = getPlanDetails(plan);
      const feePerOutlet = pricePerOutlet ? Number(pricePerOutlet) : planConfig.price;
      const cleanPhone = ownerPhone.replace(/[^0-9]/g, '');
      const username = ownerUsername || `owner_${cleanSlug.slice(0, 8)}_${cleanPhone.slice(-4)}`;
      const licenseKey = `LIC-${cleanSlug.toUpperCase()}-PRO-2026`;

      // Cek apakah slug sudah ada di basePrisma
      const existing = await basePrisma.tenant.findUnique({ where: { slug: cleanSlug } });
      if (existing) {
        return sendError(res, `Subdomain / Slug "${cleanSlug}" sudah digunakan!`, 400);
      }

      const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
      const ownerPinHash = await bcrypt.hash('1234', 10);

      // 1. Simpan ke Database Tenant (dimsum_db / basePrisma)
      const createdTenant = await basePrisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: name.trim(),
            slug: cleanSlug,
            customDomain: customDomain ? customDomain.trim().toLowerCase() : null,
            plan: planConfig.code,
            pricePerOutlet: feePerOutlet,
            maxOutlets: Number(maxOutlets) || 5,
            dailyTxLimitPerOutlet: planConfig.dailyTxLimit,
            licenseKey,
            status: 'ACTIVE',
            themeColor: '#ea580c',
            themeConfig: {
              storeName: name.trim(),
              category: 'F&B Retail',
              primaryColor: '#ea580c',
            },
          },
        });

        const outlet = await tx.outlet.create({
          data: {
            tenantId: tenant.id,
            code: 'CB-01',
            name: `${name.trim()} Cabang Utama`,
            city: city.trim(),
            address: address.trim(),
            phone: cleanPhone || '081200000000',
            plan: planConfig.code,
            dailyTxLimit: planConfig.dailyTxLimit || 200,
            targetDailySales: 5000000,
          },
        });

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            outletId: outlet.id,
            name: ownerName.trim(),
            username: username.trim(),
            passwordHash: ownerPasswordHash,
            pinHash: ownerPinHash,
            role: BaseRole.OWNER,
          },
        });

        return { tenant, outlet, owner };
      });

      // 2. Simpan ke Database ProtekSales (proteksales_db / prisma)
      const protekOutlet = await prisma.outlet.create({
        data: {
          salesId: adminUserId,
          name: createdTenant.tenant.name,
          ownerName: ownerName.trim(),
          phone: cleanPhone || '081200000000',
          address: `${address.trim()}, ${city.trim()}`,
          monthlyFee: feePerOutlet,
          license: {
            create: {
              licenseKey,
              status: LicenseStatus.ACTIVE,
            },
          },
        },
        include: { license: true },
      });

      // Buat invoice perdana di ProtekSales
      const invDate = new Date();
      const invoiceNumber = `INV-${invDate.getFullYear()}${String(invDate.getMonth() + 1).padStart(2, '0')}-${protekOutlet.id.slice(0, 4).toUpperCase()}`;
      await prisma.invoice.create({
        data: {
          outletId: protekOutlet.id,
          invoiceNumber,
          amount: feePerOutlet,
          billingPeriod: `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      return sendSuccess(res, `Bisnis "${createdTenant.tenant.name}" berhasil didaftarkan secara riil!`, {
        tenant: createdTenant.tenant,
        outlet: createdTenant.outlet,
        owner: {
          id: createdTenant.owner.id,
          name: createdTenant.owner.name,
          username: createdTenant.owner.username,
        },
        protekOutlet,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 11. Update Kuota, Paket & Domain Tenant secara Real di Database Cloud POS & ProtekSales
   * PUT /api/admin/cloudpos/tenants/:id
   */
  static async updateCloudPosTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const {
        name,
        customDomain,
        plan,
        maxOutlets,
        pricePerOutlet,
        status,
        ownerName,
        phone,
      } = req.body;

      const existingTenant = await basePrisma.tenant.findFirst({
        where: {
          OR: [{ id }, { slug: id }],
        },
      });

      if (!existingTenant) {
        return sendError(res, `Tenant "${id}" tidak ditemukan di database.`, 404);
      }

      const planConfig = plan ? getPlanDetails(plan) : null;

      // 1. Update Database Cloud POS (basePrisma)
      const updatedTenant = await basePrisma.tenant.update({
        where: { id: existingTenant.id },
        data: {
          ...(name && { name: name.trim() }),
          ...(customDomain !== undefined && {
            customDomain: customDomain && customDomain.trim() ? customDomain.trim().toLowerCase() : null,
          }),
          ...(planConfig && {
            plan: planConfig.code,
            pricePerOutlet: pricePerOutlet !== undefined ? Number(pricePerOutlet) : planConfig.price,
            dailyTxLimitPerOutlet: planConfig.dailyTxLimit,
          }),
          ...(maxOutlets !== undefined && { maxOutlets: Number(maxOutlets) }),
          ...(status && { status }),
        },
      });

      // Update owner name jika diubah
      if (ownerName) {
        await basePrisma.user.updateMany({
          where: { tenantId: existingTenant.id, role: BaseRole.OWNER },
          data: { name: ownerName.trim() },
        });
      }

      // Update outlet plan jika paket diubah
      if (planConfig) {
        await basePrisma.outlet.updateMany({
          where: { tenantId: existingTenant.id },
          data: {
            plan: planConfig.code,
            dailyTxLimit: planConfig.dailyTxLimit || 200,
          },
        });
      }

      // 2. Sinkronisasi ke ProtekSales DB (prisma)
      if (existingTenant.licenseKey) {
        const protekLicense = await prisma.license.findUnique({
          where: { licenseKey: existingTenant.licenseKey },
          include: { outlet: true },
        });

        if (protekLicense) {
          if (status) {
            await prisma.license.update({
              where: { id: protekLicense.id },
              data: {
                status: status === 'ACTIVE' ? LicenseStatus.ACTIVE : LicenseStatus.SUSPENDED,
                suspendedReason: status === 'SUSPENDED' ? 'Ditangguhkan via Command Center.' : null,
              },
            });
          }

          if (name || pricePerOutlet || ownerName || phone) {
            await prisma.outlet.update({
              where: { id: protekLicense.outletId },
              data: {
                ...(name && { name: name.trim() }),
                ...(pricePerOutlet && { monthlyFee: Number(pricePerOutlet) }),
                ...(ownerName && { ownerName: ownerName.trim() }),
                ...(phone && { phone: phone.trim() }),
              },
            });
          }
        }
      }

      return sendSuccess(res, `Konfigurasi tenant "${updatedTenant.name}" berhasil diperbarui di database!`, updatedTenant);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 12. Hapus / Suspend Tenant dari Command Center
   * DELETE /api/admin/cloudpos/tenants/:id
   */
  static async deleteCloudPosTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const existingTenant = await basePrisma.tenant.findFirst({
        where: {
          OR: [{ id }, { slug: id }],
        },
      });

      if (!existingTenant) {
        return sendError(res, `Tenant "${id}" tidak ditemukan.`, 404);
      }

      // Tandai SUSPENDED
      await basePrisma.tenant.update({
        where: { id: existingTenant.id },
        data: { status: 'SUSPENDED' },
      });

      if (existingTenant.licenseKey) {
        await prisma.license.updateMany({
          where: { licenseKey: existingTenant.licenseKey },
          data: { status: LicenseStatus.SUSPENDED, suspendedReason: 'Dihapus/Ditangguhkan oleh Admin Command Center' },
        });
      }

      return sendSuccess(res, `Tenant "${existingTenant.name}" berhasil ditangguhkan dan dinonaktifkan.`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 13. Sinkronisasi Otomatis Seluruh Tenant dari Cloud POS BE ke ProtekSales
   * POST /api/admin/cloudpos/sync-tenants
   */
  static async syncCloudPosTenants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const adminUserId = req.user!.userId;
      const cloudTenants = await CloudPosIntegrationService.getAllTenants();

      if (cloudTenants.length === 0) {
        return sendSuccess(res, 'Tidak ada tenant yang ditemukan di Cloud POS atau service offline.', {
          totalSynced: 0,
          createdCount: 0,
        });
      }

      const existingLicenses = await prisma.license.findMany({
        select: { licenseKey: true, outletId: true },
      });
      const existingLicenseMap = new Set(existingLicenses.map((l) => l.licenseKey));

      let createdCount = 0;
      let alreadyLinkedCount = 0;

      for (const tenant of cloudTenants) {
        if (!tenant.licenseKey) continue;

        if (existingLicenseMap.has(tenant.licenseKey)) {
          alreadyLinkedCount++;
          // Sinkronkan data outlet ProtekSales agar selalu up to date dengan Cloud POS DB
          const existingLic = existingLicenses.find((l) => l.licenseKey === tenant.licenseKey);
          if (existingLic) {
            await prisma.outlet.update({
              where: { id: existingLic.outletId },
              data: {
                name: tenant.name,
                ownerName: tenant.ownerName || 'Ibu Intan Permata (Owner)',
                phone: tenant.ownerPhone || tenant.mainOutlet?.phone || '081284525304',
                address: tenant.cluster || tenant.mainOutlet?.address || 'Bandung',
                monthlyFee: tenant.pricePerOutlet ? Number(tenant.pricePerOutlet) : 350000,
              },
            });
          }
          continue;
        }

        // Buat outlet baru di ProtekSales terhubung ke tenant Cloud POS
        const newOutlet = await prisma.outlet.create({
          data: {
            salesId: adminUserId,
            name: tenant.name,
            ownerName: tenant.ownerName || 'Ibu Intan Permata (Owner)',
            phone: tenant.ownerPhone || tenant.mainOutlet?.phone || '081284525304',
            address: tenant.cluster || tenant.mainOutlet?.address || 'Bandung',
            monthlyFee: tenant.pricePerOutlet ? parseFloat(tenant.pricePerOutlet) : 350000,
            license: {
              create: {
                licenseKey: tenant.licenseKey,
                status: tenant.status === 'ACTIVE' ? LicenseStatus.ACTIVE : LicenseStatus.SUSPENDED,
              },
            },
          },
        });

        // Buat invoice perdana
        const invDate = new Date();
        const invoiceNumber = `INV-${invDate.getFullYear()}${String(invDate.getMonth() + 1).padStart(2, '0')}-${newOutlet.id.slice(0, 4).toUpperCase()}`;
        await prisma.invoice.create({
          data: {
            outletId: newOutlet.id,
            invoiceNumber,
            amount: newOutlet.monthlyFee,
            billingPeriod: `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'PAID',
            paidAt: new Date(),
          },
        });

        existingLicenseMap.add(tenant.licenseKey);
        createdCount++;
      }

      return sendSuccess(res, `Sinkronisasi selesai! ${createdCount} tenant baru berhasil diimpor, ${alreadyLinkedCount} tenant disinkronkan.`, {
        totalCloudTenants: cloudTenants.length,
        createdCount,
        alreadyLinkedCount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 11. Mengambil Analitik Konsolidasi Platform Cloud POS
   * GET /api/admin/cloudpos/analytics
   */
  static async getCloudPosAnalytics(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const analytics = await CloudPosIntegrationService.getPlatformAnalytics();
      return sendSuccess(res, 'Analitik platform Cloud POS berhasil diambil.', analytics);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 12. Atur Persentase Komisi Sales Khusus (Misal: 20%, 25%, dsb.)
   * PATCH /api/admin/sales/:id/commission-rate
   */
  static async updateSalesCommissionRate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { commissionRate } = req.body;

      if (commissionRate === undefined || isNaN(Number(commissionRate))) {
        return sendError(res, 'Nilai persentase komisi (commissionRate) harus berupa angka valid.', 400);
      }

      const rate = parseFloat(commissionRate);
      if (rate < 0 || rate > 100) {
        return sendError(res, 'Persentase komisi harus di antara 0% dan 100%.', 400);
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { commissionRate: rate },
        select: {
          id: true,
          name: true,
          email: true,
          commissionRate: true,
        },
      });

      return sendSuccess(res, `Persentase komisi untuk ${updated.name} berhasil diperbarui menjadi ${rate}%.`, updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 13. Atur Persentase Komisi Global untuk Seluruh Tim Sales Sekaligus
   * PATCH /api/admin/sales/commission-rate/bulk
   */
  static async updateBulkCommissionRate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { commissionRate } = req.body;
      if (commissionRate === undefined || isNaN(Number(commissionRate))) {
        return sendError(res, 'Nilai persentase komisi harus berupa angka valid.', 400);
      }

      const rate = parseFloat(commissionRate);
      if (rate < 0 || rate > 100) {
        return sendError(res, 'Persentase komisi harus di antara 0% dan 100%.', 400);
      }

      const updateResult = await prisma.user.updateMany({
        where: { role: 'SALES' },
        data: { commissionRate: rate },
      });

      return sendSuccess(res, `Persentase komisi untuk ${updateResult.count} mitra sales berhasil diset ke ${rate}%.`, {
        updatedCount: updateResult.count,
        commissionRate: rate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 14. Ambil Seluruh Pengajuan Desain UI UMKM oleh Sales
   * GET /api/admin/ui-designs
   */
  static async getAllUiDesigns(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const requests = await prisma.uiDesignRequest.findMany({
        include: {
          sales: { select: { id: true, name: true, phone: true } },
          lead: { select: { id: true, storeName: true, phone: true, address: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return sendSuccess(res, 'Daftar pengajuan desain UI UMKM berhasil diambil.', requests);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 15. Tambah Akun Mitra Sales Baru oleh Admin
   * POST /api/admin/sales
   */
  static async createSalesAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        name,
        email,
        password,
        phone,
        commissionRate,
        tier,
        bankName,
        bankAccountNumber,
        bankAccountHolder,
        npwp,
      } = req.body;

      if (!name || !name.trim()) {
        return sendError(res, 'Nama lengkap mitra sales wajib diisi.', 400);
      }
      if (!email || !email.trim()) {
        return sendError(res, 'Email bisnis / login wajib diisi.', 400);
      }
      if (!password || password.length < 6) {
        return sendError(res, 'Password akun minimal 6 karakter.', 400);
      }
      if (!phone || !phone.trim()) {
        return sendError(res, 'Nomor HP / WhatsApp wajib diisi.', 400);
      }

      const cleanPhone = sanitizePhoneNumber(phone);
      const cleanEmail = email.trim().toLowerCase();

      // Cek apakah email sudah terdaftar
      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
      if (existingUser) {
        return sendError(res, `Email "${cleanEmail}" sudah terdaftar pada sistem.`, 400);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const parsedCommissionRate =
        commissionRate !== undefined && !isNaN(Number(commissionRate))
          ? Math.min(100, Math.max(0, parseFloat(commissionRate)))
          : 25.0;

      const validTier = ['Silver', 'Gold', 'Platinum'].includes(tier) ? tier : 'Silver';

      const newSales = await prisma.user.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          password: hashedPassword,
          phone: cleanPhone,
          role: Role.SALES,
          commissionRate: parsedCommissionRate,
          tier: validTier,
          bankName: bankName?.trim() || null,
          bankAccountNumber: bankAccountNumber?.trim() || null,
          bankAccountHolder: bankAccountHolder?.trim() || null,
          npwp: npwp?.trim() || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          commissionRate: true,
          tier: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountHolder: true,
          npwp: true,
          createdAt: true,
        },
      });

      return sendSuccess(res, `Akun mitra sales "${newSales.name}" berhasil dibuat dan diterbitkan.`, newSales, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 16. Hapus Akun Mitra Sales oleh Admin
   * DELETE /api/admin/sales/:id
   */
  static async deleteSalesAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;

      const sales = await prisma.user.findUnique({
        where: { id },
        include: {
          outlets: { select: { id: true } },
          leads: { select: { id: true } },
        },
      });

      if (!sales) {
        return sendError(res, 'Akun mitra sales tidak ditemukan.', 404);
      }

      if (sales.role !== Role.SALES) {
        return sendError(res, 'Hanya akun dengan role SALES yang dapat dihapus dari menu ini.', 400);
      }

      if (sales.outlets.length > 0) {
        return sendError(
          res,
          `Sales "${sales.name}" memiliki ${sales.outlets.length} outlet binaan aktif. Alihkan outlet terlebih dahulu sebelum menghapus akun.`,
          400
        );
      }

      await prisma.user.delete({
        where: { id },
      });

      return sendSuccess(res, `Akun mitra sales "${sales.name}" berhasil dihapus dari sistem.`);
    } catch (error) {
      next(error);
    }
  }
}
