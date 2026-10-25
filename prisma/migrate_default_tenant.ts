import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Menjalankan inisialisasi Default Tenant & Superadmin...');

  // 1. Buat atau perbarui Tenant default: Dimsum Intan
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'dimsum-intan' },
    update: {
      name: 'Dimsum Intan',
      themeColor: '#ea580c',
      plan: 'PRO',
      status: 'ACTIVE',
    },
    create: {
      id: 'tenant-dimsum-intan',
      name: 'Dimsum Intan',
      slug: 'dimsum-intan',
      themeColor: '#ea580c',
      plan: 'PRO',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Default Tenant aktif: ${defaultTenant.name} (${defaultTenant.slug})`);

  // 2. Hubungkan semua user existing yang belum memiliki tenantId ke Dimsum Intan
  const userUpdate = await prisma.user.updateMany({
    where: {
      tenantId: null,
      role: { not: Role.SUPERADMIN },
    },
    data: {
      tenantId: defaultTenant.id,
    },
  });
  console.log(`✅ ${userUpdate.count} user dihubungkan ke Tenant ${defaultTenant.name}`);

  // 3. Hubungkan semua Outlet, MenuItem, Order, ShiftSession, PettyCash, FactoryInvoice, FixedExpense yang belum ber-tenantId
  await prisma.outlet.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.menuItem.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.order.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.shiftSession.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.pettyCash.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.factoryInvoice.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });
  await prisma.fixedExpense.updateMany({ where: { tenantId: null }, data: { tenantId: defaultTenant.id } });

  // 4. Pastikan Akun SUPERADMIN Platform tersedia
  const superadminPasswordHash = await bcrypt.hash('superadmin123', 10);
  const superadminPinHash = await bcrypt.hash('9999', 10);

  const superadmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {
      role: Role.SUPERADMIN,
      passwordHash: superadminPasswordHash,
      pinHash: superadminPinHash,
    },
    create: {
      id: 'usr_superadmin_01',
      name: 'Superadmin Platform POS',
      username: 'superadmin',
      passwordHash: superadminPasswordHash,
      pinHash: superadminPinHash,
      role: Role.SUPERADMIN,
      tenantId: null,
      outletId: null,
    },
  });
  console.log(`✅ Akun Superadmin Platform siap: ${superadmin.username} (Role: ${superadmin.role})`);
}

main()
  .catch((err) => {
    console.error('❌ Gagal inisialisasi default tenant:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
