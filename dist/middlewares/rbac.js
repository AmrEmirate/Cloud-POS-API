"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOutletAccess = exports.requireRole = void 0;
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Harap masuk terlebih dahulu' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Akses ditolak. Fitur ini hanya untuk peran: ${allowedRoles.join(', ')}`,
            });
        }
        next();
    };
};
exports.requireRole = requireRole;
const requireOutletAccess = (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
    // Owner and Supervisor have access to all 3 outlets
    if (req.user.role === 'OWNER' || req.user.role === 'SUPERVISOR') {
        return next();
    }
    // Kasir is locked to their own outlet
    const targetOutletId = req.params.outletId || req.body.outletId || req.query.outletId;
    if (targetOutletId && req.user.outletId && targetOutletId !== req.user.outletId) {
        return res.status(403).json({
            success: false,
            message: 'Kasir terkunci pada outlet yang ditugaskan!',
        });
    }
    next();
};
exports.requireOutletAccess = requireOutletAccess;
