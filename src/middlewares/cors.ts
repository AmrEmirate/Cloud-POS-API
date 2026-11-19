import cors from 'cors';
import { basePrisma } from '../config/database';

const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim());

const isLocalOrLanHostname = (hostname: string): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
};

export const dynamicCors = cors({
  origin: async (origin, callback) => {
    // 1. Izinkan request non-browser / server internal / mobile apps
    if (!origin) return callback(null, true);

    if (configuredOrigins.includes(origin) || configuredOrigins.includes('*')) {
      return callback(null, true);
    }

    try {
      const parsed = new URL(origin);
      const hostname = parsed.hostname.toLowerCase();

      // 2. Izinkan subdomain utama platform (.posmu.cloud, .vimtk.cloud, localhost, LAN) secara ketat berdasarkan hostname
      if (
        isLocalOrLanHostname(hostname) ||
        hostname === 'posmu.cloud' ||
        hostname.endsWith('.posmu.cloud') ||
        hostname === 'vimtk.cloud' ||
        hostname.endsWith('.vimtk.cloud')
      ) {
        return callback(null, true);
      }

      // 3. Cek domain kustom klien dari database PostgreSQL
      const customTenant = await basePrisma.tenant.findFirst({
        where: { customDomain: hostname },
      });

      if (customTenant) {
        return callback(null, true);
      }
    } catch {
      // Invalid URL origin
    }

    // Tolak origin yang tidak terdaftar
    return callback(new Error('Origin tidak diizinkan oleh CORS Policy'));
  },
  credentials: true,
});
