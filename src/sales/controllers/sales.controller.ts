import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import { LeadStatus, InvoiceStatus, CommissionStatus } from '../constants/enums';
import { sendSuccess, sendError } from '../utils/response';

export class SalesController {
  /**
   * Papan Peringkat Insentif & Performa Sales (Leaderboard)
   * GET /api/sales/leaderboard
   */
  static async getLeaderboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesUsers = await prisma.user.findMany({
        where: { role: 'SALES' },
        select: {
          id: true,
          name: true,
          tier: true,
          outlets: {
            select: { id: true },
          },
          commissions: {
            where: { status: { in: [CommissionStatus.READY, CommissionStatus.WITHDRAWN] } },
            select: { amount: true },
          },
          leads: {
            where: { status: LeadStatus.DEAL },
            select: { id: true },
          },
        },
      });

      const ranking = salesUsers
        .map((s) => {
          const totalDeals = s.leads.length;
          const totalOutlets = s.outlets.length;
          const totalCommissionEarned = s.commissions.reduce((acc, curr) => acc + curr.amount, 0);

          return {
            salesId: s.id,
            name: s.name,
            tier: s.tier,
            totalDeals,
            totalOutlets,
            totalCommissionEarned,
          };
        })
        .sort((a, b) => b.totalCommissionEarned - a.totalCommissionEarned);

      return sendSuccess(res, 'Papan peringkat sales berhasil diambil.', ranking);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Profil Sales, KPI & Tier Komisi
   * GET /api/sales/kpi
   */
  static async getSalesKPI(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;
      const user = await prisma.user.findUnique({
        where: { id: salesId },
        include: {
          _count: {
            select: {
              leads: true,
              outlets: true,
              visits: true,
            },
          },
        },
      });

      if (!user) {
        return sendError(res, 'Sales tidak ditemukan.', 404);
      }

      // Hitung deal leads
      const dealCount = await prisma.lead.count({
        where: { salesId, status: LeadStatus.DEAL },
      });

      // Hitung total komisi
      const commissionsAgg = await prisma.commission.aggregate({
        where: { salesId },
        _sum: { amount: true },
      });

      // Conversion rate = (dealCount / totalLeads) * 100
      const totalLeads = user._count.leads;
      const closingRate = totalLeads > 0 ? ((dealCount / totalLeads) * 100).toFixed(1) : '0';

      // Tentukan Tier Komisi (Silver, Gold, Platinum berdasarkan outlet aktif)
      let currentTier = 'Silver';
      let nextTierTarget = 10;
      if (user._count.outlets >= 20) {
        currentTier = 'Platinum';
        nextTierTarget = 50;
      } else if (user._count.outlets >= 10) {
        currentTier = 'Gold';
        nextTierTarget = 20;
      }

      return sendSuccess(res, 'Data performa dan KPI sales berhasil diambil.', {
        sales: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          tier: currentTier,
          commissionRate: user.commissionRate,
          npwp: user.npwp,
        },
        kpi: {
          totalVisits: user._count.visits,
          totalLeads,
          totalDeals: dealCount,
          activeOutlets: user._count.outlets,
          closingRate: `${closingRate}%`,
          totalCommissionEarned: commissionsAgg._sum.amount || 0,
          tierProgress: {
            currentTier,
            outletsCount: user._count.outlets,
            nextTierTarget,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Peta Rute Kunjungan & Optimasi Wilayah Sales
   * GET /api/sales/routes-map
   */
  static async getSalesRouteMap(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const salesId = req.user!.userId;

      // Ambil seluruh prospek sales yang memiliki koordinat GPS
      const leadsWithLocation = await prisma.lead.findMany({
        where: {
          salesId,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          storeName: true,
          ownerName: true,
          phone: true,
          address: true,
          latitude: true,
          longitude: true,
          status: true,
          protectedUntil: true,
          visits: {
            orderBy: { visitDate: 'desc' },
            take: 1,
            select: { visitDate: true, notes: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return sendSuccess(res, 'Data peta rute kunjungan sales berhasil diambil.', leadsWithLocation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Kalkulator ROI Simulasi Keuntungan Outlet POS
   * POST /api/tools/roi-calculator
   */
  static async calculateROI(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { monthlyTransactions, averageBasketSize, leakageEstimatePercentage } = req.body;

      const transactions = monthlyTransactions ? parseFloat(monthlyTransactions) : 1000;
      const basketSize = averageBasketSize ? parseFloat(averageBasketSize) : 25000;
      const leakagePct = leakageEstimatePercentage ? parseFloat(leakageEstimatePercentage) : 5; // perkiraan kebocoran stok/kas tanpa POS

      const estimatedGrossRevenue = transactions * basketSize;
      const estimatedSavedLeakage = (estimatedGrossRevenue * leakagePct) / 100;
      const monthlyPosCost = 150000; // Biaya langganan Protek POS
      const netMonthlyBenefit = estimatedSavedLeakage - monthlyPosCost;
      const roiRatio = ((netMonthlyBenefit / monthlyPosCost) * 100).toFixed(0);

      return sendSuccess(res, 'Perhitungan simulasi ROI outlet POS berhasil dihitung.', {
        input: {
          monthlyTransactions: transactions,
          averageBasketSize: basketSize,
          leakageEstimatePercentage: leakagePct,
          monthlyPosCost,
        },
        result: {
          estimatedGrossRevenue,
          estimatedSavedLeakage,
          netMonthlyBenefit,
          roiRatio: `${roiRatio}%`,
          summaryText: `Dengan sistem Protek POS, potensi efisiensi kebocoran kas & stok diperkirakan mencapai Rp ${estimatedSavedLeakage.toLocaleString('id-ID')}/bulan. Keuntungan bersih setelah biaya sistem: Rp ${netMonthlyBenefit.toLocaleString('id-ID')}/bulan.`,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
