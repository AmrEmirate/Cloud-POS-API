import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import { InvoiceStatus, LicenseStatus, LeadStatus } from '../constants/enums';
import { sendSuccess, sendError } from '../utils/response';
import { sanitizePhoneNumber, maskPhoneNumber } from '../utils/phoneSanitizer';
import { getPackageByCodeOrFee } from '../constants/plans';
import { CloudPosIntegrationService } from '../services/cloudPosIntegration';
import { basePrisma } from '../../config/database';

export class OutletController {
  /**
   * Mengambil daftar outlet binaan sales yang aktif berlangganan
   * GET /api/outlets
   */
  static async getMyOutlets(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const userRole = req.user!.role;
      const { search, scope } = req.query;

      const whereClause: any = userRole === 'ADMIN' || scope === 'all' ? {} : { salesId };

      if (search && typeof search === 'string') {
        const cleanSearch = sanitizePhoneNumber(search);
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { ownerName: { contains: search, mode: 'insensitive' } },
          ...(cleanSearch ? [{ phone: { contains: cleanSearch } }] : []),
        ];
      }

      const outlets = await prisma.outlet.findMany({
        where: whereClause,
        include: {
          license: true,
          sales: {
            select: { id: true, name: true, phone: true, role: true, email: true },
          },
          invoices: {
            orderBy: { dueDate: 'desc' },
            take: 1, // Invoice bulan berjalan / terakhir
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format dengan indikator status pembayaran (Lunas, H-3 Jatuh Tempo, Menunggak)
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Kumpulkan licenseKey untuk mengambil data cabang riil dari tenant
      const licenseKeys = outlets
        .map((o) => o.license?.licenseKey)
        .filter((key): key is string => !!key);

      let branchesMap: Record<string, any[]> = {};
      if (licenseKeys.length > 0) {
        const tenants = await basePrisma.tenant.findMany({
          where: { licenseKey: { in: licenseKeys } },
          select: {
            licenseKey: true,
            outlets: {
              select: {
                id: true,
                code: true,
                name: true,
                city: true,
                address: true,
                phone: true,
              },
              orderBy: { code: 'asc' },
            },
          },
        });
        tenants.forEach((t) => {
          if (t.licenseKey) {
            branchesMap[t.licenseKey] = t.outlets;
          }
        });
      }

      const formattedOutlets = outlets.map((outlet) => {
        const latestInvoice = outlet.invoices[0] || null;
        let paymentIndicator: 'PAID' | 'DUE_SOON' | 'OVERDUE' | 'NO_INVOICE' = 'NO_INVOICE';

        if (latestInvoice) {
          if (latestInvoice.status === InvoiceStatus.PAID) {
            paymentIndicator = 'PAID';
          } else if (latestInvoice.status === InvoiceStatus.OVERDUE) {
            paymentIndicator = 'OVERDUE';
          } else if (latestInvoice.dueDate <= threeDaysFromNow) {
            paymentIndicator = 'DUE_SOON';
          } else {
            paymentIndicator = 'PAID'; // Masih dalam periode normal
          }
        }

        const isDirectAdmin = outlet.sales?.role === 'ADMIN' || outlet.sales?.email?.includes('amremi');
        const isOwner = userRole === 'ADMIN' || outlet.salesId === salesId;

        const licenseKey = outlet.license?.licenseKey;
        const rawBranches = (licenseKey && branchesMap[licenseKey]) ? branchesMap[licenseKey] : [];
        const branches = isOwner
          ? rawBranches
          : rawBranches.map((b) => ({ ...b, phone: maskPhoneNumber(b.phone) }));

        return {
          id: outlet.id,
          name: outlet.name,
          ownerName: outlet.ownerName,
          phone: isOwner ? outlet.phone : maskPhoneNumber(outlet.phone),
          address: outlet.address,
          latitude: outlet.latitude,
          longitude: outlet.longitude,
          monthlyFee: outlet.monthlyFee,
          sales: outlet.sales
            ? {
                ...outlet.sales,
                phone: isOwner ? outlet.sales.phone : maskPhoneNumber(outlet.sales.phone),
              }
            : null,
          isDirectAdmin,
          salesChannel: isDirectAdmin ? 'HQ_DIRECT' : 'SALES_PARTNER',
          license: outlet.license,
          latestInvoice,
          paymentIndicator,
          branches,
          canToggleKillSwitch: userRole === 'ADMIN',
        };
      });

      return sendSuccess(res, 'Daftar outlet aktif berhasil diambil.', formattedOutlets);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Detail Outlet, Lisensi, & Riwayat Tagihan
   * GET /api/outlets/:id
   */
  static async getOutletDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const salesId = req.user!.userId;
      const userRole = req.user!.role;

      const outlet = await prisma.outlet.findUnique({
        where: { id },
        include: {
          sales: {
            select: { id: true, name: true, phone: true, email: true },
          },
          license: true,
          invoices: {
            orderBy: { dueDate: 'desc' },
            include: {
              commission: true,
            },
          },
          lead: {
            include: {
              visits: { orderBy: { visitDate: 'desc' }, take: 5 },
            },
          },
        },
      });

      if (!outlet) {
        return sendError(res, 'Outlet tidak ditemukan.', 404);
      }

      const isOwner = userRole === 'ADMIN' || outlet.salesId === salesId;

      // Ambil data operasional live dari Cloud POS BE jika lisensi tersedia
      let cloudPosOperational = null;
      if (outlet.license?.licenseKey) {
        cloudPosOperational = await CloudPosIntegrationService.getTenantByLicense(outlet.license.licenseKey);
      }

      // Jika sales melihat outlet yang bukan miliknya, samarkan nomor kontak
      const sanitizedOutlet = {
        ...outlet,
        phone: isOwner ? outlet.phone : maskPhoneNumber(outlet.phone),
        sales: outlet.sales
          ? {
              ...outlet.sales,
              phone: isOwner ? outlet.sales.phone : maskPhoneNumber(outlet.sales.phone),
            }
          : null,
        canToggleKillSwitch: userRole === 'ADMIN',
      };

      if (!isOwner && cloudPosOperational) {
        if (Array.isArray(cloudPosOperational.outlets)) {
          cloudPosOperational.outlets = cloudPosOperational.outlets.map((b: any) => ({
            ...b,
            phone: maskPhoneNumber(b.phone),
          }));
        }
      }

      return sendSuccess(res, 'Detail outlet berhasil diambil.', {
        ...sanitizedOutlet,
        cloudPosOperational,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mengambil data telemetri & transaksi kasir live dari Cloud POS BE untuk outlet tertentu
   * GET /api/outlets/:id/cloudpos-live
   */
  static async getOutletCloudPosLive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const salesId = req.user!.userId;
      const userRole = req.user!.role;

      const outlet = await prisma.outlet.findUnique({
        where: { id },
        include: { license: true },
      });

      if (!outlet) {
        return sendError(res, 'Outlet tidak ditemukan.', 404);
      }

      if (!outlet.license?.licenseKey) {
        return sendSuccess(res, 'Outlet belum memiliki lisensi POS yang terdaftar.', {
          connected: false,
          licenseKey: null,
          data: null,
          canToggleKillSwitch: userRole === 'ADMIN',
        });
      }

      let liveData = await CloudPosIntegrationService.getTenantByLicense(outlet.license.licenseKey);
      if (liveData && userRole !== 'ADMIN' && outlet.salesId !== salesId) {
        if (Array.isArray(liveData.outlets)) {
          liveData = {
            ...liveData,
            outlets: liveData.outlets.map((b: any) => ({
              ...b,
              phone: maskPhoneNumber(b.phone),
            })),
          };
        }
      }

      return sendSuccess(res, 'Data operasional live Cloud POS berhasil diambil.', {
        connected: !!liveData,
        licenseKey: outlet.license.licenseKey,
        data: liveData,
        canToggleKillSwitch: userRole === 'ADMIN',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Onboarding Outlet Baru dari Prospek DEAL (atau langsung dibuat)
   * POST /api/outlets
   */
  static async createOutlet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const currentSalesId = req.user!.userId;
      const userRole = req.user!.role;
      const { leadId, name, ownerName, phone, address, latitude, longitude, monthlyFee, salesId, planCode, packageTier } = req.body;

      // Assign sales: jika admin membuatkan untuk sales tertentu, gunakan salesId dari body.
      // Jika dibuat langsung oleh Admin HQ (amremi) tanpa memilih mitra sales, outlet secara mutlak menjadi Binaan Langsung Admin HQ.
      const assignedSalesId = userRole === 'ADMIN' && salesId && salesId !== 'ADMIN_DIRECT' ? salesId : currentSalesId;
      const cleanPhone = sanitizePhoneNumber(phone);

      if (!name || !ownerName || !cleanPhone || !address) {
        return sendError(res, 'Nama outlet, nama pemilik, nomor telepon, dan alamat wajib diisi.', 400);
      }

      // Hitung paket langganan (100k, 150k, 200k, 250k)
      const packagePlan = getPackageByCodeOrFee(planCode || packageTier || monthlyFee);
      const effectiveMonthlyFee = packagePlan.monthlyFee;

      // Generate lisensi acak: PROPOS-XXXX-XXXX
      const randomKeyPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomKeyPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const generatedLicenseKey = `PROPOS-${randomKeyPart1}-${randomKeyPart2}`;

      // Buat outlet sekaligus lisensinya
      const outlet = await prisma.outlet.create({
        data: {
          leadId: leadId || undefined,
          salesId: assignedSalesId,
          name,
          ownerName,
          phone: cleanPhone,
          address,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined,
          monthlyFee: effectiveMonthlyFee,
          license: {
            create: {
              licenseKey: generatedLicenseKey,
              status: LicenseStatus.ACTIVE,
            },
          },
        },
        include: {
          license: true,
          sales: { select: { id: true, name: true, phone: true } },
        },
      });

      // Jika dibuat dari Lead, pastikan status Lead menjadi DEAL
      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { status: LeadStatus.DEAL },
        });
      }

      // Otomatis sinkronkan dan lakukan provisioning tenant di Cloud POS API
      CloudPosIntegrationService.provisionTenantToCloudPos({
        name: outlet.name,
        ownerName: outlet.ownerName,
        phone: outlet.phone,
        planCode: packagePlan.code,
        licenseKey: generatedLicenseKey,
      }).catch((err) => console.warn('[AutoProvision Warning]', err));

      return sendSuccess(res, `Outlet ${outlet.name} (${packagePlan.name}) dan lisensi POS berhasil dibuat & disinkronkan ke Cloud POS.`, outlet, 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Gagal membuat outlet.', 400);
    }
  }
}
