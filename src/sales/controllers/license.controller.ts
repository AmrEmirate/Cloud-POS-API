import { Request, Response, NextFunction } from 'express';
import { LicenseService } from '../services/license.service';
import { sendSuccess, sendError } from '../utils/response';

export class LicenseController {
  /**
   * Heartbeat Ping Endpoint dari Aplikasi Kasir / Outlet POS
   * POST /api/license/heartbeat
   * Public endpoint (diakses oleh mesin kasir dengan licenseKey)
   */
  static async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const { licenseKey, machineId } = req.body;

      if (!licenseKey) {
        return sendError(res, 'Kunci lisensi (licenseKey) wajib disertakan.', 400);
      }

      const result = await LicenseService.processHeartbeat(licenseKey, machineId);

      // Status HTTP 200 dengan status payload ACTIVE atau SUSPENDED
      return sendSuccess(res, result.message, result);
    } catch (error) {
      next(error);
    }
  }
}
