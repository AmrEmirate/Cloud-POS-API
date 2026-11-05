import { LicenseService } from '../../services/license.service';
import prisma from '../../config/prisma';
import { LicenseStatus, InvoiceStatus } from '../../constants/enums';

jest.mock('../../config/prisma', () => {
  const mockLicense = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      license: mockLicense,
    },
    prisma: {
      license: mockLicense,
    },
  };
});

jest.mock('../../services/cloudPosIntegration', () => ({
  CloudPosIntegrationService: {
    syncLicenseToCloudPos: jest.fn().mockResolvedValue({ success: true }),
  },
}));

describe('White Box Testing: license.service.ts (Heartbeat & Remote Kill-Switch)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Branch 1: should return EXPIRED and canOperate=false for non-existent license key', async () => {
    (prisma.license.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await LicenseService.processHeartbeat('INVALID-KEY-999');

    expect(result.status).toBe('EXPIRED');
    expect(result.canOperate).toBe(false);
    expect(result.message).toContain('Kunci lisensi tidak valid');
    expect(result.licenseKey).toBe('INVALID-KEY-999');
  });

  it('Branch 2: should return SUSPENDED when admin has manually turned off the switch', async () => {
    (prisma.license.findUnique as jest.Mock).mockResolvedValue({
      id: 'lic-1',
      licenseKey: 'PROPOS-ACTIVE-01',
      status: LicenseStatus.SUSPENDED,
      suspendedReason: 'Pelanggaran ketentuan penggunaan server POS.',
      outlet: {
        id: 'out-1',
        name: 'Warung Dimsum Intan',
        ownerName: 'Intan Permata',
        invoices: [],
      },
    });
    (prisma.license.update as jest.Mock).mockResolvedValue({});

    const result = await LicenseService.processHeartbeat('PROPOS-ACTIVE-01');

    expect(result.status).toBe('SUSPENDED');
    expect(result.canOperate).toBe(false);
    expect(result.message).toBe('Pelanggaran ketentuan penggunaan server POS.');
    expect(result.paymentInfo?.bankName).toBe('BCA');
    expect(result.paymentInfo?.accountNumber).toBe('8830192831');
  });

  it('Branch 3: should auto-suspend and block operations when an invoice is OVERDUE', async () => {
    const overdueInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-001',
      amount: 150000,
      billingPeriod: 'Oktober 2026',
      dueDate: new Date('2026-10-15'),
      status: InvoiceStatus.OVERDUE,
    };

    (prisma.license.findUnique as jest.Mock).mockResolvedValue({
      id: 'lic-1',
      licenseKey: 'PROPOS-ACTIVE-02',
      status: LicenseStatus.ACTIVE,
      outlet: {
        id: 'out-1',
        name: 'Kedai Kopi Mantap',
        ownerName: 'Budi Santoso',
        invoices: [overdueInvoice],
      },
    });
    (prisma.license.update as jest.Mock).mockResolvedValue({});

    const result = await LicenseService.processHeartbeat('PROPOS-ACTIVE-02');

    expect(result.status).toBe('SUSPENDED');
    expect(result.canOperate).toBe(false);
    expect(result.message).toContain('Akses transaksi dikunci');
    expect(result.invoiceStatus).toBe(InvoiceStatus.OVERDUE);
    expect(result.overdueInvoice?.invoiceNumber).toBe('INV-2026-001');
    expect(result.overdueInvoice?.amount).toBe(150000);
  });

  it('Branch 4: should return ACTIVE and canOperate=true for healthy license without overdue invoices', async () => {
    (prisma.license.findUnique as jest.Mock).mockResolvedValue({
      id: 'lic-1',
      licenseKey: 'PROPOS-HEALTHY-01',
      status: LicenseStatus.ACTIVE,
      outlet: {
        id: 'out-1',
        name: 'Bakso Super Lezat',
        ownerName: 'Hendra Gunawan',
        invoices: [],
      },
    });
    (prisma.license.update as jest.Mock).mockResolvedValue({});

    const result = await LicenseService.processHeartbeat('PROPOS-HEALTHY-01', 'MACHINE-WIN-01');

    expect(result.status).toBe('ACTIVE');
    expect(result.canOperate).toBe(true);
    expect(result.message).toBe('Aplikasi operasional normal.');
    expect(result.outlet?.name).toBe('Bakso Super Lezat');
  });
});

