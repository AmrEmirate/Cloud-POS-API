import { Request, Response } from 'express';
import { basePrisma } from '../config/database';

export const getTenantMeta = async (req: Request, res: Response) => {
  try {
    const slug = (req.params.slug || req.query.slug || req.headers['x-tenant-slug']) as string | undefined;
    const domain = (req.query.domain || req.hostname) as string | undefined;

    let tenant = null;

    if (slug) {
      tenant = await basePrisma.tenant.findUnique({
        where: { slug: slug.toLowerCase().trim() },
      });
    }

    if (!tenant && domain && !domain.includes('localhost') && !domain.includes('127.0.0.1')) {
      tenant = await basePrisma.tenant.findFirst({
        where: { customDomain: domain.toLowerCase().trim() },
      });
    }

    // Default fallback to dimsum-intan
    if (!tenant) {
      tenant = await basePrisma.tenant.findUnique({
        where: { slug: 'dimsum-intan' },
      });
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant metadata tidak ditemukan',
      });
    }

    res.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        customDomain: tenant.customDomain,
        logoUrl: tenant.logoUrl,
        themeColor: tenant.themeColor || '#ea580c',
        themeConfig: tenant.themeConfig,
        plan: tenant.plan,
        status: tenant.status,
      },
    });
  } catch (error: any) {
    console.error('[Tenant Meta Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memuat metadata tenant' });
  }
};
