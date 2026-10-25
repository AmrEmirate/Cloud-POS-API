import cors from 'cors';
import { basePrisma } from '../config/database';

const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim());

export const dynamicCors = cors({
  origin: async (origin, callback) => {
    // 1. Izinkan request lokal / server internal / mobile apps
    if (!origin) return callback(null, true);

    // 2. Izinkan subdomain utama platform (.posmu.cloud, .vimtk.cloud, localhost, LAN)
    if (
      configuredOrigins.includes(origin) ||
      configuredOrigins.includes('*') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||
      origin.endsWith('.posmu.cloud') ||
      origin.endsWith('.vimtk.cloud')
    ) {
      return callback(null, true);
    }

    // 3. Cek domain kustom klien dari database PostgreSQL
    try {
      const cleanHost = origin.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
      const customTenant = await basePrisma.tenant.findFirst({
        where: { customDomain: cleanHost },
      });

      if (customTenant) {
        return callback(null, true);
      }
    } catch (e) {
      // Fallback ignore
    }

    // Tolak origin yang tidak terdaftar
    return callback(new Error('Origin tidak diizinkan oleh CORS Policy'));
  },
  credentials: true,
});
