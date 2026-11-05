import cron from 'node-cron';
import { LeadService } from '../services/lead.service';
import { BillingService } from '../services/billing.service';

/**
 * Inisialisasi Scheduled Cron Jobs
 */
export function initScheduler() {
  console.log('🕒 Scheduler otomatis diinisialisasi...');

  // 1. Cron Job Kedaluwarsa Prospek: Berjalan setiap hari pukul 00:00 (Tengah Malam)
  // Blueprint: "Mengubah prospek yang belum Deal dan sudah melewati 30 hari menjadi Expired"
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏰ Menjalankan cron job: Pembersihan prospek kedaluwarsa (30 hari)...');
      const expiredCount = await LeadService.expireStaleLeads();
      console.log(`✅ ${expiredCount} prospek telah kedaluwarsa dan dikembalikan menjadi Toko Bebas.`);
    } catch (error) {
      console.error('❌ Error pada cron job pembersihan prospek:', error);
    }
  });

  // 2. Cron Job Tagihan Overdue & Remote Kill-Switch: Berjalan setiap hari pukul 01:00
  // Memeriksa invoice yang melewati jatuh tempo + grace period, set ke OVERDUE dan suspend lisensi
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('⏰ Menjalankan cron job: Pengecekan invoice jatuh tempo & suspensi lisensi...');
      const overdueCount = await BillingService.checkAndProcessOverdueInvoices();
      console.log(`✅ ${overdueCount} tagihan diperbarui ke status OVERDUE dan lisensi terkait disuspend.`);
    } catch (error) {
      console.error('❌ Error pada cron job pengecekan tagihan overdue:', error);
    }
  });
}
