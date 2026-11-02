import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { basePrisma } from '../config/database';
import { DuitkuService } from '../services/duitkuService';
import { PaymentGatewayService } from '../services/paymentGateway';

/**
 * 1. Dapatkan Konfigurasi Payment Gateway Milik Tenant (BYOK)
 */
export const getPaymentGatewayConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        paymentGatewayProvider: true,
        duitkuMerchantCode: true,
        duitkuApiKey: true,
        duitkuIsProduction: true,
        midtransServerKey: true,
        midtransClientKey: true,
        midtransMerchantId: true,
        midtransIsProduction: true,
        paymentGatewayEnabled: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    // Mask keys for safety
    const maskKey = (key?: string | null) => {
      if (!key || key.length < 4) return '';
      return '••••••••' + key.slice(-4);
    };

    const host = req.get('host') || 'api.posmu.cloud';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

    res.json({
      success: true,
      data: {
        provider: tenant.paymentGatewayProvider || 'NONE',
        enabled: tenant.paymentGatewayEnabled ?? false,
        duitku: {
          merchantCode: tenant.duitkuMerchantCode || '',
          apiKeyMasked: maskKey(tenant.duitkuApiKey),
          hasApiKey: !!tenant.duitkuApiKey,
          isProduction: !!tenant.duitkuIsProduction,
          callbackUrl: `${baseUrl}/api/v1/payment/duitku/callback`,
        },
        midtrans: {
          serverKeyMasked: maskKey(tenant.midtransServerKey),
          hasServerKey: !!tenant.midtransServerKey,
          clientKey: tenant.midtransClientKey || '',
          merchantId: tenant.midtransMerchantId || '',
          isProduction: !!tenant.midtransIsProduction,
          notificationUrl: `${baseUrl}/api/v1/billing/webhook/midtrans`,
        },
        webhookUrls: {
          duitku: `${baseUrl}/api/v1/payment/duitku/callback`,
          midtrans: `${baseUrl}/api/v1/billing/webhook/midtrans`,
        },
      },
    });
  } catch (error: any) {
    console.error('[Get Payment Config Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat konfigurasi payment gateway' });
  }
};

/**
 * 2. Simpan / Perbarui Konfigurasi Payment Gateway Mandiri Milik Tenant
 */
export const updatePaymentGatewayConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const {
      provider,
      enabled,
      duitkuMerchantCode,
      duitkuApiKey,
      duitkuIsProduction,
      midtransServerKey,
      midtransClientKey,
      midtransMerchantId,
      midtransIsProduction,
    } = req.body;

    const current = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!current) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const updateData: any = {};

    if (provider !== undefined) updateData.paymentGatewayProvider = String(provider).toUpperCase();
    if (enabled !== undefined) updateData.paymentGatewayEnabled = Boolean(enabled);

    if (duitkuMerchantCode !== undefined) updateData.duitkuMerchantCode = String(duitkuMerchantCode).trim();
    if (duitkuIsProduction !== undefined) updateData.duitkuIsProduction = Boolean(duitkuIsProduction);
    if (duitkuApiKey && !duitkuApiKey.includes('••••')) {
      updateData.duitkuApiKey = String(duitkuApiKey).trim();
    }

    if (midtransClientKey !== undefined) updateData.midtransClientKey = String(midtransClientKey).trim();
    if (midtransMerchantId !== undefined) updateData.midtransMerchantId = String(midtransMerchantId).trim();
    if (midtransIsProduction !== undefined) updateData.midtransIsProduction = Boolean(midtransIsProduction);
    if (midtransServerKey && !midtransServerKey.includes('••••')) {
      updateData.midtransServerKey = String(midtransServerKey).trim();
    }

    const updated = await basePrisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    res.json({
      success: true,
      message: 'Konfigurasi Payment Gateway berhasil disimpan!',
      provider: updated.paymentGatewayProvider,
    });
  } catch (error: any) {
    console.error('[Update Payment Config Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menyimpan konfigurasi payment gateway' });
  }
};

/**
 * 3. Uji Coba Koneksi API Keys Gateway Langsung ke Server Midtrans / Duitku
 */
export const testPaymentGatewayConfig = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const { provider, credentials } = req.body;
    const targetProvider = (provider || 'DUITKU').toUpperCase();

    const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });

    if (targetProvider === 'DUITKU') {
      const merchantCode = credentials?.merchantCode || tenant.duitkuMerchantCode;
      let apiKey = credentials?.apiKey;
      if (!apiKey || apiKey.includes('••••')) {
        apiKey = tenant.duitkuApiKey;
      }
      const isProduction =
        credentials?.isProduction !== undefined
          ? Boolean(credentials.isProduction)
          : !!tenant.duitkuIsProduction;

      if (!merchantCode || !apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Merchant Code dan API Key Duitku harus diisi untuk pengujian',
        });
      }

      const result = await DuitkuService.testCredentials({
        merchantCode,
        apiKey,
        isProduction,
      });

      return res.json(result);
    } else if (targetProvider === 'MIDTRANS') {
      let serverKey = credentials?.serverKey;
      if (!serverKey || serverKey.includes('••••')) {
        serverKey = tenant.midtransServerKey;
      }
      const isProduction =
        credentials?.isProduction !== undefined
          ? Boolean(credentials.isProduction)
          : !!tenant.midtransIsProduction;

      if (!serverKey) {
        return res.status(400).json({
          success: false,
          message: 'Server Key Midtrans harus diisi untuk pengujian',
        });
      }

      const result = await PaymentGatewayService.testCredentials({
        serverKey,
        isProduction,
      });

      return res.json(result);
    } else {
      return res.json({
        success: true,
        message: 'Mode Simulator siap digunakan (tanpa perlu API key eksternal).',
      });
    }
  } catch (error: any) {
    console.error('[Test Payment Gateway Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal menguji koneksi gateway' });
  }
};
