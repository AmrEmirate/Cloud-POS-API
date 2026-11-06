import prisma from '../config/prisma';
import { LeadStatus } from '../constants/enums';
import { sanitizePhoneNumber } from '../utils/phoneSanitizer';
import { config } from '../config/env';

export interface CheckLeadResult {
  canClaim: boolean;
  message: string;
  lead?: {
    id: string;
    storeName: string;
    ownerName: string;
    phone: string;
    status: string;
    protectedUntil: Date;
    sales: {
      id: string;
      name: string;
      phone: string;
    };
  };
}

export class LeadService {
  /**
   * Pengecekan real-time apakah nomor WhatsApp outlet sudah diklaim oleh sales lain
   */
  static async checkLeadAvailability(phone: string, currentSalesId?: string): Promise<CheckLeadResult> {
    const cleanPhone = sanitizePhoneNumber(phone);
    if (!cleanPhone) {
      throw new Error('Nomor telepon/WhatsApp tidak valid.');
    }

    const now = new Date();

    // Cari prospek aktif yang nomor teleponnya sama dan masa proteksi belum habis
    const activeLead = await prisma.lead.findFirst({
      where: {
        phone: cleanPhone,
        protectedUntil: {
          gt: now,
        },
        status: {
          notIn: [LeadStatus.EXPIRED, LeadStatus.LOST],
        },
      },
      include: {
        sales: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (activeLead) {
      const isOwnedByCurrentSales = currentSalesId && activeLead.salesId === currentSalesId;
      return {
        canClaim: isOwnedByCurrentSales ? true : false,
        message: isOwnedByCurrentSales
          ? 'Outlet ini sudah Anda klaim sebelumnya dan masa proteksi masih aktif.'
          : `Outlet sedang diprospek oleh ${activeLead.sales.name}. Terkunci hingga ${activeLead.protectedUntil.toLocaleDateString('id-ID')}.`,
        lead: activeLead,
      };
    }

    return {
      canClaim: true,
      message: 'Toko bebas. Outlet dapat didaftarkan dan diprospek.',
    };
  }

  /**
   * Form Check-in Kunjungan: Daftarkan prospek baru atau kunjungan toko bebas
   * Mendukung Alur Sales Offline (Lapangan) & Sales Online (Multi-Outlet Outreach)
   */
  static async registerOrCheckinLead(data: {
    salesId: string;
    storeName: string;
    ownerName: string;
    phone: string;
    address: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
    photoUrl?: string;
    salesType?: 'OFFLINE' | 'ONLINE';
    outletCount?: number;
    outcome?: 'AGREED' | 'NOT_AGREED' | 'PENDING' | 'FOLLOW_UP';
    rejectionReason?: string;
    followUpDate?: string;
  }) {
    const cleanPhone = sanitizePhoneNumber(data.phone);
    const availability = await this.checkLeadAvailability(cleanPhone, data.salesId);

    if (!availability.canClaim) {
      throw new Error(availability.message);
    }

    const now = new Date();
    const protectedUntil = new Date(now.getTime() + config.leadProtectionDays * 24 * 60 * 60 * 1000);

    // Format catatan terstruktur
    const salesTypeTag = data.salesType ? `[Channel: ${data.salesType}]` : '[Channel: OFFLINE]';
    const outletTag = data.outletCount ? `[Outlets: ${data.outletCount}]` : '';
    const outcomeTag = data.outcome ? `[Hasil: ${data.outcome}]` : '';
    const reasonTag = data.rejectionReason ? `[Alasan: ${data.rejectionReason}]` : '';
    const followUpTag = data.followUpDate ? `[Pengingat: ${data.followUpDate}]` : '';

    const formattedNotes = [
      salesTypeTag,
      outletTag,
      outcomeTag,
      reasonTag,
      followUpTag,
      data.notes || '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Tentukan status awal berdasarkan kesepakatan UMKM
    let initialStatus: LeadStatus = LeadStatus.NEW;
    if (data.outcome === 'AGREED') {
      initialStatus = LeadStatus.DEMO; // Siap dibuatkan UI kustom / demo
    }

    // Jika toko sudah dipegang oleh sales yang sama, tambahkan riwayat kunjungan
    if (availability.lead && availability.lead.sales.id === data.salesId) {
      const updatedLead = await prisma.lead.update({
        where: { id: availability.lead.id },
        data: {
          storeName: data.storeName,
          ownerName: data.ownerName,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          notes: formattedNotes,
          status: initialStatus,
          // Perpanjang masa proteksi 30 hari lagi dari check-in baru
          protectedUntil,
        },
      });

      const visitLog = await prisma.visitLog.create({
        data: {
          leadId: updatedLead.id,
          salesId: data.salesId,
          notes: formattedNotes || 'Kunjungan lanjutan prospek.',
          photoUrl: data.photoUrl,
          statusAtVisit: updatedLead.status,
        },
      });

      return { lead: updatedLead, visitLog };
    }

    // Buat prospek baru (atau klaim toko yang sebelumnya sudah expired)
    const newLead = await prisma.lead.create({
      data: {
        salesId: data.salesId,
        storeName: data.storeName,
        ownerName: data.ownerName,
        phone: cleanPhone,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        notes: formattedNotes,
        status: initialStatus,
        protectedUntil,
      },
    });

    const visitLog = await prisma.visitLog.create({
      data: {
        leadId: newLead.id,
        salesId: data.salesId,
        notes: formattedNotes || 'Check-in kunjungan baru.',
        photoUrl: data.photoUrl,
        statusAtVisit: initialStatus,
      },
    });

    return { lead: newLead, visitLog };
  }

  /**
   * Update status pipeline: NEW -> DEMO -> DEAL -> LOST
   */
  static async updatePipelineStatus(
    leadId: string,
    salesId: string,
    status: LeadStatus,
    notes?: string
  ) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Data prospek tidak ditemukan.');
    }

    if (lead.salesId !== salesId) {
      throw new Error('Anda tidak memiliki hak akses untuk mengubah status prospek ini.');
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        notes: notes ? `${lead.notes ? lead.notes + ' | ' : ''}${notes}` : lead.notes,
      },
    });

    // Catat log kunjungan / aktivitas pipeline
    await prisma.visitLog.create({
      data: {
        leadId: lead.id,
        salesId,
        notes: notes || `Perubahan status pipeline menjadi ${status}.`,
        statusAtVisit: status,
      },
    });

    return updatedLead;
  }

  /**
   * Cron Job: Mengubah prospek yang belum DEAL dan sudah melewati 30 hari menjadi EXPIRED
   */
  static async expireStaleLeads(): Promise<number> {
    const now = new Date();
    const result = await prisma.lead.updateMany({
      where: {
        status: {
          notIn: [LeadStatus.DEAL, LeadStatus.LOST, LeadStatus.EXPIRED],
        },
        protectedUntil: {
          lte: now,
        },
      },
      data: {
        status: LeadStatus.EXPIRED,
      },
    });

    return result.count;
  }
}
