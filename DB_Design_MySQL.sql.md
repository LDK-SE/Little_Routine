# MySQL 数据库设计文档

## 小程序 + 智能体（3C 数码零售）系统

---

## 一、ER 图文字版

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌──────────────┐          ┌──────────────────────┐                          │
│  │   sys_user    │          │    product_sku       │                          │
│  │  (系统用户)    │          │    (商品SKU)          │                          │
│  └──────┬───────┘          └──────────┬───────────┘                          │
│         │ 1                          │ 1                                     │
│         │                            │                                       │
│         │*               ┌───────────┴───────────┐                          │
│  ┌──────┴──────────┐     │                        │                          │
│  │  sales_order    │◄───┐│              ┌─────────┴──────────┐              │
│  │  (销售单)        │    ││              │   stock_ledger     │              │
│  └──────┬──────────┘    ││              │   (库存台账·IMEI)   │              │
│         │               ││              └─────────┬──────────┘              │
│         │               ││                        │                          │
│         │               ││           ┌────────────┴──────────┐              │
│         │               ││           │    audit_log          │              │
│         │               ││           │    (审核日志)          │              │
│         │               ││           └───────────────────────┘              │
│         │               ││                                                  │
│    ┌────┴────────┐  ┌───┴┴──────────┐                                       │
│    │payment_flow │  │  point_ledger  │         ┌──────────────┐             │
│    │ (收款流水)   │  │  (积分流水)     │─────────│   member     │             │
│    └─────────────┘  └───────────────┘         │   (会员)     │             │
│                                                └──────┬───────┘             │
│                                                       │                      │
│                                               ┌───────┴───────┐             │
│                                               │sms_log        │             │
│                                               │(短信记录)      │             │
│                                               └───────────────┘             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

关系说明：
  sys_user     1 ──* sales_order        (一个员工经手多笔销售)
  product_sku  1 ──* stock_ledger       (一个SKU对应多台机器)
  product_sku  1 ──* sales_order        (一个SKU有多笔销售)
  stock_ledger 1 ──1 sales_order        (一台机器对应一笔销售，一对一)
  member       1 ──* sales_order        (一个会员有多笔购买)
  member       1 ──* point_ledger       (一个会员有多条积分流水)
  member       1 ──1 member             (referrer_id 自引用，一级推荐)
  sales_order  1 ──* payment_flow       (一笔订单可有多条收款流水)
  stock_ledger 1 ──* audit_log          (一台机器有多条审核记录)
  member       1 ──* sms_log            (一个会员有多条短信记录)
```

---

## 二、DDL 完整 SQL

### 2.1 sys_user — 系统用户/员工表

```sql
CREATE TABLE `sys_user` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `phone`         VARCHAR(11)  NOT NULL COMMENT '登录手机号',
  `name`          VARCHAR(50)  NOT NULL COMMENT '姓名',
  `role`          ENUM('owner','salesperson','warehouse','warehouse_supervisor') NOT NULL COMMENT '角色',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=在职 0=离职',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入职时间',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户/员工表';
```

### 2.2 product_sku — 商品 SKU 主表

```sql
CREATE TABLE `product_sku` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `brand`         VARCHAR(50)  NOT NULL COMMENT '品牌',
  `model`         VARCHAR(100) NOT NULL COMMENT '型号',
  `color`         VARCHAR(30)  NOT NULL COMMENT '颜色',
  `spec`          VARCHAR(50)  NOT NULL COMMENT '配置(如256GB)',
  `barcode`       VARCHAR(50)           DEFAULT NULL COMMENT '通用条形码(非IMEI，用于型号识别)',
  `retail_price`  DECIMAL(10,2)         DEFAULT NULL COMMENT '建议零售价',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=在售 0=停售',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_brand_model_color_spec` (`brand`, `model`, `color`, `spec`),
  KEY `idx_brand_model` (`brand`, `model`),
  KEY `idx_barcode` (`barcode`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品SKU主表（多规格管理）';
```

### 2.3 stock_ledger — 库存台账（一物一码核心）

```sql
CREATE TABLE `stock_ledger` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `imei`          VARCHAR(20)  NOT NULL COMMENT '手机串码（15-20位）',
  `sku_id`        BIGINT       NOT NULL COMMENT '关联 product_sku.id',
  `batch_no`      VARCHAR(50)           DEFAULT NULL COMMENT '批次号',
  `location`      VARCHAR(50)           DEFAULT NULL COMMENT '货位编号',
  `cost_price`    DECIMAL(10,2)         DEFAULT NULL COMMENT '进货成本（审核通过时写入）',
  `channel`       VARCHAR(50)           DEFAULT NULL COMMENT '进货渠道',
  `status`        ENUM('pending_audit','in_stock','sold','returned') NOT NULL DEFAULT 'pending_audit' COMMENT '库存状态',
  `audit_status`  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `version`       INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库申请时间',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_imei` (`imei`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_status` (`status`),
  KEY `idx_audit_status` (`audit_status`),
  KEY `idx_location` (`location`),
  KEY `idx_batch_no` (`batch_no`),
  KEY `idx_status_location` (`status`, `location`),
  CONSTRAINT `fk_stock_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存台账（IMEI全生命周期管控）';
```

### 2.4 member — 会员表

```sql
CREATE TABLE `member` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `phone`                VARCHAR(11)  NOT NULL COMMENT '联系电话（唯一业务主键）',
  `name`                 VARCHAR(50)           DEFAULT NULL COMMENT '姓名',
  `address`              VARCHAR(200)          DEFAULT NULL COMMENT '居住地',
  `license_plate`        VARCHAR(20)           DEFAULT NULL COMMENT '车号',
  `backup_phone`         VARCHAR(11)           DEFAULT NULL COMMENT '备用电话',
  `last_purchase_model`  VARCHAR(100)          DEFAULT NULL COMMENT '最近购买机型（销售完成后更新）',
  `total_points`         INT          NOT NULL DEFAULT 0 COMMENT '可用积分余额',
  `referrer_id`          BIGINT                DEFAULT NULL COMMENT '推荐人 member.id（仅一级，写入后不可改）',
  `status`               TINYINT      NOT NULL DEFAULT 1 COMMENT '1=正常 0=禁用',
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_referrer_id` (`referrer_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_member_referrer` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员表（含推荐裂变）';
```

### 2.5 sales_order — 销售单（毛利固化）

```sql
CREATE TABLE `sales_order` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_no`             VARCHAR(30)  NOT NULL COMMENT '订单号（雪花算法生成）',
  `imei`                 VARCHAR(20)  NOT NULL COMMENT '关联 stock_ledger.imei',
  `sku_id`               BIGINT       NOT NULL COMMENT '关联 product_sku.id',
  `member_id`            BIGINT                DEFAULT NULL COMMENT '购买会员 member.id',
  `salesperson_id`       BIGINT       NOT NULL COMMENT '销售员 sys_user.id',
  `sale_price`           DECIMAL(10,2) NOT NULL COMMENT '售价',
  `cost_price_snapshot`  DECIMAL(10,2) NOT NULL COMMENT '【固化】成本快照，取自出库时移动加权成本，禁止修改',
  `subsidy_income`       DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '国补收入',
  `commission`           DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '销售员提成（固化）',
  `gross_profit`         DECIMAL(10,2) NOT NULL COMMENT '【固化】毛利 = sale_price + subsidy_income - cost_price_snapshot - commission',
  `payment_method`       VARCHAR(20)  NOT NULL COMMENT '收款方式 cash/wechat/huabei/trade_in/subsidy',
  `actual_paid`          DECIMAL(10,2) NOT NULL COMMENT '实付金额（已扣减积分抵扣）',
  `points_used`          INT          NOT NULL DEFAULT 0 COMMENT '本次使用积分数',
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '销售时间（固化）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_imei` (`imei`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_payment_method` (`payment_method`),
  KEY `idx_salesperson_date` (`salesperson_id`, `created_at`),
  KEY `idx_member_date` (`member_id`, `created_at`),
  CONSTRAINT `fk_order_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_order_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_order_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_order_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售单（成本/毛利固化，禁止修改）';

-- 【安全约束】禁止更新 cost_price_snapshot 和 gross_profit
-- 应用层保证：该表只做 INSERT，不做 UPDATE。审计日志单独记录。
```

### 2.6 point_ledger — 积分流水（账实一致核心）

```sql
CREATE TABLE `point_ledger` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`       BIGINT       NOT NULL COMMENT '会员 member.id',
  `change_type`     ENUM('earn','redeem','expire','referral','manual_adjust') NOT NULL COMMENT '变动类型',
  `amount`          INT          NOT NULL COMMENT '变动积分（正=获取，负=消耗）',
  `balance_after`   INT          NOT NULL COMMENT '变动后余额（冗余快照，用于对账）',
  `order_no`        VARCHAR(30)           DEFAULT NULL COMMENT '关联销售单号（消费得积分/抵现时必填）',
  `order_time`      DATETIME              DEFAULT NULL COMMENT '订单时间（冗余，便于追溯）',
  `product_model`   VARCHAR(100)          DEFAULT NULL COMMENT '购买型号（冗余，便于客服查询）',
  `unit_price`      DECIMAL(10,2)         DEFAULT NULL COMMENT '订单单价（冗余）',
  `quantity`        INT          NOT NULL DEFAULT 1 COMMENT '数量',
  `remark`          VARCHAR(200)          DEFAULT NULL COMMENT '备注',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '流水时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_change_type` (`change_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_member_type_date` (`member_id`, `change_type`, `created_at`),
  CONSTRAINT `fk_point_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分流水表（INSERT ONLY，禁止UPDATE/DELETE）';
```

### 2.7 payment_flow — 收款流水

```sql
CREATE TABLE `payment_flow` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `payment_no`    VARCHAR(30)  NOT NULL COMMENT '收款流水号（雪花算法）',
  `order_no`      VARCHAR(30)  NOT NULL COMMENT '关联销售单号 sales_order.order_no',
  `method`        VARCHAR(20)  NOT NULL COMMENT '收款方式 cash/wechat/huabei/trade_in/subsidy',
  `amount`        DECIMAL(10,2) NOT NULL COMMENT '收款金额',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=成功 0=失败',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收款时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_no` (`payment_no`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_method_date` (`method`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收款流水表';
```

### 2.8 audit_log — 审核日志

```sql
CREATE TABLE `audit_log` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `imei`          VARCHAR(20)  NOT NULL COMMENT '关联串码 stock_ledger.imei',
  `action`        VARCHAR(30)  NOT NULL COMMENT '操作 inbound_apply / inbound_approve / inbound_reject',
  `operator_id`   BIGINT       NOT NULL COMMENT '操作人 sys_user.id',
  `remark`        VARCHAR(200)          DEFAULT NULL COMMENT '备注/驳回原因',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_imei` (`imei`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_action` (`action`),
  KEY `idx_imei_action` (`imei`, `action`),
  CONSTRAINT `fk_audit_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核日志表';
```

### 2.9 sms_log — 短信通知记录

```sql
CREATE TABLE `sms_log` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`     BIGINT                DEFAULT NULL COMMENT '会员 member.id',
  `phone`         VARCHAR(11)  NOT NULL COMMENT '接收手机号',
  `content`       VARCHAR(500) NOT NULL COMMENT '短信内容',
  `scene`         VARCHAR(30)  NOT NULL COMMENT '场景 purchase_notify / points_expire_remind / referral_reward',
  `status`        TINYINT      NOT NULL DEFAULT 0 COMMENT '0=待发送 1=已发送 2=发送失败',
  `sent_at`       DATETIME              DEFAULT NULL COMMENT '实际发送时间',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='短信通知记录表';
```

### 2.10 daily_reconcile — 日终对账记录

```sql
CREATE TABLE `daily_reconcile` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `reconcile_date`    DATE         NOT NULL COMMENT '对账日期',
  `check_type`        VARCHAR(30)  NOT NULL COMMENT '对账类型 stock_vs_order / points_vs_ledger / payment_vs_order',
  `expected_count`    INT          NOT NULL COMMENT '预期数量',
  `actual_count`      INT          NOT NULL COMMENT '实际数量',
  `diff_count`        INT          NOT NULL DEFAULT 0 COMMENT '差异数量',
  `diff_detail`       JSON                  DEFAULT NULL COMMENT '差异明细（JSON格式）',
  `status`            ENUM('pass','fail') NOT NULL COMMENT '对账结果 pass=fail',
  `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '对账时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_type` (`reconcile_date`, `check_type`),
  KEY `idx_status` (`status`),
  KEY `idx_reconcile_date` (`reconcile_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日终对账记录表';
```

---

## 三、关键方案设计

### 3.1 乐观锁防重复销售方案

**原理**：在 `stock_ledger` 表增加 `version` 字段（INT），出库时使用带版本号的 UPDATE，通过受影响行数判断是否冲突。

**出库 SQL 流程**：

```sql
-- Step 1: 查询当前版本号（SELECT）
SELECT id, imei, status, version, cost_price, sku_id
FROM stock_ledger
WHERE imei = '356789012345678'
  AND status = 'in_stock';

-- Step 2: 更新库存状态（带版本号条件的 UPDATE）
UPDATE stock_ledger
SET status    = 'sold',
    version   = version + 1,
    updated_at = NOW()
WHERE imei = '356789012345678'
  AND status = 'in_stock'
  AND version = 0;  -- 来自 Step 1 读取的值

-- Step 3: 检查受影响行数
-- affected_rows = 0 → 并发冲突，回滚事务，返回"该商品已被售出"
-- affected_rows = 1 → 成功，继续写入销售单
```

**应用层伪代码**：
```typescript
// TypeORM 实现
const result = await this.stockRepo.update(
  { imei, status: 'in_stock', version: currentVersion },
  { status: 'sold', version: currentVersion + 1 }
);
if (result.affected === 0) {
  throw new ConflictException('该商品已被售出（并发冲突）');
}
```

### 3.2 积分流水与订单成本不可修改方案

**积分流水（point_ledger）保护：**

| 保护层 | 措施 |
|--------|------|
| 应用层 | DAO 层只暴露 INSERT 方法，不暴露 UPDATE/DELETE |
| 数据库层 | 撤销该表的 UPDATE/DELETE 权限给应用账号 |
| 审计层 | 每天对账 `SUM(point_ledger.amount) WHERE member_id = X` 与 `member.total_points` 是否相等 |
| 修正机制 | 错误不删不改，插入一条 opposite 记录（如多加了 100 分 → 插入一条 -100 分的 manual_adjust 记录） |

**SQL 权限控制**：
```sql
-- 应用账号仅保留 SELECT + INSERT 权限
GRANT SELECT, INSERT ON 3c_retail.point_ledger TO 'app_user'@'%';
REVOKE UPDATE, DELETE ON 3c_retail.point_ledger FROM 'app_user'@'%';
```

**销售单成本固化（sales_order）保护：**

| 保护层 | 措施 |
|--------|------|
| 应用层 | 创建订单后，所有 API 不接收 `cost_price_snapshot` 和 `gross_profit` 的修改参数 |
| 数据库层 | 同 point_ledger，撤销 UPDATE/DELETE |
| 前端 | 订单详情页这两个字段标记为"已固化，不可编辑"，禁用输入控件 |
| 校验层 | 定时任务对 cost_price_snapshot 字段做 hash 校验，发现变更即告警 |

```sql
GRANT SELECT, INSERT ON 3c_retail.sales_order TO 'app_user'@'%';
REVOKE UPDATE, DELETE ON 3c_retail.sales_order FROM 'app_user'@'%';
```

### 3.3 幂等防重方案

```sql
-- 入库申请幂等键
ALTER TABLE stock_ledger ADD UNIQUE KEY `uk_imei_apply` (`imei`);

-- 思路：imei 唯一约束天然防重入库。
-- 对于审核操作，通过 audit_log 的 (imei, action, operator_id) 联合判断。

-- 出库/销售幂等：order_no 唯一约束
-- sales_order.uk_order_no 保证同一笔销售不会写入两次。

-- 收款幂等：payment_no 唯一约束
-- payment_flow.uk_payment_no 保证同一笔收款不会重复入账。
```

---

## 四、完整索引策略

| 表名 | 索引名 | 索引字段 | 类型 | 业务场景 |
|------|--------|---------|------|----------|
| sys_user | uk_phone | phone | UNIQUE | 登录 |
| product_sku | uk_brand_model_color_spec | (brand, model, color, spec) | UNIQUE | 避免重复SKU |
| product_sku | idx_brand_model | (brand, model) | NORMAL | 按品牌型号筛选 |
| product_sku | idx_barcode | barcode | NORMAL | 扫码识别型号 |
| product_sku | idx_status | status | NORMAL | 在售筛选 |
| stock_ledger | uk_imei | imei | UNIQUE | 业务主键、防重入库 |
| stock_ledger | idx_sku_id | sku_id | NORMAL | 按SKU查库存 |
| stock_ledger | idx_status | status | NORMAL | 按状态筛选 |
| stock_ledger | idx_audit_status | audit_status | NORMAL | 待审列表 |
| stock_ledger | idx_location | location | NORMAL | 按货位盘点 |
| stock_ledger | idx_batch_no | batch_no | NORMAL | 按批次追溯 |
| stock_ledger | idx_status_location | (status, location) | COMPOSITE | 查某货位在库设备 |
| member | uk_phone | phone | UNIQUE | 业务主键 |
| member | idx_referrer_id | referrer_id | NORMAL | 查推荐列表 |
| member | idx_created_at | created_at | NORMAL | 会员增长趋势 |
| sales_order | uk_order_no | order_no | UNIQUE | 防重、查单 |
| sales_order | idx_imei | imei | NORMAL | 串码→订单追溯 |
| sales_order | idx_sku_id | sku_id | NORMAL | 按SKU统计销量 |
| sales_order | idx_member_id | member_id | NORMAL | 会员购买记录 |
| sales_order | idx_salesperson_id | salesperson_id | NORMAL | 员工业绩 |
| sales_order | idx_created_at | created_at | NORMAL | 按日期筛选 |
| sales_order | idx_payment_method | payment_method | NORMAL | 按收款方式汇总 |
| sales_order | idx_salesperson_date | (salesperson_id, created_at) | COMPOSITE | 员工某时段业绩 |
| sales_order | idx_member_date | (member_id, created_at) | COMPOSITE | 会员某时段消费 |
| point_ledger | idx_member_id | member_id | NORMAL | 会员积分查询 |
| point_ledger | idx_order_no | order_no | NORMAL | 订单→积分追溯 |
| point_ledger | idx_change_type | change_type | NORMAL | 按类型汇总 |
| point_ledger | idx_created_at | created_at | NORMAL | 按时间筛选 |
| point_ledger | idx_member_type_date | (member_id, change_type, created_at) | COMPOSITE | 会员积分明细查询 |
| payment_flow | uk_payment_no | payment_no | UNIQUE | 防重收款 |
| payment_flow | idx_order_no | order_no | NORMAL | 订单→收款追溯 |
| payment_flow | idx_created_at | created_at | NORMAL | 按时间筛选 |
| payment_flow | idx_method_date | (method, created_at) | COMPOSITE | 按收款方式日汇总 |
| audit_log | idx_imei | imei | NORMAL | 串码审核历程 |
| audit_log | idx_operator_id | operator_id | NORMAL | 审核人操作记录 |
| audit_log | idx_action | action | NORMAL | 按操作类型筛选 |
| audit_log | idx_imei_action | (imei, action) | COMPOSITE | 串码审核状态判定 |
| daily_reconcile | uk_date_type | (reconcile_date, check_type) | UNIQUE | 同类型每天只对账一次 |
| daily_reconcile | idx_status | status | NORMAL | 按结果筛选 |
| daily_reconcile | idx_reconcile_date | reconcile_date | NORMAL | 按日期查 |

---

## 五、各表业务说明

| 表名 | 行预估 | 业务职责 | 不可突破的红线 |
|------|--------|----------|---------------|
| **sys_user** | <100 | 门店员工管理，登录鉴权，角色区分 | 离职后软删除，不清除历史数据 |
| **product_sku** | <5000 | 商品型号多规格管理（品牌+型号+颜色+配置） | 四字段联合唯一，杜绝重复 SKU |
| **stock_ledger** | 1万~50万 | **核心**：IMEI 全生命周期台账，从入库→在库→已售→退货 | version 乐观锁防重售；imei 唯一约束防重入库；审核通过方可销售 |
| **member** | 1000~50万 | 会员基本信息 + 积分总账 + 一级推荐关系 | referrer_id 写入后不可改；total_points 必须 = SUM(point_ledger.amount) |
| **sales_order** | 1万~100万 | **核心**：销售单 + 成本毛利固化 | cost_price_snapshot / gross_profit 写入后禁止任何 UPDATE |
| **point_ledger** | 10万~500万 | **核心**：积分变动明细，账实一致的源头 | INSERT ONLY；错误用负数冲正，不删不改；余额快照用于对账 |
| **payment_flow** | 1万~100万 | 收款流水记录 | payment_no 唯一防重；与订单一一对应 |
| **audit_log** | 1万~50万 | 入库审核全流程记录 | 每条审核操作不可删除 |
| **sms_log** | 5万~200万 | 短信通知记录 | 异步发送，失败可重试 |
| **daily_reconcile** | <10000 | 日终自动化对账结果 | 出现 fail 必须人工确认并修复 |
