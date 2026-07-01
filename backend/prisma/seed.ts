import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始播种种子数据...\n');

  // ======================== 默认角色 ========================
  const roles = [
    { code: 'super_admin', name: '超级管理员', description: '系统超级管理员，拥有所有权限' },
    { code: 'owner', name: '老板/店主', description: '门店所有者，可管理门店所有业务' },
    { code: 'store_manager', name: '店长', description: '门店日常管理，审核采购/退货/盘点' },
    { code: 'salesperson', name: '销售员', description: '扫码销售、查询库存、积分操作' },
    { code: 'inventory_keeper', name: '库管', description: '入库扫码、盘点、库存管理' },
    { code: 'finance', name: '财务', description: '提成结算、对账、国补管理' },
  ];

  for (const role of roles) {
    await prisma.sysRole.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
  console.log(`✅ 已创建/更新 ${roles.length} 个默认角色`);

  // ======================== 默认门店 ========================
  const shop = await prisma.shop.upsert({
    where: { shopNo: 'SHOP001' },
    update: { name: '3C数码旗舰店' },
    create: {
      shopNo: 'SHOP001',
      name: '3C数码旗舰店',
      address: '深圳市南山区科技园路1号',
      contactPhone: '075512345678',
      status: 'open',
    },
  });
  console.log(`✅ 默认门店: ${shop.name} (${shop.shopNo})`);

  // ======================== 默认管理员 ========================
  const adminRole = await prisma.sysRole.findUnique({ where: { code: 'super_admin' } });
  if (!adminRole) throw new Error('super_admin 角色不存在');

  const adminPhone = '13900000001';
  const adminPassword = 'admin123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.sysUser.findUnique({ where: { phone: adminPhone } });

  if (!existingAdmin) {
    const admin = await prisma.sysUser.create({
      data: {
        phone: adminPhone,
        name: '系统管理员',
        passwordHash,
        shopId: shop.id,
        status: 'active',
        userRoles: { create: { roleId: adminRole.id } },
      },
    });
    console.log(`✅ 默认管理员: ${admin.phone} / ${adminPassword} (ID: ${admin.id})`);
  } else {
    console.log(`⏭️  默认管理员已存在: ${adminPhone}`);
  }

  // ======================== 示例测试用户 ========================
  const salesRole = await prisma.sysRole.findUnique({ where: { code: 'salesperson' } });
  const testPhone = '13900000002';

  const existingTest = await prisma.sysUser.findUnique({ where: { phone: testPhone } });
  if (!existingTest) {
    const testUser = await prisma.sysUser.create({
      data: {
        phone: testPhone,
        name: '测试销售员',
        passwordHash: await bcrypt.hash('test123', 10),
        shopId: shop.id,
        status: 'active',
        userRoles: salesRole ? { create: { roleId: salesRole.id } } : undefined,
      },
    });
    console.log(`✅ 测试用户: ${testUser.phone} / test123`);
  }

  console.log('\n🎉 种子数据播种完成!');
}

main()
  .catch((e) => {
    console.error('❌ 播种失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
