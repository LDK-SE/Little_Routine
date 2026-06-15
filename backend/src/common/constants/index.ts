export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/** 可选权限标识（后续可按需扩展为细粒度权限） */
export enum Permission {
  // 商品管理
  PRODUCT_READ = 'product:read',
  PRODUCT_WRITE = 'product:write',

  // 库存管理
  STOCK_READ = 'stock:read',
  STOCK_WRITE = 'stock:write',
  STOCK_AUDIT = 'stock:audit',

  // 销售管理
  SALE_READ = 'sale:read',
  SALE_WRITE = 'sale:write',

  // 会员管理
  MEMBER_READ = 'member:read',
  MEMBER_WRITE = 'member:write',

  // 系统管理
  SYSTEM_ADMIN = 'system:admin',
}
