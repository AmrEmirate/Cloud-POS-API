import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

export interface GenerateTenantFeInput {
  tenantSlug: string;
  storeName: string;
  licenseKey: string;
  themeColor: string;
  themeConfig?: any;
  htmlCode?: string;
  apiUrl?: string;
}

export interface GenerateTenantFeResult {
  tenantDir: string;
  indexHtmlPath: string;
  configPath: string;
  liveUrl: string;
  generatedFiles: string[];
}

export class TenantFeGeneratorService {
  private static readonly BASE_TENANTS_DIR = path.resolve(
    process.cwd(),
    '..',
    'tenants'
  );

  /**
   * Men-generate bundle Frontend mandiri (Dedicated FE) untuk Tenant UMKM
   * dan menyambungkannya langsung ke API Cloud POS Engine.
   */
  public static async generateTenantFrontend(
    input: GenerateTenantFeInput
  ): Promise<GenerateTenantFeResult> {
    const { tenantSlug, storeName, licenseKey, themeColor, themeConfig } = input;
    const apiUrl = input.apiUrl || config.cloudPosApiUrl || 'https://api-pos.vimtk.cloud/api/v1';

    const tenantDir = path.join(this.BASE_TENANTS_DIR, tenantSlug);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    // 1. Simpan Konfigurasi Tenant & Parameter Koneksi BE
    const tenantConfigData = {
      tenantSlug,
      storeName,
      licenseKey,
      apiUrl,
      themeColor,
      themeConfig: themeConfig || {},
      generatedAt: new Date().toISOString(),
      generatorEngine: 'Antigravity Autonomous Stitch-to-Code Pipeline',
    };

    const configPath = path.join(tenantDir, 'tenant-config.json');
    fs.writeFileSync(configPath, JSON.stringify(tenantConfigData, null, 2), 'utf-8');

    // 2. Buat API Bridge Client (JavaScript Connector) untuk menyambungkan UI ke Cloud Pos Api
    const bridgeScript = `/**
 * Cloud POS API Bridge Client
 * Dibuat otomatis oleh Antigravity untuk Tenant: ${storeName} (${tenantSlug})
 * Menghubungkan antarmuka Google Stitch ke Backend Engine Cloud POS
 */
(function() {
  const CONFIG = ${JSON.stringify(tenantConfigData)};
  window.TENANT_CONFIG = CONFIG;

  console.log('[CloudPOS Bridge] Inisialisasi kasir untuk:', CONFIG.storeName);

  // Status Kasir & Keranjang Belanja Global
  window.POS_STATE = {
    cart: [],
    activeShift: null,
    menuItems: [],
    subtotal: 0,
    tax: 0,
    total: 0,
  };

  // 1. Panggil API Menu dari Backend
  async function loadMenuFromBackend() {
    try {
      const res = await fetch(\`\${CONFIG.apiUrl}/menu\`, {
        headers: {
          'x-tenant-slug': CONFIG.tenantSlug,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        window.POS_STATE.menuItems = data.data || [];
        console.log('[CloudPOS Bridge] Menu berhasil dimuat dari Backend:', window.POS_STATE.menuItems.length, 'items');
      }
    } catch (err) {
      console.warn('[CloudPOS Bridge] Menjalankan offline cache fallback:', err.message);
    }
  }

  // 2. Kirim Transaksi Penjualan ke Backend
  async function submitOrderToBackend(paymentMethod, items, receivedAmount) {
    try {
      const payload = {
        outletId: 'PST',
        orderType: 'DINE_IN',
        paymentMethod: paymentMethod || 'QRIS',
        items: items.map(it => ({
          menuItemId: it.id || 'MNU-001',
          quantity: it.qty || 1,
          price: it.price || 15000,
        })),
        cashReceived: receivedAmount || undefined,
      };

      const res = await fetch(\`\${CONFIG.apiUrl}/orders\`, {
        method: 'POST',
        headers: {
          'x-tenant-slug': CONFIG.tenantSlug,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      console.log('[CloudPOS Bridge] Order tersimpan ke Backend Cloud POS:', result);
      return result;
    } catch (err) {
      console.error('[CloudPOS Bridge] Gagal mengirim order:', err);
      throw err;
    }
  }

  // 3. Heartbeat Lisensi Kasir ke Protek
  async function checkLicenseStatus() {
    try {
      const res = await fetch(\`\${CONFIG.apiUrl}/license/heartbeat\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: CONFIG.licenseKey })
      });
      const data = await res.json();
      if (!data.canOperate) {
        alert('Lisensi POS Ditangguhkan: ' + (data.message || 'Hubungi Mitra Sales Protek Anda'));
      }
    } catch (e) {
      // Background ping
    }
  }

  window.CloudPosBridge = {
    loadMenu: loadMenuFromBackend,
    submitOrder: submitOrderToBackend,
    checkLicense: checkLicenseStatus,
  };

  // Jalankan inisialisasi awal
  document.addEventListener('DOMContentLoaded', () => {
    loadMenuFromBackend();
    checkLicenseStatus();
  });
})();
`;

    const bridgePath = path.join(tenantDir, 'api-bridge.js');
    fs.writeFileSync(bridgePath, bridgeScript, 'utf-8');

    // 3. Modifikasi & Simpan index.html dari Stitch Code
    let rawHtml = input.htmlCode || '';
    if (rawHtml.startsWith('{"html":"')) {
      try {
        const parsed = JSON.parse(rawHtml);
        rawHtml = parsed.html || rawHtml;
      } catch {
        // Fallback
      }
    }

    // Jika Stitch tidak memberikan kode HTML mentah, buat template starter kasir
    if (!rawHtml || !rawHtml.includes('<html')) {
      rawHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${storeName} - Kasir POS Cloud</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --brand-primary: ${themeColor};
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-800 font-sans min-h-screen flex flex-col">
  <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow" style="background-color: var(--brand-primary)">
        ${storeName.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <h1 class="text-lg font-bold text-slate-900">${storeName}</h1>
        <p class="text-xs text-slate-500 font-mono">Lisensi: ${licenseKey}</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
      <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
        Kasir Terhubung ke Cloud POS Engine
      </span>
    </div>
  </header>

  <main class="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="md:col-span-2 space-y-4">
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Katalog Menu & Produk</h2>
        <div id="product-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-500 cursor-pointer transition">
            <span class="text-xs font-bold text-slate-800 block">Menu Starter #1</span>
            <span class="text-xs font-semibold text-orange-600 block mt-1">Rp 25.000</span>
          </div>
          <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-500 cursor-pointer transition">
            <span class="text-xs font-bold text-slate-800 block">Menu Starter #2</span>
            <span class="text-xs font-semibold text-orange-600 block mt-1">Rp 18.000</span>
          </div>
          <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-500 cursor-pointer transition">
            <span class="text-xs font-bold text-slate-800 block">Menu Starter #3</span>
            <span class="text-xs font-semibold text-orange-600 block mt-1">Rp 15.000</span>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">Keranjang Belanja</h2>
        <div class="text-xs text-slate-400 py-6 text-center">Pilih produk di sebelah kiri untuk menambah ke pesanan.</div>
        <button class="w-full h-12 rounded-xl text-white font-bold text-sm shadow-md transition" style="background-color: var(--brand-primary)">
          Bayar Sekarang (QRIS / Tunai)
        </button>
      </div>
    </div>
  </main>

  <script src="./api-bridge.js"></script>
</body>
</html>`;
    } else {
      // Injeksi api-bridge.js tepat sebelum </body> pada kode Stitch
      if (rawHtml.includes('</body>')) {
        rawHtml = rawHtml.replace('</body>', '  <script src="./api-bridge.js"></script>\n</body>');
      } else {
        rawHtml += '\n<script src="./api-bridge.js"></script>';
      }
    }

    const indexHtmlPath = path.join(tenantDir, 'index.html');
    fs.writeFileSync(indexHtmlPath, rawHtml, 'utf-8');

    console.log(`[FE Generator] Berhasil men-generate Frontend mandiri untuk "${storeName}" di: ${tenantDir}`);

    return {
      tenantDir,
      indexHtmlPath,
      configPath,
      liveUrl: `https://${tenantSlug}.posmu.cloud`,
      generatedFiles: ['index.html', 'tenant-config.json', 'api-bridge.js'],
    };
  }
}
