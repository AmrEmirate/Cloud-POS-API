import { Request, Response, NextFunction } from 'express';

/**
 * Security HTTP headers middleware (zero-dependency Helmet equivalent)
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'");

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
};

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory sliding-window rate limiter to protect auth & API endpoints
 */
export const createRateLimiter = ({
  windowMs,
  max,
  keyPrefix,
  message = 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat.',
}: RateLimiterOptions) => {
  const store = new Map<string, RateLimitEntry>();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, Math.max(60_000, windowMs));
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim()) ||
      req.ip ||
      'unknown';
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    const existing = store.get(key);
    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - 1)));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(0, max - existing.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (existing.count > max) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message,
      });
    }

    return next();
  };
};
