import { Request, Response } from 'express';
import { basePrisma, prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { PaymentGatewayService } from '../services/paymentGateway';
import { WalletService } from '../services/walletService';
import { getPlanDetails, SAAS_PLANS } from '../config/plans';
import { OrderStatus, PaymentMethod } from '@prisma/client';

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

    const { type, quantity = 1, extraTxQuota = 250, months = 1, targetPlan, targetOutletId } = req.body;

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
      const currentPlan = getPlanDetails(tenant.plan);
      const planInfo = getPlanDetails(targetPlan);

      // Selisih biaya upgrade (misal 100rb ke 150rb nambah 50rb)
      const currentPrice = currentPlan.price || 100000;
      const targetPrice = planInfo.price || 100000;
      const priceDifference = Math.max(0, targetPrice - currentPrice);

      amount = priceDifference;

      let targetOutletName = 'Semua Cabang / Cabang Terdaftar';
      if (targetOutletId) {
        const outlet = await basePrisma.outlet.findFirst({
          where: { id: String(targetOutletId), tenantId: tenant.id },
        });
        if (outlet) {
          targetOutletName = `${outlet.name} (${outlet.code})`;
        }
      }

      description = `Upgrade Paket ke ${planInfo.name} [Cabang: ${targetOutletName}] (Selisih Rp ${priceDifference.toLocaleString('id-ID')}, Masa Aktif Berjalan Tetap)`;
      metadata.newPlan = planInfo.code;
      metadata.newPrice = planInfo.price;
      metadata.newDailyLimit = planInfo.dailyTxLimit;
      metadata.currentPlan = currentPlan.code;
      metadata.priceDifference = priceDifference;
      metadata.targetOutletId = targetOutletId || null;
      metadata.targetOutletName = targetOutletName;
      metadata.keepExpiry = true;
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

export const submitManualPayment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const {
      invoiceId,
      type = 'ADD_OUTLET',
      quantity = 1,
      extraTxQuota = 250,
      months = 1,
      targetPlan,
      senderName,
      senderBank,
      proofImage,
      notes,
    } = req.body;

    if (!senderName || !proofImage) {
      return res.status(400).json({
        success: false,
        message: 'Nama pengirim dan foto bukti transfer QRIS wajib dilampirkan!',
      });
    }

    // Jika user mengunggah bukti untuk invoice yang sudah ada
    if (invoiceId) {
      const existing = await basePrisma.subscriptionInvoice.findFirst({
        where: { id: String(invoiceId), tenantId: tenant.id },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Faktur invoice tidak ditemukan' });
      }

      const currentMeta = (existing.metadata as any) || {};
      const updatedInvoice = await basePrisma.subscriptionInvoice.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING_APPROVAL',
          paymentMethod: 'MANUAL_QRIS',
          metadata: {
            ...currentMeta,
            senderName: String(senderName).trim(),
            senderBank: String(senderBank || 'QRIS / E-Wallet').trim(),
            proofImage: String(proofImage),
            notes: notes ? String(notes).trim() : '',
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return res.json({
        success: true,
        message: 'Bukti transfer QRIS berhasil dikirim! Menunggu verifikasi dan persetujuan Superadmin.',
        data: {
          invoice: updatedInvoice,
        },
      });
    }

    let amount = 0;
    let description = '';
    const metadata: any = {
      type,
      senderName: String(senderName).trim(),
      senderBank: String(senderBank || 'QRIS / E-Wallet').trim(),
      proofImage: String(proofImage),
      notes: notes ? String(notes).trim() : '',
      submittedAt: new Date().toISOString(),
    };

    const pricePerOutlet = Number(tenant.pricePerOutlet) || 100000;

    if (type === 'ADD_OUTLET') {
      const qty = Math.max(1, parseInt(String(quantity)) || 1);
      amount = pricePerOutlet * qty;
      description = `Penambahan ${qty} Kuota Cabang Outlet (QRIS Statis)`;
      metadata.extraOutlets = qty;
    } else if (type === 'ADD_TX_QUOTA') {
      const quota = parseInt(String(extraTxQuota)) || 250;
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
      const currentPlan = getPlanDetails(tenant.plan);
      const planInfo = getPlanDetails(targetPlan);
      const currentPrice = currentPlan.price || 100000;
      const targetPrice = planInfo.price || 100000;
      const priceDifference = Math.max(0, targetPrice - currentPrice);

      amount = priceDifference;

      let targetOutletName = 'Semua Cabang / Cabang Terdaftar';
      if (req.body.targetOutletId) {
        const outlet = await basePrisma.outlet.findFirst({
          where: { id: String(req.body.targetOutletId), tenantId: tenant.id },
        });
        if (outlet) {
          targetOutletName = `${outlet.name} (${outlet.code})`;
        }
      }

      description = `Upgrade Paket ke ${planInfo.name} [Cabang: ${targetOutletName}] (Selisih Rp ${priceDifference.toLocaleString('id-ID')}, Masa Aktif Berjalan Tetap)`;
      metadata.newPlan = planInfo.code;
      metadata.newPrice = planInfo.price;
      metadata.newDailyLimit = planInfo.dailyTxLimit;
      metadata.currentPlan = currentPlan.code;
      metadata.priceDifference = priceDifference;
      metadata.targetOutletId = req.body.targetOutletId || null;
      metadata.targetOutletName = targetOutletName;
      metadata.keepExpiry = true;
    }

    // Generate Invoice Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-QRIS/${dateStr}/${randSuffix}`;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari verifikasi

    // Simpan Invoice di Database dengan status PENDING_APPROVAL
    const invoice = await basePrisma.subscriptionInvoice.create({
      data: {
        tenantId: tenant.id,
        invoiceNumber,
        type,
        description,
        amount,
        status: 'PENDING_APPROVAL',
        paymentMethod: 'MANUAL_QRIS',
        expiresAt,
        metadata,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Bukti transfer QRIS berhasil dikirim! Menunggu verifikasi dan persetujuan Superadmin.',
      data: {
        invoice,
      },
    });
  } catch (error: any) {
    console.error('[Manual Payment Submit Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal mengirim bukti pembayaran' });
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
 * Handle Mock / Instant Test Payment (Dinonaktifkan pada tahap produksi)
 */
export const simulatePayInvoice = async (_req: AuthRequest, res: Response) => {
  return res.status(403).json({
    success: false,
    message: 'Simulasi dinonaktifkan pada tahap produksi! Harap kirim bukti transfer QRIS resmi untuk diverifikasi oleh Superadmin.',
  });
};

/**
 * Midtrans Official Webhook Handler
 */
export const handleMidtransWebhook = async (req: Request, res: Response) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body;

    const isSubscription = String(order_id).startsWith('INV-SUB');

    // 1. Jika ini transaksi POS Order (Bukan Subscription)
    if (!isSubscription) {
      const order = await basePrisma.order.findUnique({
        where: { invoiceNumber: String(order_id) },
        include: { tenant: true },
      });

      if (order) {
        // Re-verifikasi dengan Midtrans Server Key milik Tenant (BYOK)
        const serverKey = order.tenant?.midtransServerKey || undefined;
        const isTenantValid = PaymentGatewayService.verifyMidtransSignature(
          order_id,
          status_code,
          gross_amount,
          signature_key,
          serverKey
        );

        if (!isTenantValid) {
          console.warn('[Midtrans Webhook Warning] Invalid signature key for POS order:', order_id);
          return res.status(403).json({ success: false, message: 'Invalid Signature' });
        }

        const isSettled =
          transaction_status === 'settlement' ||
          (transaction_status === 'capture' && fraud_status === 'accept');

        if (isSettled && order.status !== OrderStatus.PAID) {
          await basePrisma.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.PAID,
              paymentMethod: PaymentMethod.QRIS,
              paymentGatewayRef: req.body.transaction_id || order.paymentGatewayRef,
            },
          });

          // Dana disalurkan langsung ke rekening Midtrans milik Tenant (BYOK).
          // Wallet Platform hanya dikreditkan jika tenant menggunakan Escrow Platform.
          const isUsingOwnGateway = order.tenant?.paymentGatewayEnabled && order.tenant?.paymentGatewayProvider && order.tenant.paymentGatewayProvider !== 'NONE';
          if (order.tenantId && !isUsingOwnGateway) {
            await WalletService.creditBalance({
              tenantId: order.tenantId,
              outletId: order.outletId,
              amount: Number(order.total),
              category: 'POS_SALES',
              referenceId: order.id,
              description: `Omzet Midtrans Kasir (Platform Escrow) - Nota ${order.invoiceNumber}`,
            });
          }
          console.log(`[Midtrans POS Success] Order ${order.invoiceNumber} LUNAS via Midtrans (BYOK: ${Boolean(isUsingOwnGateway)})!`);
        }

        return res.json({ success: true, message: 'POS order webhook processed' });
      }
    }

    // 2. Transaksi Langganan SaaS (Subscription Invoice)
    // Verifikasi Signature dengan Platform Midtrans Key
    const isValid = PaymentGatewayService.verifyMidtransSignature(
      order_id,
      status_code,
      gross_amount,
      signature_key
    );

    if (!isValid) {
      console.warn('[Midtrans Webhook Warning] Invalid signature key for subscription order:', order_id);
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

          if (metadata.targetOutletId) {
            await basePrisma.outlet.update({
              where: { id: String(metadata.targetOutletId) },
              data: {
                plan: planInfo.code,
                dailyTxLimit: planInfo.dailyTxLimit,
              },
            }).catch((err) => console.warn('[Subscription Outlet Plan Update Warning]', err));
          }
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
