import { config } from '../config/env';

export interface StitchThemeConfig {
  colorMode?: string;
  roundness?: string;
  customColor?: string;
  headlineFont?: string;
  bodyFont?: string;
  labelFont?: string;
  namedColors?: Record<string, string>;
  designMd?: string;
}

export interface StitchScreenResult {
  projectId: string;
  projectName: string;
  screenId?: string;
  screenName?: string;
  title?: string;
  previewUrl?: string;
  htmlCode?: string;
  themeColor?: string;
  themeConfig?: StitchThemeConfig;
  designSystemId?: string;
}

export class StitchService {
  private static readonly MCP_URL = 'https://stitch.googleapis.com/mcp';
  private static readonly API_KEY = config.stitchApiKey || process.env.STITCH_API_KEY || '';

  /**
   * Helper untuk mengeksekusi JSON-RPC 2.0 ke Google Stitch MCP
   */
  public static async callMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
    const payload = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
      id: Date.now(),
    };

    const response = await fetch(this.MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Stitch MCP HTTP Error [${response.status}]: ${errText}`);
    }

    const data: any = await response.json();
    if (data.error) {
      throw new Error(`Stitch MCP Error [${data.error.code}]: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * 1. Membuat Project Baru dan Men-generate Layar Mockup POS untuk UMKM
   */
  public static async createTenantUiMockup(input: {
    storeName: string;
    category?: string;
    primaryColor?: string;
    styleNotes?: string;
    referenceImageUrl?: string;
  }): Promise<StitchScreenResult> {
    const storeName = input.storeName.trim();
    const category = input.category || 'F&B (Kafe / Restoran)';
    const primaryColor = input.primaryColor || '#ea580c';
    const styleNotes = input.styleNotes || '';

    // Step 1: Create Stitch Project
    console.log(`[Stitch MCP] Membuat project baru untuk: "${storeName}"...`);
    const projectRes = await this.callMcpTool('create_project', {
      title: `${storeName} - Cloud POS UI`,
    });

    let rawProject: any = {};
    if (projectRes.structuredContent) {
      rawProject = projectRes.structuredContent;
    } else if (projectRes.content && projectRes.content[0]?.text) {
      try {
        rawProject = JSON.parse(projectRes.content[0].text);
      } catch {
        // Fallback
      }
    }

    const projectName = rawProject.name || '';
    const projectId = projectName.replace(/^projects\//, '');

    if (!projectId) {
      throw new Error('Gagal mendapatkan Project ID dari Stitch MCP');
    }

    // Step 2: Formulate prompt and generate screen
    const prompt = [
      `Tablet POS Cashier interface for "${storeName}", business category: ${category}.`,
      `Brand aesthetic & accent color: ${primaryColor}.`,
      `Modern high-conversion point-of-sale layout:`,
      `- Top header with store name "${storeName}", cashier shift indicator, and quick search.`,
      `- Center/Left grid of popular menu/product items with thumbnail cards, price tags, and "+ Tambah" buttons.`,
      `- Right sidebar: Order basket summary with item list, quantity selector, subtotal, PPN, and prominent Quick Pay buttons for QRIS and Cash.`,
      styleNotes ? `Client specific requirements: ${styleNotes}` : '',
      input.referenceImageUrl ? `Design inspiration image: ${input.referenceImageUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    console.log(`[Stitch MCP] Men-generate screen POS untuk project "${projectId}"...`);
    const screenRes = await this.callMcpTool('generate_screen_from_text', {
      projectId,
      prompt,
      deviceType: 'TABLET',
    });

    // Parse screen response
    let screenData: any = {};
    if (screenRes.structuredContent) {
      screenData = screenRes.structuredContent;
    } else if (screenRes.content && screenRes.content[0]?.text) {
      try {
        screenData = JSON.parse(screenRes.content[0].text);
      } catch {
        // Fallback
      }
    }

    const outputComponents = screenData.outputComponents || [];
    let previewUrl: string | undefined;
    let screenId: string | undefined;
    let screenName: string | undefined;
    let themeConfig: StitchThemeConfig | undefined;

    for (const comp of outputComponents) {
      // Support array of screens (Stitch standard)
      const screensList = comp.design?.screens || (comp.design?.screen ? [comp.design.screen] : []);
      for (const s of screensList) {
        screenId = s.id || (s.name ? s.name.split('/').pop() : screenId);
        screenName = s.name || screenName;
        previewUrl = s.screenshot?.downloadUrl || previewUrl;
        if (s.theme) {
          themeConfig = {
            colorMode: s.theme.colorMode,
            roundness: s.theme.roundness,
            customColor: s.theme.customColor || primaryColor,
            headlineFont: s.theme.headlineFont,
            bodyFont: s.theme.bodyFont,
            labelFont: s.theme.labelFont,
            namedColors: s.theme.namedColors,
            designMd: s.theme.designMd,
          };
        }
      }

      if (comp.design?.designTheme) {
        const dt = comp.design.designTheme;
        themeConfig = {
          colorMode: dt.colorMode,
          roundness: dt.roundness,
          customColor: dt.customColor || primaryColor,
          headlineFont: dt.headlineFont,
          bodyFont: dt.bodyFont,
          labelFont: dt.labelFont,
          namedColors: dt.namedColors,
          designMd: dt.designMd,
        };
      }
    }

    return {
      projectId,
      projectName,
      screenId,
      screenName,
      title: `${storeName} Cashier UI`,
      previewUrl,
      themeColor: primaryColor,
      themeConfig,
    };
  }

  /**
   * 2. Melakukan Revisi Layar Desain berdasarkan Feedback UMKM / Sales
   */
  public static async reviseTenantUiMockup(input: {
    projectId: string;
    screenId: string;
    revisionPrompt: string;
  }): Promise<{
    screenId: string;
    previewUrl?: string;
    themeConfig?: StitchThemeConfig;
    message: string;
  }> {
    const { projectId, screenId, revisionPrompt } = input;
    console.log(`[Stitch MCP] Menjalankan revisi untuk project "${projectId}", screen "${screenId}"...`);

    const editRes = await this.callMcpTool('edit_screens', {
      projectId,
      selectedScreenIds: [screenId],
      prompt: revisionPrompt,
      deviceType: 'TABLET',
    });

    let editData: any = {};
    if (editRes.structuredContent) {
      editData = editRes.structuredContent;
    } else if (editRes.content && editRes.content[0]?.text) {
      try {
        editData = JSON.parse(editRes.content[0].text);
      } catch {
        // Fallback
      }
    }

    const outputComponents = editData.outputComponents || [];
    let updatedPreviewUrl: string | undefined;
    let updatedScreenId: string = screenId;
    let updatedTheme: StitchThemeConfig | undefined;

    for (const comp of outputComponents) {
      const screensList = comp.design?.screens || (comp.design?.screen ? [comp.design.screen] : []);
      for (const s of screensList) {
        updatedScreenId = s.id || (s.name ? s.name.split('/').pop() : updatedScreenId);
        updatedPreviewUrl = s.screenshot?.downloadUrl || updatedPreviewUrl;
        if (s.theme) {
          updatedTheme = {
            colorMode: s.theme.colorMode,
            roundness: s.theme.roundness,
            customColor: s.theme.customColor,
            headlineFont: s.theme.headlineFont,
            bodyFont: s.theme.bodyFont,
            labelFont: s.theme.labelFont,
            namedColors: s.theme.namedColors,
            designMd: s.theme.designMd,
          };
        }
      }

      if (comp.design?.designTheme) {
        const dt = comp.design.designTheme;
        updatedTheme = {
          colorMode: dt.colorMode,
          roundness: dt.roundness,
          customColor: dt.customColor,
          headlineFont: dt.headlineFont,
          bodyFont: dt.bodyFont,
          labelFont: dt.labelFont,
          namedColors: dt.namedColors,
          designMd: dt.designMd,
        };
      }
    }

    return {
      screenId: updatedScreenId,
      previewUrl: updatedPreviewUrl,
      themeConfig: updatedTheme,
      message: 'Revisi UI berhasil diterapkan oleh Google Stitch AI',
    };
  }

  /**
   * 3. Mengambil Kode Screen HTML/Tailwind dari Stitch MCP
   */
  public static async fetchScreenCode(fileName: string): Promise<string> {
    const res = await this.callMcpTool('download_file', { name: fileName });
    if (res.content && res.content[0]?.text) {
      return res.content[0].text;
    }
    return '';
  }
}
