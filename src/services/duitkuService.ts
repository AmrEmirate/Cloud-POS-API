import crypto from 'crypto';

export interface DuitkuInvoiceParams {
  merchantOrderId: string;
  amount: number;
  productDetails: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod?: string; // 'NQ' (Nobu QRIS), 'SP' (ShopeePay/QRIS), 'BC' (BCA VA), 'M2' (Mandiri VA), etc.
  callbackUrl?: string;
  returnUrl?: string;
  expiryMinutes?: number;
  additionalParam?: string; // JSON string or identifier
}

export interface DuitkuInvoiceResponse {
  success: boolean;
  gateway: 'DUITKU' | 'SIMULATOR';
  merchantOrderId: string;
  reference?: string;
  paymentUrl?: string;
  qrString?: string;
  vaNumber?: string;
  statusCode?: string;
  statusMessage?: string;
}

export class DuitkuService {
  public static isProduction(): boolean {
    return process.env.DUITKU_IS_PRODUCTION === 'true';
  }

  public static getMerchantCode(): string {
    return (process.env.DUITKU_MERCHANT_CODE || '').trim();
  }

  public static getApiKey(): string {
    return (process.env.DUITKU_API_KEY || '').trim();
  }

  private static getInquiryUrl(): string {
    return this.isProduction()
      ? 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry'
      : 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry';
  }

  private static getStatusUrl(): string {
    return this.isProduction()
      ? 'https://passport.duitku.com/webapi/api/merchant/transactionStatus'
      : 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus';
  }

  /**
   * Buat Transaksi Pembayaran Duitku (Mendukung QRIS Dinamis, Virtual Account, & E-Wallet)
   */
  public static async createTransaction(params: DuitkuInvoiceParams): Promise<DuitkuInvoiceResponse> {
    const merchantCode = this.getMerchantCode();
    const apiKey = this.getApiKey();
    const amount = Math.round(params.amount);

    // Default URLs
    const defaultCallback =
      process.env.DUITKU_CALLBACK_URL || 'https://api.posmu.cloud/api/v1/payment/duitku/callback';
    const defaultReturn =
      process.env.DUITKU_RETURN_URL || 'https://dimsum.posmu.cloud/billing';

    // 1. Jika kredensial Duitku aktif di .env, tembak API resmi Duitku
    if (merchantCode && apiKey && merchantCode.length > 2 && apiKey.length > 5) {
      try {
        // Rumus Signature Inquiry Duitku: MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
        const rawSignature = `${merchantCode}${params.merchantOrderId}${amount}${apiKey}`;
        const signature = crypto.createHash('md5').update(rawSignature).digest('hex');

        const payload = {
          merchantCode,
          paymentAmount: amount,
          paymentMethod: params.paymentMethod || 'NQ', // 'NQ' = QRIS Nobu, 'SP' = ShopeePay QRIS
          merchantOrderId: params.merchantOrderId,
          productDetails: params.productDetails.slice(0, 100),
          email: params.customerEmail || 'billing@dimsumintan.pos',
          phoneNumber: params.customerPhone || '081234567890',
          customerVaName: params.customerName.slice(0, 30),
          callbackUrl: params.callbackUrl || defaultCallback,
          returnUrl: params.returnUrl || defaultReturn,
          signature,
          expiryPeriod: params.expiryMinutes || 1440, // 24 jam
          additionalParam: params.additionalParam || '',
        };

        const response = await fetch(this.getInquiryUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data: any = await response.json();

        if (response.ok && (data.statusCode === '00' || data.paymentUrl || data.qrString)) {
          return {
            success: true,
            gateway: 'DUITKU',
            merchantOrderId: params.merchantOrderId,
            reference: data.reference,
            paymentUrl: data.paymentUrl,
            qrString: data.qrString,
            vaNumber: data.vaNumber,
            statusCode: data.statusCode,
            statusMessage: data.statusMessage,
          };
        } else {
          console.warn('[Duitku Gateway Warning] API returned error or fallback:', data);
        }
      } catch (err) {
        console.error('[Duitku Gateway Exception]', err);
      }
    }

    // 2. Mode Simulator Duitku (Untuk Testing Lokal & Offline QRIS)
    const simulatedQrCode = `00020101021226670014ID.LINKAJA.WWW01189360091800000000000215${params.merchantOrderId}0303UMI51440014ID.CO.QRIS.WWW0215ID10200000000005204549953033605406${amount}5802ID5912DIMSUM_INTAN6007BANDUNG61054011562070703A016304ABCD`;
    const simulatedVaNumber = `88019${Math.floor(10000000 + Math.random() * 90000000)}`;

    return {
      success: true,
      gateway: 'SIMULATOR',
      merchantOrderId: params.merchantOrderId,
      reference: `DUITKU-${Date.now()}`,
      paymentUrl: `https://sandbox.duitku.com/webapi/redirect?order=${params.merchantOrderId}`,
      qrString: simulatedQrCode,
      vaNumber: simulatedVaNumber,
      statusCode: '00',
      statusMessage: 'Payment Gateway Duitku Siap. (Mode Simulator Aktif, isi DUITKU_API_KEY untuk live).',
    };
  }

  /**
   * Verifikasi Keabsahan Webhook Callback dari Duitku
   * Rumus Signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
   */
  public static verifyCallback(
    merchantCodeParam: string,
    amountParam: string | number,
    merchantOrderIdParam: string,
    signatureParam: string
  ): boolean {
    const merchantCode = this.getMerchantCode();
    const apiKey = this.getApiKey();

    // Jika belum konfigurasi key, izinkan untuk testing simulator
    if (!apiKey || apiKey.length < 5) return true;

    const raw = `${merchantCode || merchantCodeParam}${amountParam}${merchantOrderIdParam}${apiKey}`;
    const expectedSignature = crypto.createHash('md5').update(raw).digest('hex');

    return expectedSignature.toLowerCase() === String(signatureParam).toLowerCase();
  }

  /**
   * Cek Status Transaksi ke Duitku
   * Rumus Signature: MD5(merchantCode + merchantOrderId + apiKey)
   */
  public static async checkTransactionStatus(merchantOrderId: string): Promise<any> {
    const merchantCode = this.getMerchantCode();
    const apiKey = this.getApiKey();

    if (!merchantCode || !apiKey) {
      return {
        statusCode: '00',
        statusMessage: 'Simulator Active',
      };
    }

    try {
      const rawSignature = `${merchantCode}${merchantOrderId}${apiKey}`;
      const signature = crypto.createHash('md5').update(rawSignature).digest('hex');

      const payload = {
        merchantCode,
        merchantOrderId,
        signature,
      };

      const response = await fetch(this.getStatusUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return await response.json();
    } catch (err: any) {
      console.error('[Duitku Check Status Error]', err);
      return { statusCode: '99', statusMessage: err.message };
    }
  }
}
