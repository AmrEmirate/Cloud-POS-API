import { basePrisma } from '../config/database';

/**
 * Otomatis memastikan kolom-kolom Payment Gateway (BYOK) tersedia di tabel "Tenant"
 */
export async function ensurePaymentGatewayColumns(): Promise<void> {
  try {
    await basePrisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='paymentGatewayProvider') THEN
          ALTER TABLE "Tenant" ADD COLUMN "paymentGatewayProvider" TEXT DEFAULT 'NONE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='duitkuMerchantCode') THEN
          ALTER TABLE "Tenant" ADD COLUMN "duitkuMerchantCode" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='duitkuApiKey') THEN
          ALTER TABLE "Tenant" ADD COLUMN "duitkuApiKey" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='duitkuIsProduction') THEN
          ALTER TABLE "Tenant" ADD COLUMN "duitkuIsProduction" BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='midtransServerKey') THEN
          ALTER TABLE "Tenant" ADD COLUMN "midtransServerKey" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='midtransClientKey') THEN
          ALTER TABLE "Tenant" ADD COLUMN "midtransClientKey" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='midtransMerchantId') THEN
          ALTER TABLE "Tenant" ADD COLUMN "midtransMerchantId" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='midtransIsProduction') THEN
          ALTER TABLE "Tenant" ADD COLUMN "midtransIsProduction" BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tenant' AND column_name='paymentGatewayEnabled') THEN
          ALTER TABLE "Tenant" ADD COLUMN "paymentGatewayEnabled" BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('✅ [Database Migration] Kolom Payment Gateway BYOK terverifikasi aktif pada tabel Tenant.');
  } catch (err: any) {
    // Abaikan jika DB belum terkoneksi saat kompilasi atau jika sudah ada
    console.warn('[Database Notice] ensurePaymentGatewayColumns standby:', err.message);
  }
}

