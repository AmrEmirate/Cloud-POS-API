"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = require("./app");
const PORT = process.env.PORT || 3000;
app_1.app.listen(PORT, () => {
    console.log(`[Dimsum Intan API Server] Aktif pada port http://localhost:${PORT}`);
    console.log(`[API v1 Endpoint] http://localhost:${PORT}/api/v1/health`);
});
