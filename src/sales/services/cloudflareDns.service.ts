export class CloudflareDnsService {
  private static readonly API_TOKEN = process.env.CF_API_TOKEN || '';
  private static readonly ZONE_ID = process.env.CF_ZONE_ID_VIMTK || 'ba176fc09d744f34316bad85a56eb0a4';
  private static readonly SERVER_IP = process.env.SERVER_PUBLIC_IP || '72.61.215.164';

  /**
   * Otomatis membuatkan DNS A Record di Cloudflare dengan status Proxied (SSL HTTPS Aktif)
   * Format subdomain: https://pos-[tenantSlug].vimtk.cloud
   */
  public static async createTenantSubdomain(tenantSlug: string): Promise<{
    subdomain: string;
    fullDomain: string;
    liveUrl: string;
    recordId?: string;
  }> {
    const cleanSlug = tenantSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const recordName = `pos-${cleanSlug}.vimtk.cloud`;
    const liveUrl = `https://${recordName}`;

    try {
      console.log(`[Cloudflare DNS] Menyiapkan subdomain otomatis: ${recordName} -> ${this.SERVER_IP}...`);

      // 1. Cek apakah record sudah pernah dibuat
      const checkRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.ZONE_ID}/dns_records?name=${encodeURIComponent(
          recordName
        )}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const checkData: any = await checkRes.json();
      if (checkData.success && checkData.result && checkData.result.length > 0) {
        console.log(`[Cloudflare DNS] Subdomain ${recordName} sudah aktif.`);
        return {
          subdomain: `pos-${cleanSlug}`,
          fullDomain: recordName,
          liveUrl,
          recordId: checkData.result[0].id,
        };
      }

      // 2. Buat DNS A Record baru
      const createRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.ZONE_ID}/dns_records`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'A',
            name: recordName,
            content: this.SERVER_IP,
            proxied: true,
            ttl: 1, // Auto TTL
            comment: `Auto-generated for Cloud POS Tenant: ${cleanSlug}`,
          }),
        }
      );

      const createData: any = await createRes.json();
      if (createData.success && createData.result) {
        console.log(`[Cloudflare DNS] Berhasil membuat DNS Record: ${recordName}`);
        return {
          subdomain: `pos-${cleanSlug}`,
          fullDomain: recordName,
          liveUrl,
          recordId: createData.result.id,
        };
      } else {
        console.warn(`[Cloudflare DNS Warning] Response error:`, createData.errors);
      }
    } catch (err: any) {
      console.error(`[Cloudflare DNS Error] Gagal mendaftarkan subdomain ${recordName}:`, err.message);
    }

    return {
      subdomain: `pos-${cleanSlug}`,
      fullDomain: recordName,
      liveUrl,
    };
  }
}
