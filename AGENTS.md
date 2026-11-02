# Antigravity Agent Guidelines & Workflow Rules

Instruksi dan aturan kerja otomatis untuk AI Agent dalam pengembangan **Cloud POS Core API (Backend Engine)**:

---

## 1. Aturan Wajib Pasca-Pengerjaan Backend (Post-Task Validation)
Setiap kali selesai mengerjakan atau memodifikasi kode di Cloud POS API (`Backend`), Agent **WAJIB** menjalankan langkah validasi berikut:

### A. Validasi Prisma & TypeScript (`tsc --noEmit`)
```bash
npx prisma generate
npx tsc --noEmit
# Atau via Docker runner jika node lokal tidak tersedia:
docker run --rm -v "$(pwd)":/app -w /app node:22-alpine sh -c "npx prisma generate && npx tsc --noEmit"
```
* **Syarat Lolos**: 0 error kompilasi (Exit code `0`). Tidak boleh ada missing imports, Prisma schema mismatch, atau broken interfaces.

### B. Pengujian Black-Box & White-Box Testing (Mandatory)
Setelah lolos `tsc`, Agent **WAJIB** menjalankan suite pengujian:
```bash
npm test
# Atau via Docker runner:
docker run --rm -v "$(pwd)":/app -w /app node:22-alpine npm test
```
* **White-Box Testing** (`src/__tests__/`):
  - Pengujian logika hashing kata sandi & JWT (`authAndToken.test.ts`), matematika finansial & kode menu POS (`posBusinessMath.test.ts`), payment gateway Midtrans & Duitku (`paymentGateway.test.ts`, `duitkuService.test.ts`), RBAC permissions (`rbac.test.ts`), wallet constraints (`walletService.test.ts`), dan paket langganan (`plans.test.ts`).
* **Black-Box Testing** (`src/__tests__/apiBlackBox.test.ts`):
  - Pengujian kontrak REST API publik dan guard otorisasi RBAC Superadmin/Owner/Kasir.
* **Syarat Lolos**: 100% test lulus tanpa kegagalan (0 failures).

---

## 2. Siklus Perbaikan Otomatis (Auto-Fix & Re-Check Loop)
* Jika hasil pengecekan `tsc` maupun test suite menghasilkan error atau kegagalan:
  1. **Dilarang menyerahkan kode error atau melapor selesai sebelum diperbaiki.**
  2. Analisis pesan error dan log kegagalan test secara seksama (file, baris, assertion, dan akar penyebab).
  3. Lakukan perbaikan langsung (*auto-fix*) pada file yang bermasalah.
  4. Jalankan ulang `npx tsc --noEmit` dan ulangi eksekusi test suite hingga **0 error dan 100% test lulus**.
  5. Laporkan ke user ringkasan perbaikan yang telah dilakukan.
