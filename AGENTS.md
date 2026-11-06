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

### B. Pengujian Black-Box & White-Box Testing (Targeted / Khusus Fitur yang Diubah - Mandatory)
Setelah lolos `tsc`, Agent **WAJIB** menjalankan pengujian Black-box dan White-box yang difokuskan secara spesifik (**targeted**) **hanya pada fitur, modul, atau endpoint yang diubah/diperbaiki** agar cepat dan efisien:
```bash
npm test -- <path_file_test_terkait>
# Atau via Docker runner:
docker run --rm -v "$(pwd)":/app -w /app node:22-alpine npm test -- <path_file_test_terkait>
```
* **White-Box Testing** (`src/__tests__/`):
  - Pengujian logika hashing, JWT, matematika finansial, payment gateway BYOK, RBAC permissions, wallet constraints, atau lisensi pada modul yang diubah.
* **Black-Box Testing** (`src/__tests__/apiBlackBox.test.ts`):
  - Pengujian kontrak REST API publik dan guard otorisasi untuk endpoint yang dimodifikasi.
* **Syarat Lolos**: 100% test pada fitur yang diubah lulus tanpa kegagalan (0 failures).

---

## 2. Siklus Perbaikan Otomatis (Auto-Fix & Re-Check Loop)
* Jika hasil pengecekan `tsc` maupun test suite menghasilkan error atau kegagalan:
  1. **Dilarang menyerahkan kode error atau melapor selesai sebelum diperbaiki.**
  2. Analisis pesan error dan log kegagalan test secara seksama (file, baris, assertion, dan akar penyebab).
  3. Lakukan perbaikan langsung (*auto-fix*) pada file yang bermasalah.
  4. Jalankan ulang `npx tsc --noEmit` dan ulangi eksekusi test targeted pada fitur tersebut hingga **0 error dan 100% test lulus**.
  5. Laporkan ke user ringkasan perbaikan yang telah dilakukan.

---

## 3. Alur Deployment & Verifikasi Berhasil Terdeploy
1. **Cloud CI/CD & Anti-Server Load**: Seluruh build Docker image produksi dilakukan di cloud GitHub Actions (`ubuntu-latest`) dan di-push ke GHCR (`ghcr.io/amremirate/cloud-pos-api:latest`). Dilarang kompilasi berat langsung di VPS.
2. **Wajib Memastikan Berhasil Terdeploy**: Agent wajib memverifikasi bahwa perubahan berhasil terdeploy secara sempurna di lingkungan produksi (build GitHub Actions sukses, webhook Coolify terpanggil, dan kontainer API di VPS telah ter-refresh dan berstatus running/healthy).

---

## 4. Standar Fokus Eksklusif pada Website/Layanan Aktif (Anti-Ganggu Layanan Tidur)
1. **Hanya Kerjakan Layanan yang Sedang Berjalan (Active / Running Only):**
   - Setiap tugas pengerjaan, penambahan fitur, konfigurasi, debugging, atau perbaikan HANYA boleh difokuskan pada website, aplikasi, atau kontainer yang saat ini sedang aktif/berjalan (*running* di server).
2. **Larangan Menyentuh Website/Layanan yang Mati ("Sedang Ditidurkan"):**
   - Jika ada website, repositori, sub-aplikasi, atau kontainer yang berstatus mati (*exited*, *stopped*, atau sengaja dinonaktifkan/ditidurkan oleh USER):
     - **Dilarang keras menyentuh, mengubah file/kode, mengubah rute proxy/DNS, mencoba menghidupkan, atau mengotak-atiknya.**
     - Biarkan layanan tersebut tetap dalam kondisi tidur/non-aktif (*leave sleeping services untouched*), kecuali jika USER secara eksplisit dan tertulis memberikan perintah untuk mengaktifkan kembali layanan tersebut.
