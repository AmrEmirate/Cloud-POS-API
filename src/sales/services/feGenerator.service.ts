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
  ownerUsername?: string;
  ownerPassword?: string;
  planCode?: string;
  monthlyFee?: number;
  outletCount?: number;
  customDomain?: string;
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
      ownerUsername: input.ownerUsername || `owner_${tenantSlug}`,
      ownerPassword: input.ownerPassword || 'Protek2026!Pos',
      planCode: input.planCode || 'PAKET_150K',
      monthlyFee: input.monthlyFee || 150000,
      outletCount: input.outletCount || 1,
      customDomain: input.customDomain || null,
      themeConfig: themeConfig || {},
      isSubscriptionPaid: false, // Menunggu pembayaran bulan pertama
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

    const defaultFeeFormatted = (input.monthlyFee || 150000).toLocaleString('id-ID');
    const totalFirstMonthBill = ((input.monthlyFee || 150000) * (input.outletCount || 1)).toLocaleString('id-ID');

    // Jika Stitch tidak memberikan kode HTML mentah yang lengkap, buat template starter kasir & akuntansi
    if (!rawHtml || !rawHtml.includes('<html')) {
      rawHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <title>${storeName} - Cloud POS & Sistem Akuntansi UMKM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />
  <style>
    :root {
      --brand-primary: ${themeColor};
    }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    .custom-scroll::-webkit-scrollbar {
      height: 4px;
      width: 4px;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 font-sans min-h-screen flex flex-col w-full max-w-full overflow-x-hidden selection:bg-orange-500 selection:text-white">

  <!-- ================= TOP NAVIGATION HEADER ================= -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 py-3 shadow-sm flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-md text-base" style="background-color: var(--brand-primary)">
        ${storeName.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-xs">${storeName}</h1>
          <span id="sub-badge" class="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">Menunggu Pembayaran</span>
        </div>
        <p class="text-[11px] text-slate-500 font-mono">Lisensi: ${licenseKey}</p>
      </div>
    </div>

    <!-- Navigation Tabs & User Action -->
    <div class="flex items-center gap-2">
      <div class="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold text-slate-600">
        <button id="tab-pos" onclick="switchView('pos')" class="px-3 py-1.5 rounded-lg bg-white shadow-sm text-slate-900 flex items-center gap-1.5 transition">
          <span class="material-symbols-outlined text-[16px]">point_of_sale</span>
          <span class="hidden sm:inline">Kasir POS</span>
        </button>
        <button id="tab-accounting" onclick="switchView('accounting')" class="px-3 py-1.5 rounded-lg hover:text-slate-900 flex items-center gap-1.5 transition">
          <span class="material-symbols-outlined text-[16px]">account_balance_wallet</span>
          <span class="hidden sm:inline">Akuntansi & Shift</span>
        </button>
      </div>

      <div id="user-profile-badge" class="flex items-center gap-2 pl-2 border-l border-slate-200">
        <button onclick="openLoginModal()" id="btn-login-header" class="h-9 px-3.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 transition">
          <span class="material-symbols-outlined text-[16px]">lock</span>
          <span>Login Owner</span>
        </button>
      </div>
    </div>
  </header>

  <!-- ================= NOTIFICATION BANNER: SUBSCRIPTION STATUS ================= -->
  <div id="subscription-alert-bar" class="bg-amber-500 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-sm">
    <div class="flex items-center gap-2 truncate">
      <span class="material-symbols-outlined text-[18px]">payment</span>
      <span><strong>Aktivasi Langganan:</strong> Selesaikan pembayaran bulan pertama (Rp ${totalFirstMonthBill}) untuk membuka fitur kasir & akuntansi.</span>
    </div>
    <button onclick="openSubscriptionModal()" class="px-3 py-1 rounded-lg bg-white text-amber-900 font-bold text-[11px] shadow hover:bg-amber-50 transition shrink-0">
      Bayar Sekarang
    </button>
  </div>

  <!-- ================= MAIN CONTENT AREA ================= -->
  <main class="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-6 pb-24 lg:pb-6">
    <!-- VIEW 1: KASIR POS -->
    <div id="view-pos" class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- Left Catalog Area (7 cols on Desktop) -->
      <div class="lg:col-span-7 space-y-4">
        <!-- Search & Filter Category -->
        <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">search</span>
            <input type="text" id="menu-search" oninput="filterMenu()" placeholder="Cari nama menu / produk..." class="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-orange-500 font-medium" />
          </div>

          <!-- Category Chips -->
          <div class="flex items-center gap-2 overflow-x-auto pb-1 custom-scroll text-xs">
            <button onclick="setCategoryFilter('ALL')" class="category-btn active px-3.5 py-1.5 rounded-xl font-bold bg-slate-900 text-white shrink-0">Semua</button>
            <button onclick="setCategoryFilter('Makanan')" class="category-btn px-3.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0">Makanan</button>
            <button onclick="setCategoryFilter('Minuman')" class="category-btn px-3.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0">Minuman</button>
            <button onclick="setCategoryFilter('Snack')" class="category-btn px-3.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0">Snack</button>
          </div>
        </div>

        <!-- Product Cards Grid -->
        <div id="menu-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <!-- Dinamis di-render via JavaScript -->
        </div>
      </div>

      <!-- Right Cart & Payment Area (5 cols on Desktop) -->
      <div class="hidden lg:block lg:col-span-5 space-y-4">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-20">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-orange-600">shopping_cart</span>
              <h2 class="text-sm font-bold text-slate-900">Pesanan Aktif</h2>
            </div>
            <button onclick="clearCart()" class="text-[11px] text-red-500 hover:underline font-bold">Reset</button>
          </div>

          <!-- Cart Item List -->
          <div id="cart-list-desktop" class="space-y-2 max-h-[300px] overflow-y-auto custom-scroll pr-1 text-xs">
            <p class="text-center text-slate-400 py-8">Keranjang belanja kosong.<br/>Klik produk di samping untuk menambah.</p>
          </div>

          <!-- Billing Totals -->
          <div class="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
            <div class="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span id="cart-subtotal-desktop" class="font-semibold text-slate-800">Rp 0</span>
            </div>
            <div class="flex justify-between text-slate-500">
              <span>Pajak (PB1 10%)</span>
              <span id="cart-tax-desktop" class="font-semibold text-slate-800">Rp 0</span>
            </div>
            <div class="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-100 pt-2">
              <span>Total Bayar</span>
              <span id="cart-total-desktop" class="text-orange-600 font-extrabold text-base">Rp 0</span>
            </div>
          </div>

          <!-- Checkout Buttons -->
          <div class="grid grid-cols-2 gap-2 pt-2">
            <button onclick="handleCheckout('QRIS')" class="h-12 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-black transition shadow">
              <span class="material-symbols-outlined text-[18px]">qr_code_scanner</span>
              <span>QRIS Instan</span>
            </button>
            <button onclick="handleCheckout('TUNAI')" class="h-12 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow" style="background-color: var(--brand-primary)">
              <span class="material-symbols-outlined text-[18px]">payments</span>
              <span>Tunai / Cash</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW 2: MODUL AKUNTANSI & REKONSILIASI KAS -->
    <div id="view-accounting" class="hidden space-y-5 animate-in fade-in duration-200">
      <!-- Financial Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs">
        <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Omset Penjualan Hari Ini</span>
          <span id="acc-sales" class="text-base sm:text-xl font-extrabold text-slate-900 block mt-1">Rp 1.450.000</span>
          <span class="text-[10px] text-emerald-600 font-bold block mt-1">&uarr; 18 Transaksi Berhasil</span>
        </div>
        <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">HPP / Modal Bahan Pokok</span>
          <span id="acc-cogs" class="text-base sm:text-xl font-extrabold text-slate-900 block mt-1">Rp 620.000</span>
          <span class="text-[10px] text-slate-400 block mt-1">HPP Otomatis Terhitung</span>
        </div>
        <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Pengeluaran Kas Kecil</span>
          <span id="acc-expenses" class="text-base sm:text-xl font-extrabold text-amber-600 block mt-1">Rp 75.000</span>
          <span class="text-[10px] text-slate-400 block mt-1">Es batu, kresek, bensin</span>
        </div>
        <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Estimasi Laba Bersih</span>
          <span id="acc-profit" class="text-base sm:text-xl font-extrabold text-emerald-600 block mt-1">Rp 755.000</span>
          <span class="text-[10px] text-emerald-600 font-bold block mt-1">Margin 52.1% Bersih</span>
        </div>
      </div>

      <!-- Accounting Details: Shift Cash Reconciliation & Petty Cash Logs -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Rekonsiliasi Kas Laci Kasir -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 class="font-bold text-slate-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-blue-600">balance</span>
              Rekonsiliasi Shift Kas Laci Kasir
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Shift Pagi Aktif</span>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-500">Modal Awal Laci (Kas Awal):</span>
              <span class="font-bold text-slate-800">Rp 200.000</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-500">Total Penjualan Tunai:</span>
              <span class="font-bold text-slate-800">Rp 850.000</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-500">Penjualan Non-Tunai (QRIS & Transfer):</span>
              <span class="font-bold text-slate-800">Rp 600.000</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-500">Total Kas Fisik yang Wajib Ada di Laci:</span>
              <span class="font-black text-slate-900 text-sm">Rp 975.000</span>
            </div>
          </div>
          <button onclick="alert('Rekonsiliasi Shift Kas Berhasil Disimpan!')" class="w-full h-10 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition">
            Tutup Shift & Cetak Rekonsiliasi Kas
          </button>
        </div>

        <!-- Buku Kas Kecil (Petty Cash) -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 class="font-bold text-slate-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-amber-600">receipt_long</span>
              Buku Pengeluaran Kas Kecil
            </h3>
            <button onclick="addExpensePrompt()" class="text-orange-600 font-bold hover:underline">+ Catat Beban</button>
          </div>
          <div class="space-y-2 max-h-[160px] overflow-y-auto custom-scroll">
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
              <div>
                <span class="font-bold text-slate-800 block">Beli Es Batu Kristal (3 pack)</span>
                <span class="text-[10px] text-slate-400">10:15 WIB &bull; Operasional</span>
              </div>
              <span class="font-bold text-red-600">-Rp 30.000</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
              <div>
                <span class="font-bold text-slate-800 block">Galon Air Minum (2 galon)</span>
                <span class="text-[10px] text-slate-400">12:30 WIB &bull; Bahan Baku</span>
              </div>
              <span class="font-bold text-red-600">-Rp 45.000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- ================= STICKY MOBILE BOTTOM BAR (UNTUK LAYAR HP) ================= -->
  <div class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 p-3 shadow-lg flex items-center justify-between gap-3">
    <div class="flex flex-col">
      <span class="text-[10px] text-slate-400 font-medium">Total Pesanan (<span id="cart-count-mobile">0</span> item)</span>
      <span id="cart-total-mobile" class="text-base font-extrabold text-orange-600">Rp 0</span>
    </div>
    <button onclick="toggleMobileCartDrawer()" class="h-11 px-5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-md transition" style="background-color: var(--brand-primary)">
      <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
      <span>Lihat Pesanan & Bayar</span>
    </button>
  </div>

  <!-- ================= MOBILE CART DRAWER (BOTTOM SHEET) ================= -->
  <div id="mobile-cart-drawer" class="hidden lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col justify-end">
    <div class="bg-white rounded-t-3xl p-5 max-h-[85vh] flex flex-col space-y-4 animate-in slide-in-from-bottom duration-200">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 class="text-sm font-bold text-slate-900">Rincian Keranjang Kasir</h3>
        <button onclick="toggleMobileCartDrawer()" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">&times;</button>
      </div>

      <div id="cart-list-mobile" class="flex-1 overflow-y-auto custom-scroll space-y-2 max-h-[240px] text-xs">
        <!-- Rendered by JS -->
      </div>

      <div class="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
        <div class="flex justify-between text-slate-500">
          <span>Subtotal</span>
          <span id="drawer-subtotal" class="font-bold text-slate-800">Rp 0</span>
        </div>
        <div class="flex justify-between font-black text-slate-900 text-sm">
          <span>Total Bayar</span>
          <span id="drawer-total" class="text-orange-600 font-extrabold">Rp 0</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 pt-1">
        <button onclick="handleCheckout('QRIS')" class="h-12 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1">
          <span class="material-symbols-outlined text-[18px]">qr_code_scanner</span>
          <span>QRIS Instan</span>
        </button>
        <button onclick="handleCheckout('TUNAI')" class="h-12 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1" style="background-color: var(--brand-primary)">
          <span class="material-symbols-outlined text-[18px]">payments</span>
          <span>Bayar Tunai</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ================= MODAL LOGIN OWNER UMKM ================= -->
  <div id="login-modal" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
      <div class="text-center space-y-1">
        <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white text-xl font-bold mb-2" style="background-color: var(--brand-primary)">
          ${storeName.slice(0, 2).toUpperCase()}
        </div>
        <h3 class="text-base font-bold text-slate-900">Login Pemilik Toko</h3>
        <p class="text-xs text-slate-500">Masuk menggunakan kredensial yang dibuat sales</p>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Username Login</label>
          <input type="text" id="login-username" value="${input.ownerUsername || `owner_${tenantSlug}`}" class="w-full h-10 px-3 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 font-mono text-xs font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Password</label>
          <input type="password" id="login-password" value="${input.ownerPassword || 'Protek2026!Pos'}" class="w-full h-10 px-3 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 text-xs font-medium" />
        </div>
        <button onclick="submitLogin()" class="w-full h-11 rounded-xl text-white font-bold text-xs shadow-md transition" style="background-color: var(--brand-primary)">
          Masuk ke Sistem Kasir
        </button>
      </div>
    </div>
  </div>

  <!-- ================= MODAL SUBSCRIPTION GATE (PEMBAYARAN BULAN PERTAMA) ================= -->
  <div id="subscription-modal" class="hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
      <div class="flex items-start justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
            <span class="material-symbols-outlined text-[24px]">verified</span>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Aktivasi Langganan Bulan ke-1</h3>
            <p class="text-xs text-slate-500">Paket: ${input.planCode || 'PAKET_150K'} (${input.outletCount || 1} Outlet)</p>
          </div>
        </div>
        <button onclick="closeSubscriptionModal()" class="text-slate-400 hover:text-slate-700 text-lg font-bold">&times;</button>
      </div>

      <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
        <div class="flex justify-between text-slate-600">
          <span>Biaya Langganan Bulanan:</span>
          <span class="font-bold text-slate-900">Rp ${defaultFeeFormatted} / Outlet</span>
        </div>
        <div class="flex justify-between text-slate-600">
          <span>Jumlah Outlet Didaftarkan:</span>
          <span class="font-bold text-slate-900">${input.outletCount || 1} Outlet</span>
        </div>
        <div class="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-orange-600">
          <span>Total Tagihan Pertama:</span>
          <span>Rp ${totalFirstMonthBill}</span>
        </div>
      </div>

      <!-- QRIS Code Mockup -->
      <div class="p-4 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
        <span class="text-[11px] font-bold text-slate-600 block">Scan QRIS untuk Bayar Langganan Bulanan</span>
        <div class="w-36 h-36 bg-slate-100 mx-auto rounded-xl border border-slate-300 flex items-center justify-center p-2">
          <!-- Mock QR Code SVG -->
          <svg class="w-full h-full text-slate-800" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm8-2h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3zm-2-2h2v2h-2v-2z"/>
          </svg>
        </div>
        <p class="text-[10px] text-slate-400 font-mono">NMID: ID202611029871 &bull; Duitku / Midtrans Gateway</p>
      </div>

      <div class="space-y-2">
        <button onclick="confirmSubscriptionPayment()" class="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition">
          <span class="material-symbols-outlined text-[18px]">task_alt</span>
          <span>Konfirmasi Pembayaran Langganan Berhasil</span>
        </button>
        <p class="text-[11px] text-center text-slate-400">
          Setelah diverifikasi, sistem kasir & akuntansi langsung aktif 100% dan siap dipakai operasional harian.
        </p>
      </div>
    </div>
  </div>

  <!-- JAVASCRIPT STATE & INTERACTIVITY -->
  <script>
    let currentCategory = 'ALL';
    let isUserLoggedIn = false;
    let isSubPaid = false;

    const sampleProducts = [
      { id: 'MNU-001', name: 'Paket Dimsum Komplit 12 Pcs', category: 'Makanan', price: 38000, cogs: 18000 },
      { id: 'MNU-002', name: 'Dimsum Mentai Mozarella', category: 'Makanan', price: 28000, cogs: 13000 },
      { id: 'MNU-003', name: 'Lumpia Kulit Tahu Krispi', category: 'Makanan', price: 22000, cogs: 9500 },
      { id: 'MNU-004', name: 'Es Kopi Susu Aren Gula Jawa', category: 'Minuman', price: 18000, cogs: 7000 },
      { id: 'MNU-005', name: 'Lemon Tea Segar Dingin', category: 'Minuman', price: 12000, cogs: 4000 },
      { id: 'MNU-006', name: 'Pangsit Goreng Mayo Mayo', category: 'Snack', price: 15000, cogs: 6000 }
    ];

    function renderMenu() {
      const grid = document.getElementById('menu-grid');
      const search = (document.getElementById('menu-search')?.value || '').toLowerCase();
      grid.innerHTML = '';

      const filtered = sampleProducts.filter(p => {
        const matchCat = currentCategory === 'ALL' || p.category === currentCategory;
        const matchSearch = p.name.toLowerCase().includes(search);
        return matchCat && matchSearch;
      });

      filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-orange-500 transition cursor-pointer flex flex-col justify-between';
        card.onclick = () => addToCart(p);
        card.innerHTML = \`
          <div class="space-y-1">
            <span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full inline-block">\${p.category}</span>
            <h4 class="text-xs font-bold text-slate-800 line-clamp-2 mt-1">\${p.name}</h4>
          </div>
          <div class="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
            <span class="text-xs font-extrabold text-slate-900">Rp \${p.price.toLocaleString('id-ID')}</span>
            <div class="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs hover:bg-orange-600 hover:text-white transition">+</div>
          </div>
        \`;
        grid.appendChild(card);
      });
    }

    function addToCart(product) {
      if (!isSubPaid) {
        openSubscriptionModal();
        return;
      }
      const existing = window.POS_STATE.cart.find(it => it.id === product.id);
      if (existing) {
        existing.qty += 1;
      } else {
        window.POS_STATE.cart.push({ ...product, qty: 1 });
      }
      updateCartUI();
    }

    function updateCartUI() {
      const cart = window.POS_STATE.cart;
      const count = cart.reduce((sum, it) => sum + it.qty, 0);
      const subtotal = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
      const tax = Math.round(subtotal * 0.1);
      const total = subtotal + tax;

      // Update Desktop Cart
      const listD = document.getElementById('cart-list-desktop');
      const listM = document.getElementById('cart-list-mobile');
      if (cart.length === 0) {
        listD.innerHTML = '<p class="text-center text-slate-400 py-8">Keranjang belanja kosong.<br/>Klik produk di samping untuk menambah.</p>';
        listM.innerHTML = '<p class="text-center text-slate-400 py-4">Keranjang belanja kosong.</p>';
      } else {
        const renderItem = it => \`
          <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div class="truncate max-w-[150px]">
              <span class="font-bold text-slate-800 block truncate">\${it.name}</span>
              <span class="text-[10px] text-slate-500">Rp \${it.price.toLocaleString('id-ID')} x \${it.qty}</span>
            </div>
            <div class="flex items-center gap-1.5 font-bold text-xs">
              <button onclick="changeQty('\${it.id}', -1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center">-</button>
              <span class="w-4 text-center">\${it.qty}</span>
              <button onclick="changeQty('\${it.id}', 1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center">+</button>
            </div>
          </div>
        \`;
        listD.innerHTML = cart.map(renderItem).join('');
        listM.innerHTML = cart.map(renderItem).join('');
      }

      document.getElementById('cart-subtotal-desktop').innerText = 'Rp ' + subtotal.toLocaleString('id-ID');
      document.getElementById('cart-tax-desktop').innerText = 'Rp ' + tax.toLocaleString('id-ID');
      document.getElementById('cart-total-desktop').innerText = 'Rp ' + total.toLocaleString('id-ID');

      // Update Mobile Sticky Bottom Bar
      document.getElementById('cart-count-mobile').innerText = count;
      document.getElementById('cart-total-mobile').innerText = 'Rp ' + total.toLocaleString('id-ID');
      document.getElementById('drawer-subtotal').innerText = 'Rp ' + subtotal.toLocaleString('id-ID');
      document.getElementById('drawer-total').innerText = 'Rp ' + total.toLocaleString('id-ID');
    }

    function changeQty(id, delta) {
      const item = window.POS_STATE.cart.find(it => it.id === id);
      if (!item) return;
      item.qty += delta;
      if (item.qty <= 0) {
        window.POS_STATE.cart = window.POS_STATE.cart.filter(it => it.id !== id);
      }
      updateCartUI();
    }

    function clearCart() {
      window.POS_STATE.cart = [];
      updateCartUI();
    }

    function handleCheckout(method) {
      if (!isSubPaid) {
        openSubscriptionModal();
        return;
      }
      if (window.POS_STATE.cart.length === 0) {
        alert('Keranjang belanja kosong! Pilih menu terlebih dahulu.');
        return;
      }
      const totalStr = document.getElementById('cart-total-desktop').innerText;
      alert(\`Pembayaran \${method} senilai \${totalStr} Berhasil Dicatat!\\nStruk transaksi diterbitkan dan tercatat di Modul Akuntansi.\`);
      clearCart();
      const drawer = document.getElementById('mobile-cart-drawer');
      if (drawer) drawer.classList.add('hidden');
    }

    function setCategoryFilter(cat) {
      currentCategory = cat;
      document.querySelectorAll('.category-btn').forEach(btn => {
        if (btn.innerText === (cat === 'ALL' ? 'Semua' : cat)) {
          btn.className = 'category-btn active px-3.5 py-1.5 rounded-xl font-bold bg-slate-900 text-white shrink-0';
        } else {
          btn.className = 'category-btn px-3.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0';
        }
      });
      renderMenu();
    }

    function filterMenu() {
      renderMenu();
    }

    function switchView(view) {
      if (view === 'accounting') {
        document.getElementById('view-pos').classList.add('hidden');
        document.getElementById('view-accounting').classList.remove('hidden');
        document.getElementById('tab-accounting').className = 'px-3 py-1.5 rounded-lg bg-white shadow-sm text-slate-900 flex items-center gap-1.5 transition font-bold';
        document.getElementById('tab-pos').className = 'px-3 py-1.5 rounded-lg hover:text-slate-900 flex items-center gap-1.5 transition text-slate-600 font-bold';
      } else {
        document.getElementById('view-accounting').classList.add('hidden');
        document.getElementById('view-pos').classList.remove('hidden');
        document.getElementById('tab-pos').className = 'px-3 py-1.5 rounded-lg bg-white shadow-sm text-slate-900 flex items-center gap-1.5 transition font-bold';
        document.getElementById('tab-accounting').className = 'px-3 py-1.5 rounded-lg hover:text-slate-900 flex items-center gap-1.5 transition text-slate-600 font-bold';
      }
    }

    function toggleMobileCartDrawer() {
      const drawer = document.getElementById('mobile-cart-drawer');
      drawer.classList.toggle('hidden');
    }

    function openLoginModal() {
      document.getElementById('login-modal').classList.remove('hidden');
    }

    function submitLogin() {
      isUserLoggedIn = true;
      document.getElementById('login-modal').classList.add('hidden');
      document.getElementById('user-profile-badge').innerHTML = \`
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">OW</div>
          <span class="text-xs font-bold text-slate-800 hidden sm:inline">Owner Aktif</span>
        </div>
      \`;
      alert('Login Owner Berhasil! Selamat datang di sistem POS & Akuntansi ${storeName}.');
      if (!isSubPaid) {
        openSubscriptionModal();
      }
    }

    function openSubscriptionModal() {
      document.getElementById('subscription-modal').classList.remove('hidden');
    }

    function closeSubscriptionModal() {
      document.getElementById('subscription-modal').classList.add('hidden');
    }

    function confirmSubscriptionPayment() {
      isSubPaid = true;
      closeSubscriptionModal();
      document.getElementById('subscription-alert-bar').style.display = 'none';
      const badge = document.getElementById('sub-badge');
      if (badge) {
        badge.className = 'hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        badge.innerText = 'Langganan Aktif (Lunas)';
      }
      alert('Selamat! Pembayaran langganan bulan pertama telah diverifikasi.\\nSeluruh fitur kasir dan pembukuan akuntansi kini terbuka penuh!');
    }

    function addExpensePrompt() {
      const note = prompt('Masukkan keterangan pengeluaran kas kecil (contoh: Beli Gas Elpiji 3kg):');
      if (!note) return;
      const amtStr = prompt('Masukkan nominal pengeluaran (angka saja):', '25000');
      if (!amtStr) return;
      alert(\`Pengeluaran "\${note}" sebesar Rp \${parseInt(amtStr).toLocaleString('id-ID')} berhasil dicatat di buku kas kecil!\`);
    }

    document.addEventListener('DOMContentLoaded', () => {
      renderMenu();
    });
  </script>

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
