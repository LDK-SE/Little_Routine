export enum Role {
  /** 超级管理员 — 跨门店全部权限 */
  SUPER_ADMIN = 'super_admin',

  /** 店长/老板 — 本门店全部权限 */
  OWNER = 'owner',

  /** 销售员 — 销售+会员管理 */
  SALESPERSON = 'salesperson',

  /** 库管 — 库存管理 */
  WAREHOUSE = 'warehouse',

  /** 库管主管 — 库存管理+审核 */
  WAREHOUSE_SUPERVISOR = 'warehouse_supervisor',
}
