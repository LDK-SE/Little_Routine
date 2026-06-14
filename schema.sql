-- ============================================================================
-- 3C数码零售系统 · 生产环境数据库 DDL
-- ============================================================================
-- 版本:     V2.0 (基于 PROJECT_CONTEXT.md SSOT)
-- 日期:     2026-06-14
-- 目标规模: 100万订单 / 10万会员 / 10万IMEI / 多门店
-- 数据库:   MySQL 8.0.36+
-- 引擎:     InnoDB
-- 字符集:   utf8mb4 / utf8mb4_unicode_ci
-- 隔离级别: REPEATABLE READ
-- Binlog:   ROW 格式
--
-- 统计:
--   表数量:     32 张
--   分区表:     5 张 (sale_order / sale_item / point_ledger / system_log / ai_chat_log)
--   软删除:     7 张 (shop / sys_user / product / product_sku / member / sale_order / return_order)
--   乐观锁:     2 处 (imei_stock.version / member.total_points_version)
--   INSERT ONLY: 4 张 (sale_order财务字段 / sale_item / point_ledger / stock_ledger)
--   外键:       38 条
--   唯一约束:   18 条
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `3c_retail`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `3c_retail`;

-- 会话级配置
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;   -- 建表期间暂停外键检查，建完后恢复

-- ============================================================================
-- 第一节：基础架构 (4 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. shop — 门店/连锁管理
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 审计字段: created_at + updated_at
-- 预估行数: <100
-- ---------------------------------------------------------------------------
CREATE TABLE `shop` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_no`         VARCHAR(20)     NOT NULL                 COMMENT '门店编号(业务唯一标识)',
  `name`            VARCHAR(100)    NOT NULL                 COMMENT '门店名称',
  `address`         VARCHAR(200)    DEFAULT NULL             COMMENT '门店地址',
  `contact_phone`   VARCHAR(11)     DEFAULT NULL             COMMENT '门店联系电话',
  `status`          TINYINT         NOT NULL DEFAULT 1       COMMENT '1=营业 0=关店',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`      DATETIME        DEFAULT NULL             COMMENT '软删除时间(NULL=未删除)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_no`     (`shop_no`),
  KEY `idx_status`            (`status`),
  KEY `idx_deleted_at`        (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店表(软删除)';


-- ---------------------------------------------------------------------------
-- 2. sys_role — 角色定义
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- 预估行数: <20
-- 预置角色: owner / salesperson / warehouse / warehouse_supervisor / member / ai_agent
-- ---------------------------------------------------------------------------
CREATE TABLE `sys_role` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `code`            VARCHAR(30)     NOT NULL                 COMMENT '角色编码(owner/salesperson/warehouse/warehouse_supervisor/member/ai_agent)',
  `name`            VARCHAR(50)     NOT NULL                 COMMENT '角色名称',
  `description`     VARCHAR(200)    DEFAULT NULL             COMMENT '角色说明',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色定义表';


-- ---------------------------------------------------------------------------
-- 3. sys_user — 系统用户/员工
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id
-- 预估行数: <500
-- 注: password_hash 使用 bcrypt(cost=12)
-- ---------------------------------------------------------------------------
CREATE TABLE `sys_user` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '所属门店',
  `phone`           VARCHAR(11)     NOT NULL                 COMMENT '登录手机号(业务唯一)',
  `name`            VARCHAR(50)     NOT NULL                 COMMENT '姓名',
  `password_hash`   VARCHAR(255)    NOT NULL                 COMMENT '密码哈希(bcrypt, cost=12)',
  `status`          TINYINT         NOT NULL DEFAULT 1       COMMENT '1=在职 0=离职',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '入职时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`      DATETIME        DEFAULT NULL             COMMENT '软删除时间(离职)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone`         (`phone`),
  KEY `idx_shop_id`             (`shop_id`),
  KEY `idx_status`              (`status`),
  KEY `idx_deleted_at`          (`deleted_at`),
  CONSTRAINT `fk_user_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户/员工表(软删除)';


-- ---------------------------------------------------------------------------
-- 4. sys_user_role — 用户-角色关联 (RBAC)
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: user_id → sys_user.id, role_id → sys_role.id
-- 预估行数: <1000
-- ---------------------------------------------------------------------------
CREATE TABLE `sys_user_role` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `user_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '用户ID',
  `role_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '角色ID',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '授权时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role`   (`user_id`, `role_id`),
  KEY `idx_role_id`           (`role_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-角色关联表(RBAC)';


-- ============================================================================
-- 第二节：商品与库存 (6 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5. product — 产品基础信息(SPU)
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 审计字段: created_at + updated_at
-- 预估行数: <1000
-- 注: 按品牌+型号作为唯一标识，一个SPU下可有多个SKU(不同颜色/规格)
-- ---------------------------------------------------------------------------
CREATE TABLE `product` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `brand`           VARCHAR(50)     NOT NULL                 COMMENT '品牌(Apple/Samsung/Huawei/Xiaomi...)',
  `model`           VARCHAR(100)    NOT NULL                 COMMENT '型号(iPhone 16 Pro/Mate 70 Pro...)',
  `category`        VARCHAR(30)     DEFAULT NULL             COMMENT '分类(smartphone/tablet/laptop/accessory)',
  `status`          TINYINT         NOT NULL DEFAULT 1       COMMENT '1=在售 0=停售',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`      DATETIME        DEFAULT NULL             COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_brand_model`   (`brand`, `model`),
  KEY `idx_category`            (`category`),
  KEY `idx_status`              (`status`),
  KEY `idx_deleted_at`          (`deleted_at`),
  KEY `idx_brand_model_status`  (`brand`, `model`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品SPU表(软删除)';


-- ---------------------------------------------------------------------------
-- 6. product_sku — 产品规格(SKU)
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 审计字段: created_at + updated_at
-- FK: product_id → product.id
-- 预估行数: <5000
-- 注: 连锁门店共用同一套SKU体系
-- ---------------------------------------------------------------------------
CREATE TABLE `product_sku` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `product_id`      BIGINT UNSIGNED NOT NULL                 COMMENT '所属SPU',
  `color`           VARCHAR(30)     NOT NULL                 COMMENT '颜色',
  `spec`            VARCHAR(50)     NOT NULL                 COMMENT '规格(存储/运存/网络制式)',
  `barcode`         VARCHAR(50)     DEFAULT NULL             COMMENT '通用条形码(EAN/UPC)',
  `retail_price`    DECIMAL(10,2)   DEFAULT NULL             COMMENT '建议零售价',
  `min_sale_price`  DECIMAL(10,2)   DEFAULT NULL             COMMENT '最低允许售价(NULL=不限制)',
  `status`          TINYINT         NOT NULL DEFAULT 1       COMMENT '1=在售 0=停售',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`      DATETIME        DEFAULT NULL             COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_color_spec` (`product_id`, `color`, `spec`),
  KEY `idx_barcode`                  (`barcode`),
  KEY `idx_status`                   (`status`),
  KEY `idx_deleted_at`               (`deleted_at`),
  CONSTRAINT `fk_sku_product` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品SKU表(软删除, 连锁通用)';


-- ---------------------------------------------------------------------------
-- 7. imei_stock — IMEI库存主表 (IMEI全生命周期)
-- ---------------------------------------------------------------------------
-- 乐观锁: ✅  version INT UNSIGNED
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, sku_id → product_sku.id
-- 预估行数: 10万
-- 状态机: pending_audit → in_stock → sold / returned / frozen
-- 出库SQL模板:
--   UPDATE imei_stock SET status='sold', version=version+1
--   WHERE imei=? AND status='in_stock' AND version=?;
--   → affected_rows=0 表示乐观锁冲突，事务回滚
-- ---------------------------------------------------------------------------
CREATE TABLE `imei_stock` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '所属门店',
  `sku_id`          BIGINT UNSIGNED NOT NULL                 COMMENT '关联 product_sku.id',
  `imei`            VARCHAR(20)     NOT NULL                 COMMENT '手机串码(15-20位, 全局唯一)',
  `batch_no`        VARCHAR(50)     DEFAULT NULL             COMMENT '入库批次号',
  `location`        VARCHAR(50)     DEFAULT NULL             COMMENT '货位编号(如 A-03-12)',
  `cost_price`      DECIMAL(10,2)   DEFAULT NULL             COMMENT '个别计价法成本价(审核通过时固化)',
  `channel`         VARCHAR(50)     DEFAULT NULL             COMMENT '进货渠道',
  `status`          ENUM('pending_audit','in_stock','sold','returned','frozen')
                                    NOT NULL DEFAULT 'pending_audit' COMMENT '库存状态',
  `audit_status`    ENUM('pending','approved','rejected')
                                    NOT NULL DEFAULT 'pending' COMMENT '入库审核状态',
  `version`         INT UNSIGNED    NOT NULL DEFAULT 0       COMMENT '乐观锁版本号(出库防并发)',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '入库申请时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_imei`              (`imei`),
  KEY `idx_shop_id`                 (`shop_id`),
  KEY `idx_sku_id`                  (`sku_id`),
  KEY `idx_status`                  (`status`),
  KEY `idx_audit_status`            (`audit_status`),
  KEY `idx_location`                (`location`),
  KEY `idx_batch_no`                (`batch_no`),
  KEY `idx_shop_status`             (`shop_id`, `status`),
  KEY `idx_sku_status`              (`sku_id`, `status`),
  KEY `idx_status_location`         (`status`, `location`),
  CONSTRAINT `fk_imei_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_imei_sku`  FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IMEI库存主表(乐观锁, 10万IMEI)';


-- ---------------------------------------------------------------------------
-- 8. stock_ledger — 库存变动流水 (INSERT ONLY)
-- ---------------------------------------------------------------------------
-- INSERT ONLY: 应用层禁止 UPDATE/DELETE
-- FK: shop_id → shop.id, imei → imei_stock.imei, operator_id → sys_user.id
-- 预估行数: 50万
-- ---------------------------------------------------------------------------
CREATE TABLE `stock_ledger` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '操作门店',
  `imei`            VARCHAR(20)     NOT NULL                 COMMENT '关联IMEI',
  `change_type`     ENUM('inbound','outbound','return','check_adjust')
                                    NOT NULL                 COMMENT '变动类型(入库/出库/退货/盘点调整)',
  `from_status`     VARCHAR(20)     DEFAULT NULL             COMMENT '变更前状态',
  `to_status`       VARCHAR(20)     NOT NULL                 COMMENT '变更后状态',
  `operator_id`     BIGINT UNSIGNED NOT NULL                 COMMENT '操作人',
  `order_no`        VARCHAR(30)     DEFAULT NULL             COMMENT '关联订单号(销售单/采购单/退货单)',
  `remark`          VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '变动时间',
  PRIMARY KEY (`id`),
  KEY `idx_imei`              (`imei`),
  KEY `idx_shop_id`           (`shop_id`),
  KEY `idx_change_type`       (`change_type`),
  KEY `idx_operator_id`       (`operator_id`),
  KEY `idx_order_no`          (`order_no`),
  KEY `idx_created_at`        (`created_at`),
  KEY `idx_imei_created`      (`imei`, `created_at`),         -- IMEI生命周期追溯
  KEY `idx_shop_type_created` (`shop_id`, `change_type`, `created_at`),
  CONSTRAINT `fk_ledger_shop`     FOREIGN KEY (`shop_id`)     REFERENCES `shop`(`id`)      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ledger_imei`     FOREIGN KEY (`imei`)        REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ledger_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存变动流水(INSERT ONLY, 50万行)';


-- ---------------------------------------------------------------------------
-- 9. purchase_order — 采购订单
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, approved_by → sys_user.id
-- 预估行数: <5万
-- 状态机: pending → approved → received → cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE `purchase_order` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '采购门店',
  `order_no`        VARCHAR(30)     NOT NULL                 COMMENT '采购单号(业务唯一)',
  `supplier_name`   VARCHAR(100)    DEFAULT NULL             COMMENT '供应商名称',
  `supplier_contact` VARCHAR(50)    DEFAULT NULL             COMMENT '供应商联系方式',
  `total_amount`    DECIMAL(10,2)   NOT NULL DEFAULT 0.00    COMMENT '采购总金额',
  `status`          ENUM('pending','approved','received','cancelled')
                                    NOT NULL DEFAULT 'pending' COMMENT '采购单状态',
  `approved_by`     BIGINT UNSIGNED DEFAULT NULL             COMMENT '审核人',
  `approved_at`     DATETIME        DEFAULT NULL             COMMENT '审核时间',
  `received_at`     DATETIME        DEFAULT NULL             COMMENT '收货完成时间',
  `remark`          VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`      DATETIME        DEFAULT NULL             COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_po_no`           (`order_no`),
  KEY `idx_shop_id`               (`shop_id`),
  KEY `idx_status`                (`status`),
  KEY `idx_created_at`            (`created_at`),
  KEY `idx_deleted_at`            (`deleted_at`),
  KEY `idx_shop_status`           (`shop_id`, `status`),
  CONSTRAINT `fk_po_shop`     FOREIGN KEY (`shop_id`)     REFERENCES `shop`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_po_approver` FOREIGN KEY (`approved_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单表(软删除)';


-- ---------------------------------------------------------------------------
-- 10. purchase_item — 采购明细
-- ---------------------------------------------------------------------------
-- 审计字段: created_at
-- FK: purchase_order_id → purchase_order.id, sku_id → product_sku.id
-- 预估行数: <50万
-- ---------------------------------------------------------------------------
CREATE TABLE `purchase_item` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `purchase_order_id` BIGINT UNSIGNED NOT NULL                COMMENT '关联采购单',
  `sku_id`            BIGINT UNSIGNED NOT NULL                COMMENT '关联SKU',
  `imei`              VARCHAR(20)     NOT NULL                COMMENT '采购IMEI',
  `quantity`          INT             NOT NULL DEFAULT 1      COMMENT '数量',
  `unit_cost`         DECIMAL(10,2)   NOT NULL                COMMENT '单价(个别计价法)',
  `subtotal`          DECIMAL(10,2)   NOT NULL                COMMENT '小计(quantity × unit_cost)',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP          COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_po_id`             (`purchase_order_id`),
  KEY `idx_sku_id`            (`sku_id`),
  KEY `idx_imei`              (`imei`),
  KEY `idx_po_sku`            (`purchase_order_id`, `sku_id`),
  CONSTRAINT `fk_pi_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pi_sku`   FOREIGN KEY (`sku_id`)            REFERENCES `product_sku`(`id`)   ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购明细表';


-- ============================================================================
-- 第三节：会员与积分 (3 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 11. member — 会员表 (连锁通用, 不绑定单店)
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at
-- 乐观锁: ✅  total_points_version INT UNSIGNED
-- 审计字段: created_at + updated_at
-- FK: referrer_id → member.id (自引用, 仅一级推荐)
-- 预估行数: 10万
-- 积分并发安全:
--   BEGIN;
--   SELECT total_points, total_points_version FROM member WHERE id=? FOR UPDATE;
--   -- 计算新余额
--   UPDATE member SET total_points=?, total_points_version=total_points_version+1
--   WHERE id=? AND total_points_version=?;
--   → affected_rows=0 表示冲突，回滚重试
--   COMMIT;
-- ---------------------------------------------------------------------------
CREATE TABLE `member` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `phone`                VARCHAR(11)     NOT NULL                COMMENT '手机号(业务唯一)',
  `name`                 VARCHAR(50)     DEFAULT NULL            COMMENT '姓名',
  `address`              VARCHAR(200)    DEFAULT NULL            COMMENT '居住地址',
  `license_plate`        VARCHAR(20)     DEFAULT NULL            COMMENT '车牌号',
  `backup_phone`         VARCHAR(11)     DEFAULT NULL            COMMENT '备用电话',
  `last_purchase_model`  VARCHAR(100)    DEFAULT NULL            COMMENT '最近购买型号',
  `total_points`         INT             NOT NULL DEFAULT 0      COMMENT '可用积分余额',
  `total_points_version` INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '积分乐观锁版本号',
  `referrer_id`          BIGINT UNSIGNED DEFAULT NULL            COMMENT '推荐人 member.id(仅一级, 写入后不可更改)',
  `status`               TINYINT         NOT NULL DEFAULT 1      COMMENT '1=正常 0=禁用',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP          COMMENT '注册时间',
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`           DATETIME        DEFAULT NULL            COMMENT '软删除时间(注销)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone`           (`phone`),
  KEY `idx_referrer_id`           (`referrer_id`),
  KEY `idx_status`                (`status`),
  KEY `idx_created_at`            (`created_at`),
  KEY `idx_deleted_at`            (`deleted_at`),
  CONSTRAINT `fk_member_referrer` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员表(软删除, 乐观锁, 10万会员)';


-- ---------------------------------------------------------------------------
-- 12. member_referral — 推荐关系表
-- ---------------------------------------------------------------------------
-- 审计字段: created_at
-- FK: referrer_id → member.id, referee_id → member.id
-- 预估行数: 10万
-- 注: 推荐关系仅一级, referrer_id+referee_id 唯一
-- ---------------------------------------------------------------------------
CREATE TABLE `member_referral` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `referrer_id`       BIGINT UNSIGNED NOT NULL                 COMMENT '推荐人会员ID',
  `referee_id`        BIGINT UNSIGNED NOT NULL                 COMMENT '被推荐人会员ID',
  `reward_granted`    TINYINT         NOT NULL DEFAULT 0       COMMENT '奖励是否已发放 0=未发放 1=已发放',
  `reward_granted_at` DATETIME        DEFAULT NULL             COMMENT '奖励发放时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '推荐关系建立时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_referrer_referee` (`referrer_id`, `referee_id`),
  KEY `idx_referee_id`             (`referee_id`),
  CONSTRAINT `fk_ref_referrer` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ref_referee`  FOREIGN KEY (`referee_id`)  REFERENCES `member`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='推荐关系表(仅一级推荐)';


-- ---------------------------------------------------------------------------
-- 13. point_ledger — 积分流水 (INSERT ONLY, FIFO过期)
-- ---------------------------------------------------------------------------
-- INSERT ONLY: 应用层禁止 UPDATE/DELETE, 错误用 manual_adjust 负数冲正
-- 分区表:    按 created_at RANGE分区 (每半年一个分区)
-- FK: member_id → member.id
-- 预估行数: 500万
-- FIFO消耗规则:
--   1. 积分按 expires_at 升序排列(先到期先消耗)
--   2. 每次 redeem 从最早的 earn 记录开始扣减 remaining_amount
--   3. expired_amount = 到期日已过且 remaining_amount > 0 的部分
-- ---------------------------------------------------------------------------
CREATE TABLE `point_ledger` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `member_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '会员ID',
  `change_type`       ENUM('earn','redeem','expire','referral','manual_adjust')
                                    NOT NULL                 COMMENT '变动类型',
  `amount`            INT             NOT NULL                 COMMENT '变动积分(正=获取, 负=消耗)',
  `balance_after`     INT             NOT NULL                 COMMENT '变动后余额(快照, 供对账使用)',
  `order_no`          VARCHAR(30)     DEFAULT NULL             COMMENT '关联销售单号(消费得积分/抵现时必填)',
  `order_time`        DATETIME        DEFAULT NULL             COMMENT '订单时间(冗余, 方便查询)',
  `product_model`     VARCHAR(100)    DEFAULT NULL             COMMENT '购买型号(冗余)',
  `unit_price`        DECIMAL(10,2)   DEFAULT NULL             COMMENT '订单单价(冗余)',
  `quantity`          INT             NOT NULL DEFAULT 1       COMMENT '数量',
  `expires_at`        DATE            DEFAULT NULL             COMMENT '过期日期(earn类型=发放年份+1年的12月31日)',
  `expired_amount`    INT             NOT NULL DEFAULT 0       COMMENT '已过期积分(定时任务更新)',
  `remaining_amount`  INT             NOT NULL                 COMMENT '剩余有效积分(earn=amount-expired_amount-已消耗, redeem/expire=0)',
  `remark`            VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '流水时间(分区键)',
  PRIMARY KEY (`id`, `created_at`),
  KEY `idx_member_id`                (`member_id`),
  KEY `idx_order_no`                 (`order_no`),
  KEY `idx_change_type`              (`change_type`),
  KEY `idx_expires_at`               (`expires_at`),
  KEY `idx_member_type_created`      (`member_id`, `change_type`, `created_at`),
  KEY `idx_member_expires_remaining` (`member_id`, `expires_at`, `remaining_amount`),
  CONSTRAINT `fk_point_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='积分流水(INSERT ONLY, FIFO过期, 分区表, 500万行)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ============================================================================
-- 第四节：销售与财务 (5 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 14. sale_order — 销售订单 (财务字段 INSERT ONLY, 软删除)
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at (仅标记删除, 财务数据永久保留)
-- INSERT ONLY: 财务字段(total_cost_snapshot/gross_profit 等)写入后禁止 UPDATE
-- 分区表:    按 created_at RANGE分区
-- FK: shop_id → shop.id, member_id → member.id, salesperson_id → sys_user.id
-- 预估行数: 100万
-- 退货状态: normal → return_requested → returning → returned
-- 允许UPDATE的字段: return_status (事务内)
-- ---------------------------------------------------------------------------
CREATE TABLE `sale_order` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`              BIGINT UNSIGNED NOT NULL                COMMENT '销售门店',
  `order_no`             VARCHAR(30)     NOT NULL                COMMENT '订单号(业务唯一, 雪花ID生成)',
  `member_id`            BIGINT UNSIGNED DEFAULT NULL            COMMENT '购买会员(NULL=散客)',
  `salesperson_id`       BIGINT UNSIGNED NOT NULL                COMMENT '销售员',
  `total_amount`         DECIMAL(10,2)   NOT NULL                COMMENT '【固化】销售总金额(售价合计)',
  `total_cost_snapshot`  DECIMAL(10,2)   NOT NULL                COMMENT '【固化】成本快照合计, 写入后禁止修改',
  `total_subsidy`        DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '【固化】国补合计',
  `total_commission`     DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '【固化】预估提成合计',
  `gross_profit`         DECIMAL(10,2)   NOT NULL                COMMENT '【固化】毛利 = total_amount + total_subsidy - total_cost_snapshot - total_commission',
  `actual_paid`          DECIMAL(10,2)   NOT NULL                COMMENT '实付金额(扣减积分抵现后)',
  `points_used_total`    INT             NOT NULL DEFAULT 0      COMMENT '本次使用积分数',
  `payment_method`       VARCHAR(20)     NOT NULL                COMMENT '收款方式: cash/wechat/alipay/bank_transfer/trade_in/subsidy',
  `return_status`        ENUM('normal','return_requested','returning','returned')
                                         NOT NULL DEFAULT 'normal' COMMENT '退货状态',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '销售时间(分区键)',
  `deleted_at`           DATETIME        DEFAULT NULL            COMMENT '软删除时间(作废)',
  PRIMARY KEY (`id`, `created_at`),
  UNIQUE KEY `uk_order_no`          (`order_no`, `created_at`),
  KEY `idx_shop_id`                 (`shop_id`),
  KEY `idx_member_id`               (`member_id`),
  KEY `idx_salesperson_id`          (`salesperson_id`),
  KEY `idx_payment_method`          (`payment_method`),
  KEY `idx_return_status`           (`return_status`),
  KEY `idx_deleted_at`              (`deleted_at`),
  KEY `idx_shop_created`            (`shop_id`, `created_at`),
  KEY `idx_salesperson_created`     (`salesperson_id`, `created_at`),
  KEY `idx_member_created`          (`member_id`, `created_at`),
  CONSTRAINT `fk_so_shop`        FOREIGN KEY (`shop_id`)        REFERENCES `shop`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_so_member`      FOREIGN KEY (`member_id`)      REFERENCES `member`(`id`)   ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_so_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='销售订单(财务字段INSERT ONLY, 软删除, 分区表, 100万订单)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ---------------------------------------------------------------------------
-- 15. sale_item — 销售明细 (INSERT ONLY)
-- ---------------------------------------------------------------------------
-- INSERT ONLY: 应用层禁止 UPDATE/DELETE
-- 分区表:    按 created_at RANGE分区
-- FK: order_id → sale_order.id, imei → imei_stock.imei, sku_id → product_sku.id
-- 预估行数: 100万
-- ---------------------------------------------------------------------------
CREATE TABLE `sale_item` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_id`             BIGINT UNSIGNED NOT NULL                COMMENT '关联销售订单ID',
  `imei`                 VARCHAR(20)     NOT NULL                COMMENT '销售IMEI',
  `sku_id`               BIGINT UNSIGNED NOT NULL                COMMENT '关联SKU',
  `sale_price`           DECIMAL(10,2)   NOT NULL                COMMENT '【固化】售价',
  `cost_price_snapshot`  DECIMAL(10,2)   NOT NULL                COMMENT '【固化】成本快照(销售时点的个别计价法成本)',
  `subsidy_income`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '【固化】国补收入',
  `commission`           DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '【固化】预估提成',
  `gross_profit`         DECIMAL(10,2)   NOT NULL                COMMENT '【固化】单件毛利 = sale_price + subsidy_income - cost_price_snapshot - commission',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP          COMMENT '创建时间(分区键)',
  PRIMARY KEY (`id`, `created_at`),
  KEY `idx_order_id`              (`order_id`),
  KEY `idx_imei`                  (`imei`),
  KEY `idx_sku_id`                (`sku_id`),
  KEY `idx_order_imei`            (`order_id`, `imei`),
  CONSTRAINT `fk_si_order` FOREIGN KEY (`order_id`) REFERENCES `sale_order`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_si_imei`  FOREIGN KEY (`imei`)    REFERENCES `imei_stock`(`imei`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_si_sku`   FOREIGN KEY (`sku_id`)  REFERENCES `product_sku`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='销售明细(INSERT ONLY, 分区表, 100万行)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ---------------------------------------------------------------------------
-- 16. payment_flow — 收款/退款流水
-- ---------------------------------------------------------------------------
-- 分区表:    按 created_at RANGE分区
-- FK: shop_id → shop.id, order_no → sale_order.order_no
-- 预估行数: 100万
-- 注: payment_type 区分 normal(收款) / refund(退款)
--     refund_amount 记录退款金额(仅退款类型有效)
--     method 包含 refund 枚举用于退款流水
-- ---------------------------------------------------------------------------
CREATE TABLE `payment_flow` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`                 BIGINT UNSIGNED NOT NULL                COMMENT '收款门店',
  `payment_no`              VARCHAR(30)     NOT NULL                COMMENT '收款流水号(业务唯一)',
  `order_no`                VARCHAR(30)     NOT NULL                COMMENT '关联销售单号',
  `method`                  VARCHAR(20)     NOT NULL                COMMENT '收款方式: cash/wechat/alipay/bank_transfer/refund',
  `amount`                  DECIMAL(10,2)   NOT NULL                COMMENT '收款金额',
  `refund_amount`           DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '退款金额(仅退款流水使用)',
  `payment_type`            ENUM('normal','refund')
                                            NOT NULL DEFAULT 'normal' COMMENT '支付类型(normal=收款, refund=退款)',
  `external_transaction_id` VARCHAR(64)     DEFAULT NULL            COMMENT '外部支付平台交易号(微信/支付宝)',
  `reconcile_status`        ENUM('pending','matched','mismatched')
                                            NOT NULL DEFAULT 'pending' COMMENT '对账状态',
  `reconciled_at`           DATETIME        DEFAULT NULL            COMMENT '对账时间',
  `status`                  TINYINT         NOT NULL DEFAULT 1      COMMENT '1=成功 0=失败',
  `created_at`              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP          COMMENT '收款时间(分区键)',
  PRIMARY KEY (`id`, `created_at`),
  UNIQUE KEY `uk_payment_no`          (`payment_no`, `created_at`),
  KEY `idx_shop_id`                   (`shop_id`),
  KEY `idx_order_no`                  (`order_no`),
  KEY `idx_external_transaction_id`   (`external_transaction_id`),
  KEY `idx_reconcile_status`          (`reconcile_status`),
  KEY `idx_payment_type`              (`payment_type`),
  KEY `idx_method_type`               (`method`, `payment_type`),
  KEY `idx_shop_created`              (`shop_id`, `created_at`),
  CONSTRAINT `fk_pf_shop`  FOREIGN KEY (`shop_id`)  REFERENCES `shop`(`id`)       ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pf_order` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='收款流水(分区表, 100万行)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ---------------------------------------------------------------------------
-- 17. return_order — 退货单
-- ---------------------------------------------------------------------------
-- 软删除: ✅  deleted_at (退货单撤销)
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, original_order_no → sale_order.order_no, imei → imei_stock.imei, audited_by → sys_user.id
-- 预估行数: <10万
-- 退货类型: full_return(整单退) / exchange(换货) / refund_only(仅退款)
-- 退货审核通过后触发: 积分冲正 + 提成追回 + 国补追回 + 退款记录
-- ---------------------------------------------------------------------------
CREATE TABLE `return_order` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`             BIGINT UNSIGNED NOT NULL                 COMMENT '退货门店',
  `return_no`           VARCHAR(30)     NOT NULL                 COMMENT '退货单号(业务唯一)',
  `original_order_no`   VARCHAR(30)     NOT NULL                 COMMENT '原销售单号',
  `imei`                VARCHAR(20)     NOT NULL                 COMMENT '退货IMEI',
  `return_reason`       VARCHAR(500)    NOT NULL                 COMMENT '退货原因',
  `return_type`         ENUM('full_return','exchange','refund_only')
                                        NOT NULL                 COMMENT '退货类型',
  `refund_amount`       DECIMAL(10,2)   NOT NULL                 COMMENT '退款金额',
  `points_recalled`     INT             NOT NULL DEFAULT 0       COMMENT '扣回积分',
  `commission_recalled` DECIMAL(10,2)   NOT NULL DEFAULT 0.00    COMMENT '追回提成金额',
  `subsidy_recalled`    DECIMAL(10,2)   NOT NULL DEFAULT 0.00    COMMENT '追回国补金额',
  `audit_status`        ENUM('pending','approved','rejected')
                                        NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `audited_by`          BIGINT UNSIGNED DEFAULT NULL             COMMENT '审核人',
  `audited_at`          DATETIME        DEFAULT NULL             COMMENT '审核时间',
  `completed_at`        DATETIME        DEFAULT NULL             COMMENT '退货完成时间',
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at`          DATETIME        DEFAULT NULL             COMMENT '软删除时间(退货单撤销)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_no`       (`return_no`),
  KEY `idx_shop_id`               (`shop_id`),
  KEY `idx_original_order_no`     (`original_order_no`),
  KEY `idx_imei`                  (`imei`),
  KEY `idx_audit_status`          (`audit_status`),
  KEY `idx_created_at`            (`created_at`),
  KEY `idx_deleted_at`            (`deleted_at`),
  KEY `idx_order_imei`            (`original_order_no`, `imei`),
  CONSTRAINT `fk_ro_shop`    FOREIGN KEY (`shop_id`)           REFERENCES `shop`(`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ro_sale`    FOREIGN KEY (`original_order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ro_imei`    FOREIGN KEY (`imei`)              REFERENCES `imei_stock`(`imei`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ro_auditor` FOREIGN KEY (`audited_by`)        REFERENCES `sys_user`(`id`)         ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退货单(软删除, 审核流程)';


-- ---------------------------------------------------------------------------
-- 18. trade_in_order — 以旧换新订单
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, order_no → sale_order.order_no
-- 预估行数: <50万
-- ---------------------------------------------------------------------------
CREATE TABLE `trade_in_order` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '操作门店',
  `order_no`          VARCHAR(30)     NOT NULL                 COMMENT '关联销售单号(新机)',
  `old_imei`          VARCHAR(20)     DEFAULT NULL             COMMENT '旧机IMEI',
  `old_brand`         VARCHAR(50)     DEFAULT NULL             COMMENT '旧机品牌',
  `old_model`         VARCHAR(100)    DEFAULT NULL             COMMENT '旧机型号',
  `old_condition`     VARCHAR(50)     DEFAULT NULL             COMMENT '旧机成色(good/fair/poor)',
  `appraised_value`   DECIMAL(10,2)   NOT NULL                 COMMENT '旧机估价金额',
  `actual_deduction`  DECIMAL(10,2)   NOT NULL                 COMMENT '实际抵扣金额(≤appraised_value)',
  `remark`            VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_id`     (`shop_id`),
  KEY `idx_order_no`    (`order_no`),
  KEY `idx_old_imei`    (`old_imei`),
  KEY `idx_created_at`  (`created_at`),
  CONSTRAINT `fk_ti_shop`  FOREIGN KEY (`shop_id`)  REFERENCES `shop`(`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ti_order` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='以旧换新订单表';


-- ============================================================================
-- 第五节：提成与国补 (3 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 19. commission_rule — 提成规则配置
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- 预估行数: <100
-- 规则匹配: 按 priority 降序, 命中第一条匹配的规则即停止
-- 类型: fixed(固定金额) / percentage(百分比) / tiered(阶梯)
-- ---------------------------------------------------------------------------
CREATE TABLE `commission_rule` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `brand`             VARCHAR(50)     DEFAULT NULL             COMMENT '适用品牌(NULL=所有品牌)',
  `model`             VARCHAR(100)    DEFAULT NULL             COMMENT '适用型号(NULL=所有型号)',
  `min_price`         DECIMAL(10,2)   DEFAULT NULL             COMMENT '售价区间下限(NULL=不限制)',
  `max_price`         DECIMAL(10,2)   DEFAULT NULL             COMMENT '售价区间上限(NULL=不限制)',
  `commission_type`   ENUM('fixed','percentage','tiered')
                                      NOT NULL DEFAULT 'fixed' COMMENT '提成类型',
  `commission_value`  DECIMAL(10,2)   NOT NULL                 COMMENT '提成值(固定金额/百分比数值/阶梯JSON)',
  `priority`          INT             NOT NULL DEFAULT 0       COMMENT '优先级(数值越大越优先匹配)',
  `status`            TINYINT         NOT NULL DEFAULT 1       COMMENT '1=启用 0=禁用',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_brand_model`       (`brand`, `model`),
  KEY `idx_status_priority`   (`status`, `priority`),
  KEY `idx_price_range`       (`min_price`, `max_price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提成规则配置表';


-- ---------------------------------------------------------------------------
-- 20. commission_ledger — 提成流水/结算
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, salesperson_id → sys_user.id, order_no → sale_order.order_no, confirmed_by → sys_user.id
-- 预估行数: <10万
-- 状态机: pending → confirmed → paid
-- ---------------------------------------------------------------------------
CREATE TABLE `commission_ledger` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`              BIGINT UNSIGNED NOT NULL                COMMENT '结算门店',
  `salesperson_id`       BIGINT UNSIGNED NOT NULL                COMMENT '销售员',
  `settlement_period`    VARCHAR(7)      NOT NULL                COMMENT '结算周期(YYYY-MM)',
  `order_no`             VARCHAR(30)     NOT NULL                COMMENT '关联销售单号',
  `estimated_commission` DECIMAL(10,2)   NOT NULL                COMMENT '预估提成(销售时固化)',
  `adjustment`           DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '调整金额(退货扣减等)',
  `actual_commission`    DECIMAL(10,2)   NOT NULL                COMMENT '实发提成(estimated + adjustment)',
  `status`               ENUM('pending','confirmed','paid')
                                         NOT NULL DEFAULT 'pending' COMMENT '结算状态',
  `confirmed_by`         BIGINT UNSIGNED DEFAULT NULL            COMMENT '确认人',
  `confirmed_at`         DATETIME        DEFAULT NULL            COMMENT '确认时间',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP          COMMENT '创建时间',
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_salesperson_period_order` (`salesperson_id`, `settlement_period`, `order_no`),
  KEY `idx_shop_id`                        (`shop_id`),
  KEY `idx_order_no`                       (`order_no`),
  KEY `idx_settlement_period`              (`settlement_period`),
  KEY `idx_status`                         (`status`),
  CONSTRAINT `fk_cl_shop`        FOREIGN KEY (`shop_id`)        REFERENCES `shop`(`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cl_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`)        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cl_order`       FOREIGN KEY (`order_no`)       REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cl_confirmer`   FOREIGN KEY (`confirmed_by`)   REFERENCES `sys_user`(`id`)        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提成流水/结算表';


-- ---------------------------------------------------------------------------
-- 21. national_subsidy — 国补记录
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, order_no → sale_order.order_no, imei → imei_stock.imei
-- 预估行数: <50万
-- 状态机: pending_submit → submitted → under_review → approved/rejected → disbursed → recalled(退货触发)
-- ---------------------------------------------------------------------------
CREATE TABLE `national_subsidy` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '申请门店',
  `subsidy_no`        VARCHAR(30)     NOT NULL                 COMMENT '补贴申请单号(业务唯一)',
  `order_no`          VARCHAR(30)     NOT NULL                 COMMENT '关联销售单号(一个订单仅一次补贴)',
  `imei`              VARCHAR(20)     NOT NULL                 COMMENT '关联IMEI',
  `applied_amount`    DECIMAL(10,2)   NOT NULL                 COMMENT '申请补贴金额',
  `approved_amount`   DECIMAL(10,2)   DEFAULT NULL             COMMENT '审批通过金额',
  `status`            ENUM('pending_submit','submitted','under_review','approved','rejected','disbursed','recalled')
                                      NOT NULL DEFAULT 'pending_submit' COMMENT '补贴状态',
  `submitted_at`      DATETIME        DEFAULT NULL             COMMENT '提交时间',
  `reviewed_at`       DATETIME        DEFAULT NULL             COMMENT '审核时间',
  `disbursed_at`      DATETIME        DEFAULT NULL             COMMENT '拨付到账时间',
  `recalled_at`       DATETIME        DEFAULT NULL             COMMENT '追回时间(退货触发)',
  `external_ref_no`   VARCHAR(64)     DEFAULT NULL             COMMENT '外部系统参考号(政府平台)',
  `remark`            VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subsidy_no`    (`subsidy_no`),
  UNIQUE KEY `uk_subsidy_order` (`order_no`),
  KEY `idx_shop_id`             (`shop_id`),
  KEY `idx_imei`                (`imei`),
  KEY `idx_status`              (`status`),
  KEY `idx_created_at`          (`created_at`),
  CONSTRAINT `fk_ns_shop`  FOREIGN KEY (`shop_id`)  REFERENCES `shop`(`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ns_order` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ns_imei`  FOREIGN KEY (`imei`)     REFERENCES `imei_stock`(`imei`)     ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国补记录表';


-- ============================================================================
-- 第六节：审计与日志 (3 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 22. audit_log — 入库审核日志
-- ---------------------------------------------------------------------------
-- FK: imei → imei_stock.imei, operator_id → sys_user.id
-- 预估行数: <50万
-- 操作类型: inbound_apply / inbound_approve / inbound_reject / inbound_resubmit
-- ---------------------------------------------------------------------------
CREATE TABLE `audit_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `imei`              VARCHAR(20)     NOT NULL                 COMMENT '关联IMEI',
  `action`            VARCHAR(30)     NOT NULL                 COMMENT '操作: inbound_apply/inbound_approve/inbound_reject/inbound_resubmit',
  `operator_id`       BIGINT UNSIGNED NOT NULL                 COMMENT '操作人',
  `remark`            VARCHAR(200)    DEFAULT NULL             COMMENT '备注/驳回原因',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_imei`              (`imei`),
  KEY `idx_operator_id`       (`operator_id`),
  KEY `idx_action`            (`action`),
  KEY `idx_imei_action`       (`imei`, `action`),
  KEY `idx_created_at`        (`created_at`),
  CONSTRAINT `fk_al_imei`     FOREIGN KEY (`imei`)        REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_al_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库审核日志';


-- ---------------------------------------------------------------------------
-- 23. system_log — 通用操作审计日志
-- ---------------------------------------------------------------------------
-- 分区表: 按 created_at RANGE分区
-- FK: shop_id → shop.id, operator_id → sys_user.id
-- 预估行数: 500万
-- detail_json: 记录操作前后值变更(JSON格式)
-- 审计原则: 日志 INSERT ONLY, 不可删除, 保留至少1年
-- ---------------------------------------------------------------------------
CREATE TABLE `system_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '操作门店',
  `operator_id`       BIGINT UNSIGNED NOT NULL                 COMMENT '操作人',
  `module`            VARCHAR(30)     NOT NULL                 COMMENT '模块: stock/sale/member/point/finance/system',
  `action`            VARCHAR(50)     NOT NULL                 COMMENT '操作: create/update/sale_outbound/return_approve/price_override/manual_adjust',
  `target_type`       VARCHAR(30)     NOT NULL                 COMMENT '操作对象类型: imei_stock/sale_order/member/point_ledger',
  `target_id`         VARCHAR(100)    DEFAULT NULL             COMMENT '操作对象ID/NO',
  `detail_json`       JSON            DEFAULT NULL             COMMENT '操作详情(变更前后值, JSON格式)',
  `ip_address`        VARCHAR(45)     DEFAULT NULL             COMMENT '操作IP(IPv4/IPv6)',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '操作时间(分区键)',
  PRIMARY KEY (`id`, `created_at`),
  KEY `idx_shop_id`             (`shop_id`),
  KEY `idx_operator_id`         (`operator_id`),
  KEY `idx_module_action`       (`module`, `action`),
  KEY `idx_target`              (`target_type`, `target_id`),
  CONSTRAINT `fk_sl_shop`     FOREIGN KEY (`shop_id`)     REFERENCES `shop`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sl_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='通用操作审计日志(INSERT ONLY, 分区表, 500万行)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ---------------------------------------------------------------------------
-- 24. ai_chat_log — AI对话日志
-- ---------------------------------------------------------------------------
-- 分区表: 按 created_at RANGE分区
-- 预估行数: 500万
-- 记录: 每次AI对话的用户/意图/置信度/延迟/是否转人工
-- ---------------------------------------------------------------------------
CREATE TABLE `ai_chat_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `user_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '用户ID(sys_user.id 或 member.id)',
  `user_role`         VARCHAR(20)     NOT NULL                 COMMENT '用户角色: owner/salesperson/member',
  `query`             VARCHAR(1000)   NOT NULL                 COMMENT '用户提问原文',
  `intent`            VARCHAR(50)     DEFAULT NULL             COMMENT '识别意图',
  `function_called`   VARCHAR(50)     DEFAULT NULL             COMMENT '调用的Function名称',
  `confidence`        DECIMAL(5,2)    DEFAULT NULL             COMMENT '置信度(0.00~100.00)',
  `reply`             TEXT            DEFAULT NULL             COMMENT 'AI回复内容',
  `is_transferred`    TINYINT         NOT NULL DEFAULT 0       COMMENT '是否转人工(0=否 1=是)',
  `ticket_id`         VARCHAR(50)     DEFAULT NULL             COMMENT '转人工工单ID',
  `latency_ms`        INT             DEFAULT NULL             COMMENT '响应延迟(毫秒)',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '对话时间(分区键)',
  PRIMARY KEY (`id`, `created_at`),
  KEY `idx_user_id`           (`user_id`),
  KEY `idx_user_role`         (`user_role`),
  KEY `idx_intent`            (`intent`),
  KEY `idx_function_called`   (`function_called`),
  KEY `idx_is_transferred`    (`is_transferred`),
  KEY `idx_confidence`        (`confidence`),
  KEY `idx_user_created`      (`user_id`, `created_at`),
  KEY `idx_latency`           (`latency_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='AI对话日志(分区表, 500万行)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history   VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1    VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2    VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1    VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2    VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future    VALUES LESS THAN MAXVALUE
);


-- ============================================================================
-- 第七节：通知与对账 (4 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 25. notification_outbox — 事务发件箱 (Transactional Outbox Pattern)
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- 预估行数: <100万
-- 状态机: pending → processing → published / failed
-- 定时轮询: @Cron 每5秒查询 status='pending' AND next_retry_at <= NOW() 的消息
-- 重试策略: 指数退避(1min → 5min → 15min → 30min), max_retries=3
-- ---------------------------------------------------------------------------
CREATE TABLE `notification_outbox` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `aggregate_type`    VARCHAR(50)     NOT NULL                 COMMENT '聚合类型: sale_order/return_order/points_expire/stock_check',
  `aggregate_id`      VARCHAR(100)    NOT NULL                 COMMENT '聚合ID(如 order_no)',
  `event_type`        VARCHAR(50)     NOT NULL                 COMMENT '事件类型: order_created/return_approved/points_expiring',
  `payload_json`      JSON            NOT NULL                 COMMENT '事件负载(JSON)',
  `status`            ENUM('pending','processing','published','failed')
                                      NOT NULL DEFAULT 'pending' COMMENT '消息状态',
  `retry_count`       INT             NOT NULL DEFAULT 0       COMMENT '已重试次数',
  `max_retries`       INT             NOT NULL DEFAULT 3       COMMENT '最大重试次数',
  `next_retry_at`     DATETIME        DEFAULT NULL             COMMENT '下次重试时间',
  `error_msg`         VARCHAR(500)    DEFAULT NULL             COMMENT '最后一次错误信息',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_status_next_retry`    (`status`, `next_retry_at`),
  KEY `idx_aggregate`            (`aggregate_type`, `aggregate_id`),
  KEY `idx_event_type`           (`event_type`),
  KEY `idx_created_at`           (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='事务发件箱(Transactional Outbox Pattern)';


-- ---------------------------------------------------------------------------
-- 26. sms_log — 短信发送记录
-- ---------------------------------------------------------------------------
-- FK: member_id → member.id
-- 预估行数: <200万
-- 场景: purchase_notify / points_expire_remind / referral_reward / stock_alert
-- ---------------------------------------------------------------------------
CREATE TABLE `sms_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `member_id`         BIGINT UNSIGNED DEFAULT NULL             COMMENT '接收会员',
  `phone`             VARCHAR(11)     NOT NULL                 COMMENT '接收手机号',
  `content`           VARCHAR(500)    NOT NULL                 COMMENT '短信内容',
  `scene`             VARCHAR(30)     NOT NULL                 COMMENT '场景: purchase_notify/points_expire_remind/referral_reward/stock_alert',
  `status`            TINYINT         NOT NULL DEFAULT 0       COMMENT '0=待发送 1=已发送 2=发送失败',
  `retry_count`       INT             NOT NULL DEFAULT 0       COMMENT '重试次数',
  `sent_at`           DATETIME        DEFAULT NULL             COMMENT '实际发送时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id`       (`member_id`),
  KEY `idx_status`          (`status`),
  KEY `idx_scene`           (`scene`),
  KEY `idx_created_at`      (`created_at`),
  KEY `idx_status_retry`    (`status`, `retry_count`),
  CONSTRAINT `fk_sms_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='短信发送记录';


-- ---------------------------------------------------------------------------
-- 27. daily_reconcile — 日终对账记录
-- ---------------------------------------------------------------------------
-- FK: shop_id → shop.id, resolved_by → sys_user.id
-- 预估行数: <1万
-- 对账类型: stock_vs_order / points_vs_ledger / payment_vs_order / subsidy_vs_sales
-- 每日凌晨2点自动执行
-- ---------------------------------------------------------------------------
CREATE TABLE `daily_reconcile` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '对账门店',
  `reconcile_date`    DATE            NOT NULL                 COMMENT '对账日期',
  `check_type`        ENUM('stock_vs_order','points_vs_ledger','payment_vs_order','subsidy_vs_sales')
                                        NOT NULL               COMMENT '对账类型',
  `expected_count`    INT             NOT NULL                 COMMENT '预期数量',
  `actual_count`      INT             NOT NULL                 COMMENT '实际数量',
  `diff_count`        INT             NOT NULL DEFAULT 0       COMMENT '差异数量',
  `diff_detail`       JSON            DEFAULT NULL             COMMENT '差异明细(JSON)',
  `status`            ENUM('pass','fail') NOT NULL             COMMENT '对账结果',
  `resolved_by`       BIGINT UNSIGNED DEFAULT NULL             COMMENT '处理人',
  `resolved_at`       DATETIME        DEFAULT NULL             COMMENT '处理时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '对账执行时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_date_type` (`shop_id`, `reconcile_date`, `check_type`),
  KEY `idx_status`                (`status`),
  KEY `idx_reconcile_date`        (`reconcile_date`),
  KEY `idx_check_type`            (`check_type`),
  CONSTRAINT `fk_dr_shop`     FOREIGN KEY (`shop_id`)     REFERENCES `shop`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_dr_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日终对账记录表';


-- ---------------------------------------------------------------------------
-- 28. points_expire_log — 积分过期执行日志
-- ---------------------------------------------------------------------------
-- FK: member_id → member.id
-- 预估行数: <10万
-- 每月1日凌晨执行过期扫描
-- ---------------------------------------------------------------------------
CREATE TABLE `points_expire_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `member_id`         BIGINT UNSIGNED NOT NULL                 COMMENT '会员ID',
  `total_expired`     INT             NOT NULL                 COMMENT '本次过期总积分',
  `affected_rows`     INT             NOT NULL                 COMMENT '涉及流水条数',
  `executed_at`       DATETIME        NOT NULL                 COMMENT '执行时间',
  `status`            ENUM('success','partial','failed') NOT NULL COMMENT '执行结果',
  `error_msg`         VARCHAR(500)    DEFAULT NULL             COMMENT '错误信息',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id`       (`member_id`),
  KEY `idx_executed_at`     (`executed_at`),
  KEY `idx_status`          (`status`),
  CONSTRAINT `fk_pel_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分过期执行日志';


-- ============================================================================
-- 第八节：预警与盘点 (4 tables)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 29. alert_rule — 预警规则配置
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id (NULL=全局规则), sku_id → product_sku.id (NULL=适用所有SKU)
-- 预警类型: low_stock / slow_moving / price_anomaly / negative_profit
-- 冷却机制: cooldown_minutes 内同规则不重复触发
-- ---------------------------------------------------------------------------
CREATE TABLE `alert_rule` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED DEFAULT NULL             COMMENT '适用门店(NULL=全局规则)',
  `sku_id`            BIGINT UNSIGNED DEFAULT NULL             COMMENT '适用SKU(NULL=所有SKU)',
  `alert_type`        ENUM('low_stock','slow_moving','price_anomaly','negative_profit')
                                      NOT NULL                 COMMENT '预警类型',
  `threshold_json`    JSON            NOT NULL                 COMMENT '阈值配置(如 {"min_stock":5})',
  `notify_channels`   JSON            DEFAULT NULL             COMMENT '通知渠道(如 ["sms","wecom"])',
  `enabled`           TINYINT         NOT NULL DEFAULT 1       COMMENT '1=启用 0=禁用',
  `cooldown_minutes`  INT             NOT NULL DEFAULT 240     COMMENT '冷却时间(分钟, 同规则不重复发)',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_id`             (`shop_id`),
  KEY `idx_sku_id`              (`sku_id`),
  KEY `idx_alert_type_enabled`  (`alert_type`, `enabled`),
  CONSTRAINT `fk_ar_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`)        ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ar_sku`  FOREIGN KEY (`sku_id`)  REFERENCES `product_sku`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警规则配置表';


-- ---------------------------------------------------------------------------
-- 30. alert_log — 预警触发日志
-- ---------------------------------------------------------------------------
-- FK: shop_id → shop.id, rule_id → alert_rule.id
-- 预估行数: <10万
-- 级别: urgent(红色) / warning(橙色) / info(蓝色)
-- ---------------------------------------------------------------------------
CREATE TABLE `alert_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '触发门店',
  `rule_id`           BIGINT UNSIGNED DEFAULT NULL             COMMENT '触发规则(NULL=规则已删除)',
  `alert_type`        VARCHAR(30)     NOT NULL                 COMMENT '预警类型',
  `level`             ENUM('urgent','warning','info') NOT NULL COMMENT '预警级别',
  `message`           VARCHAR(500)    NOT NULL                 COMMENT '预警消息(自然语言)',
  `sku_id`            BIGINT UNSIGNED DEFAULT NULL             COMMENT '相关SKU',
  `current_stock`     INT             DEFAULT NULL             COMMENT '触发时库存数',
  `is_resolved`       TINYINT         NOT NULL DEFAULT 0       COMMENT '0=未解决 1=已解决',
  `resolved_at`       DATETIME        DEFAULT NULL             COMMENT '解决时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '触发时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_id`         (`shop_id`),
  KEY `idx_rule_id`         (`rule_id`),
  KEY `idx_alert_type`      (`alert_type`),
  KEY `idx_level`           (`level`),
  KEY `idx_is_resolved`     (`is_resolved`),
  KEY `idx_created_at`      (`created_at`),
  CONSTRAINT `fk_alog_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警触发日志';


-- ---------------------------------------------------------------------------
-- 31. stock_check — 盘点任务
-- ---------------------------------------------------------------------------
-- 审计字段: created_at + updated_at
-- FK: shop_id → shop.id, operator_id → sys_user.id, confirmed_by → sys_user.id
-- 预估行数: <1万
-- 状态机: in_progress → committed → confirmed / cancelled
-- 类型: full(全盘) / partial(抽盘) / category(品类盘)
-- ---------------------------------------------------------------------------
CREATE TABLE `stock_check` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL                 COMMENT '盘点门店',
  `check_no`          VARCHAR(30)     NOT NULL                 COMMENT '盘点单号(业务唯一)',
  `type`              ENUM('full','partial','category') NOT NULL COMMENT '盘点类型',
  `operator_id`       BIGINT UNSIGNED NOT NULL                 COMMENT '盘点人',
  `status`            ENUM('in_progress','committed','confirmed','cancelled')
                                      NOT NULL DEFAULT 'in_progress' COMMENT '盘点状态',
  `expected_count`    INT             NOT NULL DEFAULT 0       COMMENT '系统账面数',
  `actual_count`      INT             NOT NULL DEFAULT 0       COMMENT '实盘数',
  `surplus_count`     INT             NOT NULL DEFAULT 0       COMMENT '盘盈数',
  `deficit_count`     INT             NOT NULL DEFAULT 0       COMMENT '盘亏数',
  `confirmed_by`      BIGINT UNSIGNED DEFAULT NULL             COMMENT '确认人',
  `confirmed_at`      DATETIME        DEFAULT NULL             COMMENT '确认时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '创建时间',
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_check_no`      (`check_no`),
  KEY `idx_shop_id`             (`shop_id`),
  KEY `idx_operator_id`         (`operator_id`),
  KEY `idx_status`              (`status`),
  KEY `idx_created_at`          (`created_at`),
  CONSTRAINT `fk_sc_shop`      FOREIGN KEY (`shop_id`)      REFERENCES `shop`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sc_operator`  FOREIGN KEY (`operator_id`)  REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_sc_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='盘点任务表';


-- ---------------------------------------------------------------------------
-- 32. stock_check_item — 盘点明细
-- ---------------------------------------------------------------------------
-- FK: check_id → stock_check.id (CASCADE)
-- 预估行数: <10万
-- 实盘状态: found(匹配) / missing(缺失) / extra(盘盈) / wrong_location(位置不对) / damaged(损坏)
-- ---------------------------------------------------------------------------
CREATE TABLE `stock_check_item` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `check_id`          BIGINT UNSIGNED NOT NULL                 COMMENT '盘点任务ID',
  `imei`              VARCHAR(20)     NOT NULL                 COMMENT 'IMEI串码',
  `system_status`     ENUM('pending_audit','in_stock','sold','returned','frozen')
                                      DEFAULT NULL             COMMENT '系统记录状态',
  `actual_status`     ENUM('found','missing','extra','wrong_location','damaged')
                                      NOT NULL                 COMMENT '实盘结果',
  `system_location`   VARCHAR(50)     DEFAULT NULL             COMMENT '系统记录货位',
  `actual_location`   VARCHAR(50)     DEFAULT NULL             COMMENT '实盘货位',
  `remark`            VARCHAR(200)    DEFAULT NULL             COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP           COMMENT '盘点时间',
  PRIMARY KEY (`id`),
  KEY `idx_check_id`        (`check_id`),
  KEY `idx_imei`            (`imei`),
  KEY `idx_actual_status`   (`actual_status`),
  CONSTRAINT `fk_sci_parent` FOREIGN KEY (`check_id`) REFERENCES `stock_check`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='盘点明细表';


-- ============================================================================
-- 恢复外键检查
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================================
-- 附录A：数据库用户权限配置（生产环境）
-- ============================================================================
-- 使用占位符, 部署时替换 ${...} 为实际值

-- 应用读写账号(仅 SELECT + INSERT, 部分表允许 UPDATE 状态字段)
-- CREATE USER IF NOT EXISTS 'app_rw'@'%' IDENTIFIED BY '${APP_RW_PASSWORD}';
-- GRANT SELECT, INSERT ON `3c_retail`.* TO 'app_rw'@'%';
-- GRANT UPDATE (`return_status`)        ON `3c_retail`.`sale_order`           TO 'app_rw'@'%';
-- GRANT UPDATE (`status`, `version`)    ON `3c_retail`.`imei_stock`           TO 'app_rw'@'%';
-- GRANT UPDATE (`total_points`, `total_points_version`, `last_purchase_model`) ON `3c_retail`.`member` TO 'app_rw'@'%';
-- GRANT UPDATE (`expired_amount`, `remaining_amount`) ON `3c_retail`.`point_ledger` TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`notification_outbox`   TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`commission_ledger`      TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`return_order`           TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`national_subsidy`       TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`sms_log`                TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`alert_log`              TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`stock_check`            TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`stock_check_item`       TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`daily_reconcile`        TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`shop`                   TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`sys_user`               TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`product`                TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`product_sku`            TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`purchase_order`         TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`commission_rule`        TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`alert_rule`             TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`points_expire_log`      TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`trade_in_order`         TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`sys_role`               TO 'app_rw'@'%';
-- GRANT UPDATE ON `3c_retail`.`sys_user_role`          TO 'app_rw'@'%';

-- 应用只读账号(AI智能体专用)
-- CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY '${APP_RO_PASSWORD}';
-- GRANT SELECT ON `3c_retail`.* TO 'app_ro'@'%';

-- DBA管理账号(仅本地访问)
-- CREATE USER IF NOT EXISTS 'dba_admin'@'localhost' IDENTIFIED BY '${DBA_PASSWORD}';
-- GRANT ALL PRIVILEGES ON `3c_retail`.* TO 'dba_admin'@'localhost' WITH GRANT OPTION;

-- FLUSH PRIVILEGES;


-- ============================================================================
-- 附录B：设计决策速查表
-- ============================================================================
--
-- ┌─────────────────────────┬────────────┬────────────┬────────────┬──────────┐
-- │ 表名                    │ 软删除     │ INSERT ONLY│ 乐观锁     │ 分区表   │
-- ├─────────────────────────┼────────────┼────────────┼────────────┼──────────┤
-- │ shop                    │ ✅ deleted_at│ —         │ —          │ —        │
-- │ sys_role                │ —          │ —          │ —          │ —        │
-- │ sys_user                │ ✅ deleted_at│ —         │ —          │ —        │
-- │ sys_user_role           │ —          │ —          │ —          │ —        │
-- │ product                 │ ✅ deleted_at│ —         │ —          │ —        │
-- │ product_sku             │ ✅ deleted_at│ —         │ —          │ —        │
-- │ imei_stock              │ —          │ —          │ ✅ version  │ —        │
-- │ stock_ledger            │ —          │ ✅ 禁止UPDATE│ —         │ —        │
-- │ purchase_order          │ ✅ deleted_at│ —         │ —          │ —        │
-- │ purchase_item           │ —          │ —          │ —          │ —        │
-- │ member                  │ ✅ deleted_at│ —         │ ✅ tp_version│ —      │
-- │ member_referral         │ —          │ —          │ —          │ —        │
-- │ point_ledger            │ —          │ ✅ 禁止UPDATE│ —         │ ✅       │
-- │ sale_order              │ ✅ deleted_at│ ✅ 财务字段 │ —          │ ✅       │
-- │ sale_item               │ —          │ ✅ 禁止UPDATE│ —         │ ✅       │
-- │ payment_flow            │ —          │ —          │ —          │ ✅       │
-- │ return_order            │ ✅ deleted_at│ —         │ —          │ —        │
-- │ trade_in_order          │ —          │ —          │ —          │ —        │
-- │ commission_rule         │ —          │ —          │ —          │ —        │
-- │ commission_ledger       │ —          │ —          │ —          │ —        │
-- │ national_subsidy        │ —          │ —          │ —          │ —        │
-- │ audit_log               │ —          │ ✅ 禁止DELETE│ —         │ —        │
-- │ system_log              │ —          │ ✅ 禁止DELETE│ —         │ ✅       │
-- │ ai_chat_log             │ —          │ —          │ —          │ ✅       │
-- │ notification_outbox     │ —          │ —          │ —          │ —        │
-- │ sms_log                 │ —          │ —          │ —          │ —        │
-- │ daily_reconcile         │ —          │ —          │ —          │ —        │
-- │ points_expire_log       │ —          │ —          │ —          │ —        │
-- │ alert_rule              │ —          │ —          │ —          │ —        │
-- │ alert_log               │ —          │ —          │ —          │ —        │
-- │ stock_check             │ —          │ —          │ —          │ —        │
-- │ stock_check_item        │ —          │ —          │ —          │ —        │
-- └─────────────────────────┴────────────┴────────────┴────────────┴──────────┘


-- ============================================================================
-- 附录C：唯一约束清单 (18条)
-- ============================================================================
--
-- | 表                  | 约束名                          | 字段                                     |
-- |---------------------|--------------------------------|------------------------------------------|
-- | shop                | uk_shop_no                     | shop_no                                  |
-- | sys_role            | uk_code                        | code                                     |
-- | sys_user            | uk_phone                       | phone                                    |
-- | sys_user_role       | uk_user_role                   | (user_id, role_id)                       |
-- | product             | uk_brand_model                 | (brand, model)                           |
-- | product_sku         | uk_product_color_spec          | (product_id, color, spec)                |
-- | imei_stock          | uk_imei                        | imei                                     |
-- | purchase_order      | uk_po_no                       | order_no                                 |
-- | member              | uk_phone                       | phone                                    |
-- | member_referral     | uk_referrer_referee            | (referrer_id, referee_id)                |
-- | sale_order          | uk_order_no                    | (order_no, created_at)                   |
-- | payment_flow        | uk_payment_no                  | (payment_no, created_at)                 |
-- | return_order        | uk_return_no                   | return_no                                |
-- | commission_ledger   | uk_salesperson_period_order    | (salesperson_id, settlement_period, order_no) |
-- | national_subsidy    | uk_subsidy_no                  | subsidy_no                               |
-- | national_subsidy    | uk_subsidy_order               | order_no                                 |
-- | stock_check         | uk_check_no                    | check_no                                 |
-- | daily_reconcile     | uk_shop_date_type              | (shop_id, reconcile_date, check_type)    |


-- ============================================================================
-- 附录D：完整外键关系清单 (38条)
-- ============================================================================
--
-- | 子表              | 外键名              | 子表字段           | 父表            | ON DELETE  |
-- |-------------------|--------------------|--------------------|-----------------|------------|
-- | sys_user          | fk_user_shop       | shop_id            | shop            | RESTRICT   |
-- | sys_user_role     | fk_ur_user         | user_id            | sys_user        | CASCADE    |
-- | sys_user_role     | fk_ur_role         | role_id            | sys_role        | RESTRICT   |
-- | product_sku       | fk_sku_product     | product_id         | product         | RESTRICT   |
-- | imei_stock        | fk_imei_shop       | shop_id            | shop            | RESTRICT   |
-- | imei_stock        | fk_imei_sku        | sku_id             | product_sku     | RESTRICT   |
-- | stock_ledger      | fk_ledger_shop     | shop_id            | shop            | RESTRICT   |
-- | stock_ledger      | fk_ledger_imei     | imei               | imei_stock      | RESTRICT   |
-- | stock_ledger      | fk_ledger_operator | operator_id        | sys_user        | RESTRICT   |
-- | purchase_order    | fk_po_shop         | shop_id            | shop            | RESTRICT   |
-- | purchase_order    | fk_po_approver     | approved_by        | sys_user        | SET NULL   |
-- | purchase_item     | fk_pi_order        | purchase_order_id  | purchase_order  | CASCADE    |
-- | purchase_item     | fk_pi_sku          | sku_id             | product_sku     | RESTRICT   |
-- | member            | fk_member_referrer | referrer_id        | member          | SET NULL   |
-- | member_referral   | fk_ref_referrer    | referrer_id        | member          | RESTRICT   |
-- | member_referral   | fk_ref_referee     | referee_id         | member          | RESTRICT   |
-- | point_ledger      | fk_point_member    | member_id          | member          | RESTRICT   |
-- | sale_order        | fk_so_shop         | shop_id            | shop            | RESTRICT   |
-- | sale_order        | fk_so_member       | member_id          | member          | SET NULL   |
-- | sale_order        | fk_so_salesperson  | salesperson_id     | sys_user        | RESTRICT   |
-- | sale_item         | fk_si_order        | order_id           | sale_order      | CASCADE    |
-- | sale_item         | fk_si_imei         | imei               | imei_stock      | RESTRICT   |
-- | sale_item         | fk_si_sku          | sku_id             | product_sku     | RESTRICT   |
-- | payment_flow      | fk_pf_shop         | shop_id            | shop            | RESTRICT   |
-- | payment_flow      | fk_pf_order        | order_no           | sale_order      | RESTRICT   |
-- | return_order      | fk_ro_shop         | shop_id            | shop            | RESTRICT   |
-- | return_order      | fk_ro_sale         | original_order_no  | sale_order      | RESTRICT   |
-- | return_order      | fk_ro_imei         | imei               | imei_stock      | RESTRICT   |
-- | return_order      | fk_ro_auditor      | audited_by         | sys_user        | RESTRICT   |
-- | trade_in_order    | fk_ti_shop         | shop_id            | shop            | RESTRICT   |
-- | trade_in_order    | fk_ti_order        | order_no           | sale_order      | RESTRICT   |
-- | commission_ledger | fk_cl_shop         | shop_id            | shop            | RESTRICT   |
-- | commission_ledger | fk_cl_salesperson  | salesperson_id     | sys_user        | RESTRICT   |
-- | commission_ledger | fk_cl_order        | order_no           | sale_order      | RESTRICT   |
-- | commission_ledger | fk_cl_confirmer    | confirmed_by       | sys_user        | SET NULL   |
-- | national_subsidy  | fk_ns_shop         | shop_id            | shop            | RESTRICT   |
-- | national_subsidy  | fk_ns_order        | order_no           | sale_order      | RESTRICT   |
-- | national_subsidy  | fk_ns_imei         | imei               | imei_stock      | RESTRICT   |
-- | audit_log         | fk_al_imei         | imei               | imei_stock      | RESTRICT   |
-- | audit_log         | fk_al_operator     | operator_id        | sys_user        | RESTRICT   |
-- | system_log        | fk_sl_shop         | shop_id            | shop            | RESTRICT   |
-- | system_log        | fk_sl_operator     | operator_id        | sys_user        | RESTRICT   |
-- | sms_log           | fk_sms_member      | member_id          | member          | SET NULL   |
-- | daily_reconcile   | fk_dr_shop         | shop_id            | shop            | RESTRICT   |
-- | daily_reconcile   | fk_dr_resolver     | resolved_by        | sys_user        | SET NULL   |
-- | points_expire_log | fk_pel_member      | member_id          | member          | RESTRICT   |
-- | alert_rule        | fk_ar_shop         | shop_id            | shop            | SET NULL   |
-- | alert_rule        | fk_ar_sku          | sku_id             | product_sku     | SET NULL   |
-- | alert_log         | fk_alog_shop       | shop_id            | shop            | RESTRICT   |
-- | stock_check       | fk_sc_shop         | shop_id            | shop            | RESTRICT   |
-- | stock_check       | fk_sc_operator     | operator_id        | sys_user        | RESTRICT   |
-- | stock_check       | fk_sc_confirmer    | confirmed_by       | sys_user        | RESTRICT   |
-- | stock_check_item  | fk_sci_parent      | check_id           | stock_check     | CASCADE    |


-- ============================================================================
-- 附录E：事务设计建议
-- ============================================================================
--
-- ┌─────────────────────────────────────────────────────────────────────────────────┐
-- │ 事务1: 扫码出库 (最复杂事务, 7+ table, REPEATABLE READ)                          │
-- ├─────────────────────────────────────────────────────────────────────────────────┤
-- │                                                                                 │
-- │  START TRANSACTION;                                                             │
-- │                                                                                 │
-- │  -- Step 1: 锁定IMEI并校验乐观锁                                                  │
-- │  SELECT id, imei, status, version, cost_price, sku_id                           │
-- │  FROM imei_stock WHERE imei = ? AND status = 'in_stock' FOR UPDATE;             │
-- │  → 无结果则 ROLLBACK + 返回"IMEI不在库"                                           │
-- │                                                                                 │
-- │  -- Step 2: 更新IMEI状态(乐观锁)                                                  │
-- │  UPDATE imei_stock                                                              │
-- │  SET status = 'sold', version = version + 1, updated_at = NOW()                 │
-- │  WHERE imei = ? AND status = 'in_stock' AND version = ?;                        │
-- │  → affected_rows = 0 → ROLLBACK + 返回"并发冲突"                                 │
-- │                                                                                 │
-- │  -- Step 3: 创建销售订单(INSERT ONLY)                                             │
-- │  INSERT INTO sale_order (shop_id, order_no, member_id, salesperson_id,          │
-- │    total_amount, total_cost_snapshot, total_subsidy, total_commission,          │
-- │    gross_profit, actual_paid, points_used_total, payment_method, created_at)    │
-- │  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW());                            │
-- │                                                                                 │
-- │  -- Step 4: 创建销售明细(INSERT ONLY)                                             │
-- │  INSERT INTO sale_item (order_id, imei, sku_id, sale_price,                     │
-- │    cost_price_snapshot, subsidy_income, commission, gross_profit, created_at)   │
-- │  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW());                                        │
-- │                                                                                 │
-- │  -- Step 5: 锁定会员行(如有会员)                                                   │
-- │  SELECT total_points, total_points_version FROM member                          │
-- │  WHERE id = ? FOR UPDATE;                                                       │
-- │                                                                                 │
-- │  -- Step 6: 写入积分流水(如有消费积分获取)                                          │
-- │  INSERT INTO point_ledger (member_id, change_type, amount, balance_after,       │
-- │    order_no, order_time, product_model, unit_price, quantity,                   │
-- │    expires_at, remaining_amount, created_at)                                    │
-- │  VALUES (?, 'earn', ?, ?, ?, NOW(), ?, ?, 1,                                    │
-- │    DATE(CONCAT(YEAR(NOW()),'-12-31')), ?, NOW());                               │
-- │                                                                                 │
-- │  -- Step 7: 更新会员积分余额(乐观锁)                                               │
-- │  UPDATE member SET total_points = ?,                                            │
-- │    total_points_version = total_points_version + 1,                             │
-- │    last_purchase_model = ?, updated_at = NOW()                                  │
-- │  WHERE id = ? AND total_points_version = ?;                                     │
-- │  → affected_rows = 0 → ROLLBACK + 返回"积分并发冲突"                              │
-- │                                                                                 │
-- │  -- Step 8: 写入提成流水(预估)                                                     │
-- │  INSERT INTO commission_ledger (shop_id, salesperson_id, settlement_period,     │
-- │    order_no, estimated_commission, adjustment, actual_commission,               │
-- │    status, created_at)                                                          │
-- │  VALUES (?, ?, DATE_FORMAT(NOW(),'%Y-%m'), ?, ?, 0.00, ?, 'pending', NOW());   │
-- │                                                                                 │
-- │  -- Step 9: 写入库存变动流水                                                       │
-- │  INSERT INTO stock_ledger (shop_id, imei, change_type, from_status,             │
-- │    to_status, operator_id, order_no, created_at)                                │
-- │  VALUES (?, ?, 'outbound', 'in_stock', 'sold', ?, ?, NOW());                    │
-- │                                                                                 │
-- │  -- Step 10: 写入通知发件箱                                                        │
-- │  INSERT INTO notification_outbox (aggregate_type, aggregate_id, event_type,     │
-- │    payload_json, status, retry_count, max_retries, next_retry_at, created_at)   │
-- │  VALUES ('sale_order', ?, 'order_created', ?, 'pending', 0, 3, NOW(), NOW());  │
-- │                                                                                 │
-- │  COMMIT;                                                                        │
-- │  → 任一步骤失败则ROLLBACK, 所有表数据保持一致                                       │
-- │                                                                                 │
-- └─────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────────────┐
-- │ 事务2: 退货审核通过 (6+ table, REPEATABLE READ)                                   │
-- ├─────────────────────────────────────────────────────────────────────────────────┤
-- │                                                                                 │
-- │  START TRANSACTION;                                                             │
-- │                                                                                 │
-- │  -- Step 1: 更新退货单状态                                                        │
-- │  UPDATE return_order                                                             │
-- │  SET audit_status = 'approved', audited_by = ?, audited_at = NOW(),             │
-- │    completed_at = NOW(), updated_at = NOW()                                     │
-- │  WHERE return_no = ? AND audit_status = 'pending';                              │
-- │                                                                                 │
-- │  -- Step 2: 更新IMEI状态退回在库                                                   │
-- │  UPDATE imei_stock                                                              │
-- │  SET status = 'in_stock', audit_status = 'pending', updated_at = NOW()          │
-- │  WHERE imei = ? AND status = 'sold';                                            │
-- │                                                                                 │
-- │  -- Step 3: 更新销售单退货状态                                                     │
-- │  UPDATE sale_order                                                              │
-- │  SET return_status = 'returned'                                                 │
-- │  WHERE order_no = ? AND return_status = 'returning';                            │
-- │                                                                                 │
-- │  -- Step 4: 积分冲正(负数冲正)                                                     │
-- │  INSERT INTO point_ledger (member_id, change_type, amount, balance_after,       │
-- │    order_no, remark, remaining_amount, created_at)                              │
-- │  VALUES (?, 'manual_adjust', ?, ?, ?, '退货冲正', 0, NOW());                     │
-- │  -- 同时 UPDATE member.total_points (配合乐观锁)                                   │
-- │                                                                                 │
-- │  -- Step 5: 提成追回                                                              │
-- │  UPDATE commission_ledger                                                       │
-- │  SET adjustment = adjustment - ?,                                               │
-- │    actual_commission = actual_commission - ?,                                   │
-- │    updated_at = NOW()                                                           │
-- │  WHERE order_no = ? AND salesperson_id = ?;                                     │
-- │                                                                                 │
-- │  -- Step 6: 国补追回                                                              │
-- │  UPDATE national_subsidy                                                        │
-- │  SET status = 'recalled', recalled_at = NOW(), updated_at = NOW()               │
-- │  WHERE order_no = ? AND status = 'disbursed';                                   │
-- │                                                                                 │
-- │  -- Step 7: 退款记录                                                              │
-- │  INSERT INTO payment_flow (shop_id, payment_no, order_no, method,               │
-- │    amount, refund_amount, payment_type, status, created_at)                     │
-- │  VALUES (?, ?, ?, 'refund', 0.00, ?, 'refund', 1, NOW());                       │
-- │                                                                                 │
-- │  -- Step 8: 库存变动流水 + 通知发件箱                                               │
-- │  INSERT INTO stock_ledger (...) VALUES (...);                                   │
-- │  INSERT INTO notification_outbox (...) VALUES (...);                             │
-- │                                                                                 │
-- │  COMMIT;                                                                        │
-- │                                                                                 │
-- └─────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────────────┐
-- │ 事务3: 入库审核 (2 table, READ COMMITTED)                                         │
-- ├─────────────────────────────────────────────────────────────────────────────────┤
-- │                                                                                 │
-- │  START TRANSACTION;                                                             │
-- │                                                                                 │
-- │  -- Step 1: 更新IMEI状态 + 审计状态                                                │
-- │  UPDATE imei_stock                                                              │
-- │  SET status = 'in_stock', audit_status = 'approved', updated_at = NOW()         │
-- │  WHERE imei = ? AND audit_status = 'pending';                                   │
-- │  → affected_rows = 0 → 重复审核或已处理 → ROLLBACK                                 │
-- │                                                                                 │
-- │  -- Step 2: 写入审核日志                                                          │
-- │  INSERT INTO audit_log (imei, action, operator_id, remark, created_at)          │
-- │  VALUES (?, 'inbound_approve', ?, ?, NOW());                                    │
-- │                                                                                 │
-- │  COMMIT;                                                                        │
-- │                                                                                 │
-- └─────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────────────┐
-- │ 事务4: 积分过期 (按member分批, REPEATABLE READ)                                    │
-- ├─────────────────────────────────────────────────────────────────────────────────┤
-- │                                                                                 │
-- │  FOR EACH member WITH remaining_amount > 0 AND expires_at <= CURDATE():         │
-- │    START TRANSACTION;                                                           │
-- │                                                                                 │
-- │    -- 锁定会员行                                                                   │
-- │    SELECT id, total_points, total_points_version                                 │
-- │    FROM member WHERE id = ? FOR UPDATE;                                         │
-- │                                                                                 │
-- │    -- 计算过期积分 = SUM(point_ledger.remaining_amount WHERE expires_at <= NOW()) │
-- │    -- 更新 point_ledger: expired_amount += remaining_amount, remaining_amount=0  │
-- │    UPDATE point_ledger                                                          │
-- │    SET expired_amount = remaining_amount, remaining_amount = 0                  │
-- │    WHERE member_id = ? AND expires_at <= CURDATE() AND remaining_amount > 0;    │
-- │                                                                                 │
-- │    -- 更新会员积分余额                                                              │
-- │    UPDATE member                                                                │
-- │    SET total_points = total_points - ?,                                         │
-- │      total_points_version = total_points_version + 1                            │
-- │    WHERE id = ? AND total_points_version = ?;                                   │
-- │                                                                                 │
-- │    -- 写入过期日志                                                                 │
-- │    INSERT INTO points_expire_log                                                │
-- │      (member_id, total_expired, affected_rows, executed_at, status)             │
-- │    VALUES (?, ?, ?, NOW(), 'success');                                          │
-- │                                                                                 │
-- │    -- 通知会员积分过期                                                              │
-- │    INSERT INTO notification_outbox (...) VALUES (...);                           │
-- │                                                                                 │
-- │    COMMIT;  -- 逐member提交, 失败不影响其他member                                  │
-- │                                                                                 │
-- └─────────────────────────────────────────────────────────────────────────────────┘


-- ============================================================================
-- 附录F：生产环境初始化数据（种子脚本）
-- ============================================================================

-- 默认门店
INSERT INTO `shop` (`shop_no`, `name`, `address`, `contact_phone`, `status`) VALUES
('SH001', '默认3C数码门店', '请填写实际门店地址', NULL, 1);

-- 系统角色 (6个)
INSERT INTO `sys_role` (`code`, `name`, `description`) VALUES
('owner',                '老板/店长',   '全部权限，可查看财务报表、审批入库/退货、管理系统配置'),
('salesperson',          '销售员',      '扫码出库、查询库存、查看会员、修改售价(限定范围)'),
('warehouse',            '仓管员',      '库存查询、入库申请'),
('warehouse_supervisor', '仓管主管',    '仓管员权限 + 入库审核 + 盘点确认'),
('member',               '会员(C端)',   '仅查看自己的积分、消费记录、推荐信息'),
('ai_agent',             'AI智能体',    '全部只读(GET only)，数据自动脱敏');

-- 默认管理员 (密码: admin123 → bcrypt hash, 部署时需要替换为实际bcrypt值)
INSERT INTO `sys_user` (`shop_id`, `phone`, `name`, `password_hash`, `status`) VALUES
(1, '13800000000', '系统管理员', '$2b$12$placeholder_replace_with_real_bcrypt_hash', 1);

-- 管理员关联 owner 角色
INSERT INTO `sys_user_role` (`user_id`, `role_id`) VALUES (1, 1);

-- 默认预警规则 (全局)
INSERT INTO `alert_rule` (`shop_id`, `sku_id`, `alert_type`, `threshold_json`, `notify_channels`, `enabled`, `cooldown_minutes`) VALUES
(NULL, NULL, 'low_stock',       '{"min_stock": 5}',      '["sms"]', 1, 240),
(NULL, NULL, 'slow_moving',     '{"days_without_sale": 30}', '["sms"]', 1, 1440),
(NULL, NULL, 'price_anomaly',   '{"min_margin_percent": 0}', '["sms"]', 1, 60),
(NULL, NULL, 'negative_profit', '{}',                     '["sms"]', 1, 30);


-- ============================================================================
-- 附录G：分区维护策略
-- ============================================================================
--
-- 每月1日自动执行以下脚本, 提前创建未来1年的分区:
--
-- ALTER TABLE sale_order REORGANIZE PARTITION p_future INTO (
--   PARTITION p2028_h1 VALUES LESS THAN (TO_DAYS('2028-07-01')),
--   PARTITION p_future  VALUES LESS THAN MAXVALUE
-- );
--
-- 归档1年以上数据:
-- SELECT * FROM sale_order WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)
-- → 写入 COS (Parquet格式) → 确认写入成功 → 删除原表数据
--
-- 注意: MySQL分区表的 created_at 必须包含在所有 UNIQUE KEY 中。
--       这是 MySQL 8 的强制要求, 也是本设计中分区表使用复合主键的原因。

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
