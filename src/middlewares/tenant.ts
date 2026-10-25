import { Request, Response, NextFunction } from 'express';
import { basePrisma, tenantStorage } from '../config/database';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenant?: any;
}

export const tenantResolutionMiddleware = async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    let resolvedSlug: string | undefined;
    let resolvedId: string | undefined;

    // 1. Check custom headers
    if (req.headers['x-tenant-id']) {
      resolvedId = String(req.headers['x-tenant-id']);
    }
    if (req.headers['x-tenant-slug']) {
      resolvedSlug = String(req.headers['x-tenant-slug']).toLowerCase().trim();
    }

    // 2. Check query parameter e.g. ?tenant=kopisenja
    if (!resolvedSlug && req.query.tenant) {
      resolvedSlug = String(req.query.tenant).toLowerCase().trim();
    }

    // 3. Check Host header (e.g. kopisenja.posmu.cloud or custom domain kasir.kopisenja.id)
    const rawHost = req.hostname || (req.headers.host ? req.headers.host.split(':')[0] : '');
    if (!resolvedSlug && !resolvedId && rawHost) {
      const host = rawHost.toLowerCase();
      // Check if it is a platform subdomain
      if (host.includes('.posmu.cloud') || host.includes('.vimtk.cloud')) {
        const parts = host.split('.');
        if (parts.length >= 3 && parts[0] !== 'api' && parts[0] !== 'admin' && parts[0] !== 'www') {
          resolvedSlug = parts[0];
        }
      } else if (!host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('192.168.')) {
        // Look up by custom domain
        const byCustomDomain = await basePrisma.tenant.findFirst({
          where: { customDomain: host },
        });
        if (byCustomDomain) {
          resolvedId = byCustomDomain.id;
        }
      }
    }

    // 4. Check Authorization Bearer token early if present
    if (!resolvedSlug && !resolvedId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.decode(token) as any;
        if (decoded?.tenantId) {
          resolvedId = decoded.tenantId;
        }
      } catch (e) {
        // ignore
      }
    }

    // 5. Resolve tenant record
    let tenant = null;
    if (resolvedId) {
      tenant = await basePrisma.tenant.findUnique({ where: { id: resolvedId } });
    } else if (resolvedSlug) {
      tenant = await basePrisma.tenant.findUnique({ where: { slug: resolvedSlug } });
    }

    // 5. Fallback: if not resolved and not a superadmin route, fallback to default tenant 'dimsum-intan'
    if (!tenant && !req.path.includes('/superadmin')) {
      tenant = await basePrisma.tenant.findUnique({ where: { slug: 'dimsum-intan' } });
    }

    if (tenant) {
      if (tenant.status === 'SUSPENDED' && !req.path.includes('/superadmin') && !req.path.includes('/public')) {
        return res.status(403).json({
          success: false,
          message: 'Akun bisnis (tenant) ini sedang dinonaktifkan/disuspensi. Silakan hubungi platform admin.',
        });
      }

      req.tenantId = tenant.id;
      req.tenant = tenant;
    }

    // Run downstream request in tenant storage
    tenantStorage.run({ tenantId: req.tenantId }, () => {
      next();
    });
  } catch (err) {
    next(err);
  }
};
