import prisma from '../config/prisma';
import { LeadStatus } from '../constants/enums';
import { sanitizePhoneNumber, maskPhoneNumber } from '../utils/phoneSanitizer';
import { config } from '../config/env';

export interface CheckLeadParams {
  phone?: string;
  name?: string;
  address?: string;
}

export interface CheckLeadResult {
  canClaim: boolean;
  message: string;
  outlet?: any;
  lead?: {
    id: string;
    storeName: string;
    ownerName: string;
    phone: string;
    status: string;
    protectedUntil: Date;
    claimedBy?: string;
    sales: {
      id: string;
      name: string;
      phone: string;
    };
  };
}

export class LeadService {
  /**
   * Pengecekan real-time apakah nomor WhatsApp, nama toko, atau alamat outlet sudah diklaim oleh sales lain
   */
  static async checkLeadAvailability(
    queryOrPhone: string | CheckLeadParams,
    currentSalesId?: string
  ): Promise<CheckLeadResult> {
    let cleanPhone: string | null = null;
    let cleanName: string | null = null;
    let cleanAddress: string | null = null;

    if (typeof queryOrPhone === 'string') {
      cleanPhone = sanitizePhoneNumber(queryOrPhone);
      if (!cleanPhone) {
        throw new Error('Nomor telepon/WhatsApp tidak valid.');
      }
    } else {
      if (queryOrPhone.phone) {
        cleanPhone = sanitizePhoneNumber(queryOrPhone.phone);
      }
      if (queryOrPhone.name && queryOrPhone.name.trim().length >= 3) {
        cleanName = queryOrPhone.name.trim();
      }
      if (queryOrPhone.address && queryOrPhone.address.trim().length >= 3) {
        cleanAddress = queryOrPhone.address.trim();
      }

      if (!cleanPhone && !cleanName && !cleanAddress) {
        throw new Error('Minimal masukkan salah satu: nomor telepon/WA, nama toko, atau alamat.');
      }
    }

    const now = new Date();

    // 1. Cek apakah outlet sudah aktif berlangganan (Approved / Deal)
    const outletOrConditions: any[] = [];
    if (cleanPhone) {
      outletOrConditions.push({ phone: cleanPhone });
      outletOrConditions.push({ phone: { contains: cleanPhone.slice(-9) } });
    }
    if (cleanName) {
      outletOrConditions.push({ name: { contains: cleanName, mode: 'insensitive' } });
    }
    if (cleanAddress) {
      outletOrConditions.push({ address: { contains: cleanAddress, mode: 'insensitive' } });
    }

    let existingOutlet = null;
    if (outletOrConditions.length > 0) {
      existingOutlet = await prisma.outlet.findFirst({
        where: {
          OR: outletOrConditions,
        },
        include: {
          sales: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
            },
          },
          license: true,
        },
      });
    }

    if (existingOutlet) {
      const isOwnedByCurrentSales = currentSalesId && existingOutlet.salesId === currentSalesId;
      const isAdminDirect = existingOutlet.sales.role === 'ADMIN';

      // Sembunyikan nomor telepon jika bukan pemilik langsung (privasi klien resmi)
      const sanitizedOutlet = {
        ...existingOutlet,
        phone: isOwnedByCurrentSales ? existingOutlet.phone : maskPhoneNumber(existingOutlet.phone),
        sales: {
          ...existingOutlet.sales,
          phone: isOwnedByCurrentSales ? existingOutlet.sales.phone : maskPhoneNumber(existingOutlet.sales.phone),
        },
      };

      return {
        canClaim: false,
        message: isOwnedByCurrentSales
          ? `Outlet "${existingOutlet.name}" sudah menjadi klien aktif Anda (Approved / Lunas).`
          : isAdminDirect
          ? `Outlet "${existingOutlet.name}" merupakan merchant resmi binaan langsung Admin HQ (amremi). Terproteksi penuh.`
          : `Outlet "${existingOutlet.name}" sudah menjadi merchant resmi binaan ${existingOutlet.sales.name}. Terproteksi penuh.`,
        outlet: sanitizedOutlet,
      };
    }

    // 2. Cari prospek aktif yang nomor telepon, nama toko, atau alamat sama dan masa proteksi belum habis
    const leadOrConditions: any[] = [];
    if (cleanPhone) {
      leadOrConditions.push({ phone: cleanPhone });
    }
    if (cleanName) {
      leadOrConditions.push({ storeName: { contains: cleanName, mode: 'insensitive' } });
    }
    if (cleanAddress) {
      leadOrConditions.push({ address: { contains: cleanAddress, mode: 'insensitive' } });
    }

    let activeLead = null;
    if (leadOrConditions.length > 0) {
      activeLead = await prisma.lead.findFirst({
        where: {
          protectedUntil: {
            gt: now,
          },
          status: {
            notIn: [LeadStatus.EXPIRED, LeadStatus.LOST],
          },
          OR: leadOrConditions,
        },
        include: {
          sales: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
            },
          },
        },
      });
    }

    if (activeLead) {
      const isOwnedByCurrentSales = currentSalesId && activeLead.salesId === currentSalesId;
      const isAdminDirect = activeLead.sales.role === 'ADMIN';

      // Sembunyikan nomor telepon prospek jika sedang diklaim sales lain
      const sanitizedLead = {
        ...activeLead,
        claimedBy: activeLead.sales.name,
        phone: isOwnedByCurrentSales ? activeLead.phone : maskPhoneNumber(activeLead.phone),
        sales: {
          ...activeLead.sales,
          phone: isOwnedByCurrentSales ? activeLead.sales.phone : maskPhoneNumber(activeLead.sales.phone),
        },
      };

      return {
        canClaim: isOwnedByCurrentSales ? true : false,
        message: isOwnedByCurrentSales
          ? `Outlet "${activeLead.storeName}" sudah Anda klaim sebelumnya dan masa proteksi masih aktif.`
          : isAdminDirect
          ? `Outlet "${activeLead.storeName}" merupakan binaan langsung Admin HQ (amremi). Terproteksi penuh oleh pusat.`
          : `Outlet "${activeLead.storeName}" sedang diprospek oleh ${activeLead.sales.name}. Terkunci hingga ${activeLead.protectedUntil.toLocaleDateString('id-ID')}.`,
        lead: sanitizedLead,
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
