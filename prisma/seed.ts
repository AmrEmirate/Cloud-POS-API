import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Menjalankan pembersihan total database Dimsum Intan Multi-Tenant...');

  // 1. Bersihkan SELURUH data tabel
  console.log('🧹 Menghapus data transaksi, menu, shift, kas kecil, biaya, cabang & user...');
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.shiftSession.deleteMany();
  await prisma.pettyCash.deleteMany();
  await prisma.factoryInvoiceItem.deleteMany();
  await prisma.factoryInvoice.deleteMany();
  await prisma.fixedExpense.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.outlet.deleteMany();
  await prisma.tenant.deleteMany();

  // 2. Buat Tenant Default: Dimsum Intan
  console.log('🏢 Membuat Default Tenant: Dimsum Intan...');
  const dimsumTenant = await prisma.tenant.create({
    data: {
      id: 'tenant-dimsum-intan',
      name: 'Dimsum Intan',
      slug: 'dimsum-intan',
      themeColor: '#ea580c',
      plan: 'PRO',
      status: 'ACTIVE',
    },
  });

  // 3. Buat Akun Owner Dimsum Intan
  console.log('👑 Mendaftarkan akun login Owner Dimsum Intan...');
  const ownerPasswordHash = await bcrypt.hash('owner123', 10);
  const ownerPinHash = await bcrypt.hash('9999', 10);

  const owner = await prisma.user.create({
    data: {
      id: 'usr_owner_01',
      tenantId: dimsumTenant.id,
      name: 'Owner Dimsum Intan',
      username: 'owner',
      passwordHash: ownerPasswordHash,
      pinHash: ownerPinHash,
      role: Role.OWNER,
      outletId: null,
    },
  });

  // 4. Buat Akun Superadmin Platform (Pengelola Seluruh Tenant SaaS)
  console.log('🛡️ Mendaftarkan akun Superadmin SaaS...');
  const superadminPasswordHash = await bcrypt.hash('superadmin123', 10);
  const superadminPinHash = await bcrypt.hash('9999', 10);

  const superadmin = await prisma.user.create({
    data: {
      id: 'usr_superadmin_01',
      tenantId: null, // Akses global seluruh platform
      name: 'Superadmin Platform',
      username: 'superadmin',
      passwordHash: superadminPasswordHash,
      pinHash: superadminPinHash,
      role: Role.SUPERADMIN,
      outletId: null,
    },
  });

  console.log('====================================================');
  console.log('✅ DATABASE MULTI-TENANT INITIALIZED');
  console.log(`🏢 Default Tenant: ${dimsumTenant.name} (${dimsumTenant.slug})`);
  console.log('👑 Akun Owner Tenant:');
  console.log(`   - Username : ${owner.username}`);
  console.log('   - Role     : OWNER');
  console.log('🛡️ Akun Superadmin SaaS:');
  console.log(`   - Username : ${superadmin.username}`);
  console.log('   - Role     : SUPERADMIN');
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Terjadi kesalahan saat seeding:', e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
