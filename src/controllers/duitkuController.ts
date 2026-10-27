import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { basePrisma, prisma } from '../config/database';
import { DuitkuService } from '../services/duitkuService';
import { WalletService } from '../services/walletService';
import { getPlanDetails } from '../config/plans';
import { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * 1. Buat Invoice Tagihan Langganan Bulanan SaaS via Duitku
 */
export const createSubscriptionCheckout = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
    }

    const { type, quantity = 1, extraTxQuota = 250, months = 1, targetPlan, paymentMethod = 'NQ' } = req.body;

    let amount = 0;
    let description = '';
    const metadata: any = { type, gateway: 'DUITKU' };
    const pricePerOutlet = Number(tenant.pricePerOutlet) || 100000;

    if (type === 'ADD_OUTLET') {
      const qty = Math.max(1, parseInt(String(quantity)) || 1);
      amount = pricePerOutlet * qty;
      description = `Penambahan ${qty} Kuota Cabang Outlet (Rp ${pricePerOutlet.toLocaleString('id-ID')}/bln)`;
      metadata.extraOutlets = qty;
    } else if (type === 'ADD_TX_QUOTA') {
      const quota = parseInt(String(extraTxQuota)) || 250;
      let price = 25000;
      if (quota <= 100) price = 15000;
      else if (quota <= 250) price = 25000;
      else price = 45000;

      amount = price;
      description = `Penambahan Kuota Transaksi +${quota} Tx/Hari per Cabang`;
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
      return res.status(400).json({ success: false, message: 'Tipe tagihan langganan tidak valid!' });
    }

    // Generate Invoice Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-SUB/${dateStr}/${randSuffix}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Call Duitku Inquiry API
    const duitkuRes = await DuitkuService.createTransaction({
      merchantOrderId: invoiceNumber,
      amount,
      productDetails: description,
      customerName: req.user?.tenantName || tenant.name || 'Owner',
      customerEmail: req.user?.username ? `${req.user.username}@posmu.cloud` : 'billing@posmu.cloud',
      paymentMethod,
      expiryMinutes: 1440,
      additionalParam: JSON.stringify({ type: 'SUBSCRIPTION', tenantId }),
    });

    const invoice = await basePrisma.subscriptionInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        type,
        description,
        amount,
        status: 'PENDING',
        paymentMethod: paymentMethod === 'NQ' ? 'DUITKU_QRIS' : `DUITKU_${paymentMethod}`,
        snapToken: duitkuRes.reference || null,
        snapRedirectUrl: duitkuRes.paymentUrl || null,
        paymentGatewayRef: duitkuRes.reference || invoiceNumber,
        expiresAt,
        metadata: {
          ...metadata,
          qrString: duitkuRes.qrString,
          vaNumber: duitkuRes.vaNumber,
          paymentUrl: duitkuRes.paymentUrl,
        },
      },
    });

    res.json({
      success: true,
      message: 'Tagihan pembayaran Duitku berhasil dibuat',
      data: {
        invoice,
        paymentDetails: duitkuRes,
      },
    });
  } catch (error: any) {
    console.error('[Create Subscription Duitku Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membuat tagihan Duitku' });
  }
};

/**
 * 2. Buat Transaksi POS Kasir (QRIS Dinamis Duitku)
 */
export const createPosQrPayment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant tidak teridentifikasi' });
    }

    const { orderId, invoiceNumber, amount, itemsDescription = 'Pesanan Kasir POS' } = req.body;
    const numAmount = Math.round(parseFloat(String(amount)));

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Total tagihan POS tidak valid' });
    }

    const orderRef = invoiceNumber || `INV-POS/${Date.now()}`;

    // Request QRIS Duitku
    const duitkuRes = await DuitkuService.createTransaction({
      merchantOrderId: orderRef,
      amount: numAmount,
      productDetails: `POS: ${itemsDescription}`.slice(0, 100),
      customerName: req.user?.username || 'Pelanggan',
      paymentMethod: 'NQ', // QRIS
      expiryMinutes: 60, // 60 menit expired untuk kasir
      additionalParam: JSON.stringify({ type: 'POS_ORDER', tenantId, orderId }),
    });

    // Jika orderId diberikan, update Order di DB
    if (orderId) {
      await basePrisma.order.update({
        where: { id: String(orderId) },
        data: {
          paymentGatewayRef: duitkuRes.reference,
          paymentUrl: duitkuRes.paymentUrl,
          qrString: duitkuRes.qrString,
        },
      }).catch(() => null);
    }

    res.json({
      success: true,
      message: 'QRIS Duitku berhasil digenerate',
      data: {
        merchantOrderId: orderRef,
        amount: numAmount,
        qrString: duitkuRes.qrString,
        paymentUrl: duitkuRes.paymentUrl,
        reference: duitkuRes.reference,
        gateway: duitkuRes.gateway,
      },
    });
  } catch (error: any) {
    console.error('[Create POS Duitku QR Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membuat QRIS Duitku' });
  }
};

/**
 * 3. Webhook Callback Resmi Duitku
 * Menerima konfirmasi pembayaran sukses ('resultCode' === '00')
 */
export const handleDuitkuCallback = async (req: Request, res: Response) => {
  try {
    const {
      merchantCode,
      amount,
      merchantOrderId,
      signature,
      resultCode,
      reference,
      additionalParam,
    } = req.body;

    console.log('[Duitku Webhook Received]', {
      merchantOrderId,
      amount,
      resultCode,
      reference,
    });

    // 1. Verifikasi Signature Keamanan Duitku
    const isValid = DuitkuService.verifyCallback(
      merchantCode,
      amount,
      merchantOrderId,
      signature
    );

    if (!isValid) {
      console.warn('[Duitku Webhook Warning] Signature Invalid for Order:', merchantOrderId);
      return res.status(400).send('BAD_SIGNATURE');
    }

    // 2. Jika status bukan sukses ('00'), tanggapi Duitku agar tidak terus retry
    if (resultCode !== '00') {
      console.log(`[Duitku Callback] Order ${merchantOrderId} status is ${resultCode} (Not Paid)`);
      return res.status(200).send('SUCCESS');
    }

    // ========================================================
    // KASUS A: Pembayaran Langganan SaaS (Subscription Invoice)
    // ========================================================
    if (String(merchantOrderId).startsWith('INV-SUB')) {
      const invoice = await basePrisma.subscriptionInvoice.findUnique({
        where: { invoiceNumber: String(merchantOrderId) },
        include: { tenant: true },
      });

      if (invoice && invoice.status !== 'PAID') {
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
          updateData.subscriptionExpiresAt = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);
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
            paymentGatewayRef: reference || invoice.paymentGatewayRef,
          },
        });

        console.log(`[Duitku Success] Subscription Invoice ${invoice.invoiceNumber} activated!`);
      }
    }

    // ========================================================
    // KASUS B: Pembayaran Transaksi POS Kasir (POS Order)
    // Masuk ke Saldo Dompet Digital Tenant (Wallet)
    // ========================================================
    else {
      const order = await basePrisma.order.findUnique({
        where: { invoiceNumber: String(merchantOrderId) },
        include: { tenant: true },
      });

      if (order && order.status !== OrderStatus.PAID) {
        // 1. Update Order Status to PAID
        await basePrisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.PAID,
            paymentMethod: PaymentMethod.QRIS,
            paymentGatewayRef: reference || order.paymentGatewayRef,
          },
        });

        // 2. Masukkan Dana ke Dompet Digital Tenant (CREDIT Mutation)
        if (order.tenantId) {
          await WalletService.creditBalance({
            tenantId: order.tenantId,
            outletId: order.outletId,
            amount: Number(order.total),
            category: 'POS_SALES',
            referenceId: order.id,
            description: `Omzet QRIS Kasir (Duitku) - Nota ${order.invoiceNumber}`,
          });

          console.log(`[Duitku Success] POS Order ${order.invoiceNumber} paid & credited to tenant wallet!`);
        }
      }
    }

    // Duitku mewajibkan response HTTP 200 dengan text 'SUCCESS'
    return res.status(200).send('SUCCESS');
  } catch (error: any) {
    console.error('[Duitku Callback Handler Error]', error);
    return res.status(500).send('ERROR');
  }
};

/**
 * 4. Polling Status Transaksi untuk Kasir & Billing
 */
export const checkTransactionStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID wajib diisi' });
    }

    // Cek di DB lokal dulu
    const subInvoice = await basePrisma.subscriptionInvoice.findUnique({
      where: { invoiceNumber: String(orderId) },
    });
    if (subInvoice) {
      return res.json({
        success: true,
        type: 'SUBSCRIPTION',
        isPaid: subInvoice.status === 'PAID',
        status: subInvoice.status,
        data: subInvoice,
      });
    }

    const order = await basePrisma.order.findUnique({
      where: { invoiceNumber: String(orderId) },
    });
    if (order) {
      return res.json({
        success: true,
        type: 'POS_ORDER',
        isPaid: order.status === OrderStatus.PAID,
        status: order.status,
        data: order,
      });
    }

    // Fallback cek status ke Duitku API
    const duitkuStatus = await DuitkuService.checkTransactionStatus(String(orderId));
    res.json({
      success: true,
      type: 'GATEWAY_CHECK',
      duitkuStatus,
    });
  } catch (error: any) {
    console.error('[Check Duitku Status Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memeriksa status' });
  }
};

/**
 * 5. Simulasi Bayar Instan (Duitku Mock Pay untuk Demo / Testing Lokal)
 */
export const simulateDuitkuPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID wajib diisi' });
    }

    // Buat mock callback request
    const mockReq: any = {
      body: {
        merchantCode: DuitkuService.getMerchantCode() || 'D0001',
        amount: 100000,
        merchantOrderId: orderId,
        signature: 'mock_signature',
        resultCode: '00', // Success
        reference: `DUITKU-SIM-${Date.now()}`,
      },
    };

    let responseResult = '';
    const mockRes: any = {
      status: (code: number) => ({
        send: (text: string) => {
          responseResult = text;
        },
      }),
    };

    await handleDuitkuCallback(mockReq, mockRes);

    res.json({
      success: true,
      message: `Simulasi bayar Duitku untuk ${orderId} berhasil diproses! Status lunas & saldo mutasi tercatat seketika.`,
      result: responseResult,
    });
  } catch (error: any) {
    console.error('[Simulate Duitku Payment Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal simulasi bayar Duitku' });
  }
};
