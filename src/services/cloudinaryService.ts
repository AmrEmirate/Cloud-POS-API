import crypto from 'crypto';
import fs from 'fs';

export const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'a61epbay',
  apiKey: process.env.CLOUDINARY_API_KEY || '678137155129378',
  apiSecret: process.env.CLOUDINARY_API_SECRET || 'mpAl1RloJmeZE8ethU5X-e9Ob_g',
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'dimsum_intan',
};

/**
 * Upload local file to Cloudinary using signed signature API
 */
export async function uploadFileToCloudinary(
  filePath: string,
  folder = 'dimsum_intan'
): Promise<string> {
  const timestamp = Math.round(Date.now() / 1000);
  const signatureString = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

  const fileData = await fs.promises.readFile(filePath);
  const blob = new Blob([fileData]);

  const formData = new FormData();
  formData.append('file', blob, 'upload.jpg');
  formData.append('api_key', CLOUDINARY_CONFIG.apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = (await res.json()) as any;
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || 'Gagal mengunggah foto ke Cloudinary');
  }

  // Remove temporary local file after successful upload
  try {
    await fs.promises.unlink(filePath);
  } catch {}

  return data.secure_url;
}
