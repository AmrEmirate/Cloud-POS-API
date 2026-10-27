import { Request, Response } from 'express';
import { basePrisma, prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { PaymentGatewayService } from '../services/paymentGateway';
import { getPlanDetails, SAAS_PLANS } from '../config/plans';

export const getBillingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        outlets: { select: { id: true, code: true, name: true } },
      },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const currentPlan = getPlanDetails(tenant.plan);

    // Hitung transaksi hari ini
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayOrdersCount = await prisma.order.count({
      where: {
        createdAt: { gte: startOfToday },
      },
    });

    // Hitung transaksi bulan ini (untuk perhitungan kuota bulanan)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthOrdersCount = await prisma.order.count({
      where: {
        createdAt: { gte: startOfMonth },
      },
    });

    // Breakdown transaksi per outlet hari ini & bulan ini
    const outletStats = await Promise.all(
      tenant.outlets.map(async (o) => {
        const [todayCount, monthCount] = await Promise.all([
          prisma.order.count({
            where: {
              outletId: o.id,
              createdAt: { gte: startOfToday },
            },
          }),
          prisma.order.count({
            where: {
              outletId: o.id,
              createdAt: { gte: startOfMonth },
            },
          }),
        ]);

        const isUnlimited = tenant.dailyTxLimitPerOutlet === 0 || currentPlan.dailyTxLimit === 0;
        const baseDaily = (tenant.dailyTxLimitPerOutlet !== undefined && tenant.dailyTxLimitPerOutlet !== null)
          ? tenant.dailyTxLimitPerOutlet
          : currentPlan.dailyTxLimit;
        const dailyLimit = isUnlimited ? 0 : baseDaily + (tenant.extraDailyTxLimit || 0);
        const monthlyLimit = isUnlimited ? 0 : (dailyLimit * 30);

        return {
          id: o.id,
          code: o.code,
          name: o.name,
          todayOrders: todayCount,
          monthOrders: monthCount,
          isUnlimited,
          dailyLimit,
          monthlyLimit,
          remaining: isUnlimited ? 'UNLIMITED' : Math.max(0, dailyLimit - todayCount),
          remainingMonth: isUnlimited ? 'UNLIMITED' : Math.max(0, monthlyLimit - monthCount),
        };
      })
    );

    const now = new Date();
    const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
    const isSubscriptionActive = expiresAt ? expiresAt > now : true;
    const daysRemaining = expiresAt
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    const isUnlimited = tenant.dailyTxLimitPerOutlet === 0 || currentPlan.dailyTxLimit === 0;
    const baseDaily = (tenant.dailyTxLimitPerOutlet !== undefined && tenant.dailyTxLimitPerOutlet !== null)
      ? tenant.dailyTxLimitPerOutlet
      : currentPlan.dailyTxLimit;
    const effectiveDailyTxLimit = isUnlimited ? 0 : baseDaily + (tenant.extraDailyTxLimit || 0);
    const effectiveMonthlyTxLimit = isUnlimited ? 0 : effectiveDailyTxLimit * 30;
    const remainingMonthOrders = isUnlimited ? 'UNLIMITED' : Math.max(0, effectiveMonthlyTxLimit - monthOrdersCount);

    res.json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        plan: tenant.plan,
        planDetails: currentPlan,
        status: tenant.status,
        licenseKey: tenant.licenseKey,
        pricePerOutlet: Number(tenant.pricePerOutlet),
        currentOutletsCount: tenant.outlets.length,
        maxOutlets: tenant.maxOutlets,
        canAddOutlet: tenant.outlets.length < tenant.maxOutlets,
        dailyTxLimitPerOutlet: tenant.dailyTxLimitPerOutlet,
        monthlyTxLimitPerOutlet: currentPlan.monthlyTxLimit,
        effectiveDailyTxLimit,
        effectiveMonthlyTxLimit,
        remainingMonthOrders,
        isUnlimited,
        extraDailyTxLimit: tenant.extraDailyTxLimit,
        todayOrdersCount,
        monthOrdersCount,
        isSubscriptionActive,
        subscriptionExpiresAt: expiresAt?.toISOString() || null,
        daysRemaining,
        outlets: outletStats,
        availablePlans: Object.values(SAAS_PLANS),
      },
    });
  } catch (error: any) {
    console.error('[Billing Status Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat status langganan' });
  }
};

export const createCheckout = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const { type, quantity = 1, extraTxQuota = 250, months = 1, targetPlan } = req.body;

    let amount = 0;
    let description = '';
    const metadata: any = { type };

    const pricePerOutlet = Number(tenant.pricePerOutlet) || 100000;

    if (type === 'ADD_OUTLET') {
      const qty = Math.max(1, parseInt(String(quantity)) || 1);
      amount = pricePerOutlet * qty;
      description = `Penambahan ${qty} Kuota Cabang Outlet (Rp ${pricePerOutlet.toLocaleString('id-ID')}/bln)`;
      metadata.extraOutlets = qty;
    } else if (type === 'ADD_TX_QUOTA') {
      const quota = parseInt(String(extraTxQuota)) || 250;
      // Tarif kuota transaksi harian tambahan:
      // +3.000 tx/bln = Rp 15.000, +7.500 tx/bln = Rp 25.000, +15.000 tx/bln = Rp 45.000
      let price = 25000;
      if (quota <= 100) price = 15000;
      else if (quota <= 250) price = 25000;
      else price = 45000;

      amount = price;
      description = `Penambahan Kuota Transaksi +${(quota * 30).toLocaleString('id-ID')} Tx/Bulan per Cabang`;
      metadata.extraTxQuota = quota;
    } else if (type === 'RENEWAL') {
      const m = Math.max(1, parseInt(String(months)) || 1);
      const totalOutlets = Math.max(1, tenant.maxOutlets);
      amount = pricePerOutlet * totalOutlets * m;
      description = `Perpanjangan Langganan POS ${totalOutlets} Cabang x ${m} Bulan`;
      metadata.months = m;
    } else if (type === 'CHANGE_PLAN' || type === 'UPGRADE_PLAN') {
      const planInfo = getPlanDetails(targetPlan);
      const totalOutlets = Math.max(1, tenant.maxOutlets);
      amount = planInfo.price * totalOutlets;
      description = `Upgrade Paket SaaS ke ${planInfo.name} (${totalOutlets} Cabang)`;
      metadata.newPlan = planInfo.code;
      metadata.newPrice = planInfo.price;
      metadata.newDailyLimit = planInfo.dailyTxLimit;
    } else {
      return res.status(400).json({ success: false, message: 'Tipe pembayaran tagihan tidak valid!' });
    }

    // Generate Invoice Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-SUB/${dateStr}/${randSuffix}`;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam batas bayar

    // Request ke Payment Gateway (Midtrans Snap / Dynamic QRIS & VA)
    const gatewayRes = await PaymentGatewayService.createTransaction({
      invoiceNumber,
      amount,
      description,
      customerName: req.user?.tenantName || tenant.name || 'Owner',
      customerEmail: undefined,
    });

    // Simpan Invoice di Database
    const invoice = await basePrisma.subscriptionInvoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber,
        type,
        description,
        amount,
        status: 'PENDING',
        paymentMethod: gatewayRes.gateway === 'MIDTRANS' ? 'MIDTRANS_SNAP' : 'QRIS',
        snapToken: gatewayRes.snapToken || null,
        snapRedirectUrl: gatewayRes.redirectUrl || null,
        paymentGatewayRef: gatewayRes.vaNumber || invoiceNumber,
        expiresAt,
        metadata,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Invoice pembayaran berhasil dibuat',
      data: {
        invoice,
        gateway: gatewayRes.gateway,
        snapToken: gatewayRes.snapToken,
        snapRedirectUrl: gatewayRes.redirectUrl,
        qrCodeUrl: gatewayRes.qrCodeUrl,
        vaNumber: gatewayRes.vaNumber,
        clientKey: PaymentGatewayService.getClientKey(),
      },
    });
  } catch (error: any) {
    console.error('[Checkout Billing Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membuat tagihan' });
  }
};

export const getInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const invoices = await basePrisma.subscriptionInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: invoices });
  } catch (error: any) {
    console.error('[Get Invoices Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat riwayat invoice' });
  }
};

/**
 * Handle Mock / Instant Test Payment (Bisa dipicu dari tombol simulasi bayar QRIS/VA)
 */
export const simulatePayInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const invoice = await basePrisma.subscriptionInvoice.findUnique({
      where: { id: String(id) },
      include: { tenant: true },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan' });
    }

    if (invoice.status === 'PAID') {
      return res.json({ success: true, message: 'Invoice sudah lunas sebelumnya', data: invoice });
    }

    const metadata = (invoice.metadata as any) || {};
    const tenant = invoice.tenant;

    // Terapkan manfaat paket ke Tenant
    let updateData: any = {};

    if (invoice.type === 'ADD_OUTLET') {
      const extra = metadata.extraOutlets || 1;
      updateData.maxOutlets = tenant.maxOutlets + extra;
    } else if (invoice.type === 'ADD_TX_QUOTA') {
      const extraQuota = metadata.extraTxQuota || 250;
      updateData.extraDailyTxLimit = tenant.extraDailyTxLimit + extraQuota;
    } else if (invoice.type === 'RENEWAL') {
      const months = metadata.months || 1;
      const currentExpiry = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);
      updateData.subscriptionExpiresAt = newExpiry;
      updateData.status = 'ACTIVE';
    } else if (invoice.type === 'CHANGE_PLAN' || invoice.type === 'UPGRADE_PLAN') {
      if (metadata.newPlan) {
        const planInfo = getPlanDetails(metadata.newPlan);
        updateData.plan = planInfo.code;
        updateData.pricePerOutlet = planInfo.price;
        updateData.dailyTxLimitPerOutlet = planInfo.dailyTxLimit;
        updateData.status = 'ACTIVE';
      }
    }

    await basePrisma.tenant.update({
      where: { id: tenant.id },
      data: updateData,
    });

    const updatedInvoice = await basePrisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Pembayaran ${invoice.description} berhasil diverifikasi! Kuota dan paket aktif seketika.`,
      data: updatedInvoice,
    });
  } catch (error: any) {
    console.error('[Simulate Pay Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memproses pembayaran' });
  }
};

/**
 * Midtrans Official Webhook Handler
 */
export const handleMidtransWebhook = async (req: Request, res: Response) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body;

    // Verifikasi Signature
    const isValid = PaymentGatewayService.verifyMidtransSignature(
      order_id,
      status_code,
      gross_amount,
      signature_key
    );

    if (!isValid) {
      console.warn('[Midtrans Webhook Warning] Invalid signature key for order:', order_id);
      return res.status(403).json({ success: false, message: 'Invalid Signature' });
    }

    const invoice = await basePrisma.subscriptionInvoice.findUnique({
      where: { invoiceNumber: String(order_id) },
      include: { tenant: true },
    });

    if (!invoice) {
      console.warn('[Midtrans Webhook Warning] Invoice not found:', order_id);
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const isSettled =
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept');

    if (isSettled && invoice.status !== 'PAID') {
      const metadata = (invoice.metadata as any) || {};
      const tenant = invoice.tenant;
      let updateData: any = {};

      if (invoice.type === 'ADD_OUTLET') {
        const extra = metadata.extraOutlets || 1;
        updateData.maxOutlets = tenant.maxOutlets + extra;
      } else if (invoice.type === 'ADD_TX_QUOTA') {
        const extraQuota = metadata.extraTxQuota || 250;
        updateData.extraDailyTxLimit = tenant.extraDailyTxLimit + extraQuota;
      } else if (invoice.type === 'RENEWAL') {
        const months = metadata.months || 1;
        const currentExpiry = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : new Date();
        const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);
        updateData.subscriptionExpiresAt = newExpiry;
        updateData.status = 'ACTIVE';
      } else if (invoice.type === 'CHANGE_PLAN' || invoice.type === 'UPGRADE_PLAN') {
        if (metadata.newPlan) {
          const planInfo = getPlanDetails(metadata.newPlan);
          updateData.plan = planInfo.code;
          updateData.pricePerOutlet = planInfo.price;
          updateData.dailyTxLimitPerOutlet = planInfo.dailyTxLimit;
          updateData.status = 'ACTIVE';
        }
      }

      await basePrisma.tenant.update({
        where: { id: tenant.id },
        data: updateData,
      });

      await basePrisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentGatewayRef: req.body.transaction_id || invoice.paymentGatewayRef,
        },
      });

      console.log(`[Midtrans Webhook Success] Invoice ${invoice.invoiceNumber} LUNAS! Paket tenant diperbarui.`);
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('[Midtrans Webhook Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Webhook processing failed' });
  }
};
