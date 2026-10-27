import { Request, Response } from 'express';
import { ProtekIntegrationService } from '../services/protekIntegration';
import { basePrisma } from '../config/database';
import { SAAS_PLANS } from '../config/plans';

/**
 * Middleware verifikasi token/secret komunikasi antar-layanan (Cloud POS <-> ProtekSales)
 */
export const verifyInternalServiceSecret = (req: Request, res: Response, next: Function) => {
  const secretHeader = req.headers['x-internal-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedSecret = ProtekIntegrationService.getInternalSecret();

  if (!secretHeader || secretHeader !== expectedSecret) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Kunci otorisasi internal service tidak valid.',
    });
  }

  next();
};

/**
 * 1. Menerima sinyal sinkronisasi status lisensi (misal Kill-Switch Admin atau Invoice Lunas/Menunggak)
 * POST /api/v1/internal/sync-license
 */
export const syncLicenseStatus = async (req: Request, res: Response) => {
  try {
    const { licenseKey, status, reason } = req.body;

    if (!licenseKey || !status) {
      return res.status(400).json({
        success: false,
        message: 'licenseKey dan status (ACTIVE/SUSPENDED) wajib disertakan.',
      });
    }

    const result = await ProtekIntegrationService.applyLicenseStatusSync(licenseKey, status, reason);

    res.json({
      success: true,
      message: `Status lisensi tenant "${result.tenant.name}" berhasil disinkronkan ke ${result.status}.`,
      data: result,
    });
  } catch (error: any) {
    console.error('[Internal Sync License Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menyinkronkan status lisensi.' });
  }
};

/**
 * 2. Auto-Provisioning Toko Baru saat Sales DEAL di ProtekSales
 * POST /api/v1/internal/provision-tenant
 */
export const provisionTenant = async (req: Request, res: Response) => {
  try {
    const { name, ownerName, phone, planCode, licenseKey, customDomain, themeColor } = req.body;

    if (!name || !ownerName || !phone || !licenseKey) {
      return res.status(400).json({
        success: false,
        message: 'name, ownerName, phone, dan licenseKey wajib diisi.',
      });
    }

    const result = await ProtekIntegrationService.provisionTenantFromProtek({
      name,
      ownerName,
      phone,
      planCode,
      licenseKey,
      customDomain,
      themeColor,
    });

    res.status(201).json({
      success: true,
      message: `Toko tenant "${result.tenantName}" berhasil di-onboard otomatis dari ProtekSales!`,
      data: result,
    });
  } catch (error: any) {
    console.error('[Internal Provision Tenant Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal melakukan provisioning toko.' });
  }
};

/**
 * 3. Endpoint Heartbeat Lisensi Publik untuk Kasir POS
 * POST /api/v1/license/heartbeat
 */
export const checkHeartbeat = async (req: Request, res: Response) => {
  try {
    const { licenseKey, machineId } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        canOperate: false,
        message: 'licenseKey wajib disertakan.',
      });
    }

    // Ping ke ProtekSales Server (Port 5000)
    const protekResult = await ProtekIntegrationService.checkHeartbeatWithProtek(licenseKey, machineId);

    if (protekResult) {
      return res.json({
        success: true,
        data: protekResult,
      });
    }

    // Fallback jika ProtekSales server sementara offline: cek database lokal Cloud POS
    const tenant = await basePrisma.tenant.findFirst({
      where: { licenseKey },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        canOperate: false,
        status: 'EXPIRED',
        message: 'Lisensi tidak terdaftar di sistem.',
      });
    }

    const isActive = tenant.status === 'ACTIVE';
    return res.json({
      success: true,
      data: {
        status: tenant.status,
        canOperate: isActive,
        message: isActive ? 'Aplikasi operasional normal (Offline Fallback).' : 'Lisensi dinonaktifkan oleh administrator.',
        licenseKey,
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
      },
    });
  } catch (error: any) {
    console.error('[Heartbeat Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memeriksa lisensi' });
  }
};

/**
 * 4. Daftar Paket Tersedia (4 Paket Baru)
 * GET /api/v1/plans
 */
export const getAvailablePlans = (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.values(SAAS_PLANS),
  });
};

/**
 * 5. Mengambil Data Operasional Tenant POS berdasarkan License Key (Query dari ProtekSales)
 * GET /api/v1/internal/tenant/:licenseKey
 */
export const getTenantByLicense = async (req: Request, res: Response) => {
  try {
    const licenseKey = String(req.params.licenseKey || '').trim();

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: 'licenseKey parameter wajib disertakan.',
      });
    }

    const data = await ProtekIntegrationService.getTenantOperationalDataByLicense(licenseKey);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `Tenant dengan lisensi "${licenseKey}" tidak ditemukan di Cloud POS.`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[Internal Get Tenant By License Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil data operasional tenant dari Cloud POS.',
    });
  }
};

/**
 * 6. Mengambil Ringkasan Seluruh Tenant POS (Query dari ProtekSales Admin / Superadmin)
 * GET /api/v1/internal/tenants
 */
export const getAllTenants = async (_req: Request, res: Response) => {
  try {
    const data = await ProtekIntegrationService.getAllTenantsOperationalSummary();
    res.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    console.error('[Internal Get All Tenants Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil daftar tenant dari Cloud POS.',
    });
  }
};

/**
 * 7. Mengambil Analitik Konsolidasi Platform Cloud POS
 * GET /api/v1/internal/analytics
 */
export const getPlatformAnalytics = async (_req: Request, res: Response) => {
  try {
    const data = await ProtekIntegrationService.getPlatformAnalytics();
    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[Internal Get Analytics Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Gagal mengambil analitik platform dari Cloud POS.',
    });
  }
};
