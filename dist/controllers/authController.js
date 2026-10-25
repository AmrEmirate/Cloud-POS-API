"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.createUser = exports.getUsers = exports.updatePin = exports.getMe = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const JWT_SECRET = process.env.JWT_SECRET || 'dimsum_intan_super_secure_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password wajib diisi',
            });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { username },
            include: { outlet: true },
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Pengguna tidak ditemukan atau kredensial salah',
            });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Password yang Anda masukkan salah',
            });
        }
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            outletId: user.outletId,
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({
            success: true,
            message: `Selamat datang, ${user.name}`,
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                outletId: user.outletId,
                outletName: user.outlet ? user.outlet.name : (user.role === 'OWNER' ? 'Seluruh Outlet (Pusat)' : 'Supervisor Area'),
            },
        });
    }
    catch (error) {
        console.error('[Auth Error]', error);
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan server' });
    }
};
exports.login = login;
const getMe = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { outlet: true },
        });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                outletId: user.outletId,
                outletName: user.outlet ? user.outlet.name : (user.role === 'OWNER' ? 'Seluruh Outlet (Pusat)' : 'Supervisor Area'),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getMe = getMe;
const updatePin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
        }
        const { newPin } = req.body;
        if (!newPin || String(newPin).length < 4) {
            return res.status(400).json({ success: false, message: 'PIN minimal 4 digit angka!' });
        }
        const pinHash = await bcryptjs_1.default.hash(String(newPin), 10);
        await database_1.prisma.user.update({
            where: { id: req.user.id },
            data: { pinHash },
        });
        res.json({ success: true, message: 'PIN otorisasi berhasil diperbarui' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal mengubah PIN' });
    }
};
exports.updatePin = updatePin;
const getUsers = async (_req, res) => {
    try {
        const users = await database_1.prisma.user.findMany({
            include: { outlet: true },
            orderBy: { createdAt: 'asc' },
        });
        const formatted = users.map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            role: u.role,
            outletId: u.outletId,
            outletName: u.outlet ? u.outlet.name : (u.role === 'OWNER' ? 'Seluruh Outlet (Pusat)' : 'Supervisor Area'),
            createdAt: u.createdAt,
        }));
        res.json({ success: true, data: formatted });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal mengambil data pengguna' });
    }
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    try {
        const { name, username, password, role, outletId, pin } = req.body;
        if (!name || !username || !password || !role) {
            return res.status(400).json({
                success: false,
                message: 'Nama, username, password, dan peran (role) wajib diisi!',
            });
        }
        const cleanUsername = String(username).trim().toLowerCase();
        const existing = await database_1.prisma.user.findUnique({
            where: { username: cleanUsername },
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Username "${cleanUsername}" sudah digunakan!`,
            });
        }
        const passwordHash = await bcryptjs_1.default.hash(String(password), 10);
        const pinHash = pin ? await bcryptjs_1.default.hash(String(pin), 10) : null;
        const newUser = await database_1.prisma.user.create({
            data: {
                name: String(name).trim(),
                username: cleanUsername,
                passwordHash,
                pinHash,
                role,
                outletId: outletId || null,
            },
            include: { outlet: true },
        });
        res.status(201).json({
            success: true,
            message: `Akun ${newUser.name} (${newUser.role}) berhasil didaftarkan!`,
            data: {
                id: newUser.id,
                name: newUser.name,
                username: newUser.username,
                role: newUser.role,
                outletId: newUser.outletId,
                outletName: newUser.outlet ? newUser.outlet.name : (newUser.role === 'OWNER' ? 'Seluruh Outlet (Pusat)' : 'Supervisor Area'),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal menambahkan pengguna' });
    }
};
exports.createUser = createUser;
const deleteUser = async (req, res) => {
    try {
        const id = String(req.params.id);
        if (req.user?.id === id) {
            return res.status(400).json({
                success: false,
                message: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login!',
            });
        }
        const user = await database_1.prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
        }
        if (user.role === 'OWNER') {
            const ownerCount = await database_1.prisma.user.count({ where: { role: 'OWNER' } });
            if (ownerCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Tidak dapat menghapus akun Owner utama terakhir!',
                });
            }
        }
        await database_1.prisma.user.delete({ where: { id } });
        res.json({ success: true, message: 'Akun staf berhasil dihapus!' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Gagal menghapus pengguna' });
    }
};
exports.deleteUser = deleteUser;
