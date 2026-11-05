/**
 * Menormalisasi nomor telepon/WhatsApp ke format standar internasional Indonesia: 628...
 * Menghilangkan spasi, tanda hubung, tanda kurung, dan karakter non-angka.
 * Contoh:
 * - 081234567890   -> 6281234567890
 * - +6281234567890  -> 6281234567890
 * - 6281234567890   -> 6281234567890
 * - 81234567890    -> 6281234567890
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';

  // Hapus semua karakter selain angka
  let cleaned = phone.replace(/[^0-9]/g, '');

  if (cleaned.startsWith('08')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  } else if (cleaned.startsWith('6208')) {
    cleaned = '628' + cleaned.substring(4);
  }

  return cleaned;
}

/**
 * Validasi apakah nomor yang sudah disanitasi merupakan nomor telepon seluler Indonesia yang valid
 */
export function isValidIndonesianMobilePhone(phone: string): boolean {
  const sanitized = sanitizePhoneNumber(phone);
  // Nomor seluler Indonesia 628xx biasanya 10 s/d 14 digit
  return /^628[0-9]{8,12}$/.test(sanitized);
}
