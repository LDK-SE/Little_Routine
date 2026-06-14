-- ============================================================================
-- 3C数码零售系统 · 生产级数据库设计
-- ============================================================================
-- 目标规模: 100万订单 / 10万会员 / 10万IMEI / 多门店
-- 引擎: InnoDB | 字符集: utf8mb4 | 隔离级别: REPEATABLE READ
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `3c_retail`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE `3c_retail`;

-- ============================================================================
-- 第一节：门店与用户
-- ============================================================================

-- 1. shop — 门店/连锁管理
CREATE TABLE `shop` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_no`         VARCHAR(20)     NOT NULL COMMENT '门店编号',
  `name`            VARCHAR(100)    NOT NULL COMMENT '门店名称',
  `address`         VARCHAR(200)    DEFAULT NULL COMMENT '门店地址',
  `contact_phone`   VARCHAR(11)     DEFAULT NULL COMMENT '门店联系电话',
  `status`          TINYINT         NOT NULL DEFAULT 1 COMMENT '1=营业 0=关店',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME        DEFAULT NULL COMMENT '软删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_no` (`shop_no`),
  KEY `idx_status` (`status`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店表';


-- 2. sys_user — 系统用户/员工
CREATE TABLE `sys_user` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL COMMENT '所属门店',
  `phone`           VARCHAR(11)     NOT NULL COMMENT '登录手机号',
  `name`            VARCHAR(50)     NOT NULL COMMENT '姓名',
  `role`            ENUM('owner','salesperson','warehouse','warehouse_supervisor') NOT NULL COMMENT '角色',
  `status`          TINYINT         NOT NULL DEFAULT 1 COMMENT '1=在职 0=离职',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入职时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME        DEFAULT NULL COMMENT '软删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_role` (`role`),
  KEY `idx_status` (`status`),
  KEY `idx_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_user_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户/员工表';


-- ============================================================================
-- 第二节：商品与库存
-- ============================================================================

-- 3. product_sku — 商品SKU主表（连锁通用）
CREATE TABLE `product_sku` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `brand`           VARCHAR(50)     NOT NULL COMMENT '品牌',
  `model`           VARCHAR(100)    NOT NULL COMMENT '型号',
  `color`           VARCHAR(30)     NOT NULL COMMENT '颜色',
  `spec`            VARCHAR(50)     NOT NULL COMMENT '配置(存储/运存/网络制式)',
  `barcode`         VARCHAR(50)     DEFAULT NULL COMMENT '通用条形码(EAN/UPC)',
  `retail_price`    DECIMAL(10,2)   DEFAULT NULL COMMENT '建议零售价',
  `min_sale_price`  DECIMAL(10,2)   DEFAULT NULL COMMENT '最低允许售价(NULL=不限)',
  `status`          TINYINT         NOT NULL DEFAULT 1 COMMENT '1=在售 0=停售',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME        DEFAULT NULL COMMENT '软删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_brand_model_color_spec` (`brand`, `model`, `color`, `spec`),
  KEY `idx_brand_model` (`brand`, `model`),
  KEY `idx_barcode` (`barcode`),
  KEY `idx_status` (`status`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品SKU主表';


-- 4. stock_ledger — 库存台账（IMEI全生命周期）
CREATE TABLE `stock_ledger` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`         BIGINT UNSIGNED NOT NULL COMMENT '所属门店',
  `imei`            VARCHAR(20)     NOT NULL COMMENT '手机串码(15-20位)',
  `sku_id`          BIGINT UNSIGNED NOT NULL COMMENT '关联 product_sku.id',
  `batch_no`        VARCHAR(50)     DEFAULT NULL COMMENT '批次号',
  `location`        VARCHAR(50)     DEFAULT NULL COMMENT '货位编号',
  `cost_price`      DECIMAL(10,2)   DEFAULT NULL COMMENT '进货成本(审核通过时固化为个别计价法成本)',
  `channel`         VARCHAR(50)     DEFAULT NULL COMMENT '进货渠道',
  `status`          ENUM('pending_audit','in_stock','sold','returned','frozen') NOT NULL DEFAULT 'pending_audit' COMMENT '库存状态',
  `audit_status`    ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `version`         INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库申请时间',
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_imei` (`imei`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_status` (`status`),
  KEY `idx_audit_status` (`audit_status`),
  KEY `idx_location` (`location`),
  KEY `idx_batch_no` (`batch_no`),
  KEY `idx_shop_status` (`shop_id`, `status`),
  KEY `idx_status_location` (`status`, `location`),
  KEY `idx_sku_status` (`sku_id`, `status`),
  CONSTRAINT `fk_stock_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_stock_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存台账(IMEI全生命周期管控)';


-- ============================================================================
-- 第三节：会员
-- ============================================================================

-- 5. member — 会员表（连锁通用，不绑定单店）
CREATE TABLE `member` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `phone`                VARCHAR(11)     NOT NULL COMMENT '联系电话(唯一业务主键)',
  `name`                 VARCHAR(50)     DEFAULT NULL COMMENT '姓名',
  `address`              VARCHAR(200)    DEFAULT NULL COMMENT '居住地',
  `license_plate`        VARCHAR(20)     DEFAULT NULL COMMENT '车号',
  `backup_phone`         VARCHAR(11)     DEFAULT NULL COMMENT '备用电话',
  `last_purchase_model`  VARCHAR(100)    DEFAULT NULL COMMENT '最近购买机型',
  `total_points`         INT             NOT NULL DEFAULT 0 COMMENT '可用积分余额',
  `total_points_version` INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '积分余额乐观锁版本号',
  `referrer_id`          BIGINT UNSIGNED DEFAULT NULL COMMENT '推荐人 member.id(仅一级,写入后不可改)',
  `status`               TINYINT         NOT NULL DEFAULT 1 COMMENT '1=正常 0=禁用',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`           DATETIME        DEFAULT NULL COMMENT '软删除(注销)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_referrer_id` (`referrer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_member_referrer` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会员表';


-- ============================================================================
-- 第四节：销售与财务
-- ============================================================================

-- 6. sales_order — 销售单（成本/毛利固化，INSERT ONLY）
CREATE TABLE `sales_order` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`              BIGINT UNSIGNED NOT NULL COMMENT '销售门店',
  `order_no`             VARCHAR(30)     NOT NULL COMMENT '订单号(雪花ID)',
  `imei`                 VARCHAR(20)     NOT NULL COMMENT '关联 stock_ledger.imei',
  `sku_id`               BIGINT UNSIGNED NOT NULL COMMENT '关联 product_sku.id',
  `member_id`            BIGINT UNSIGNED DEFAULT NULL COMMENT '购买会员 member.id',
  `salesperson_id`       BIGINT UNSIGNED NOT NULL COMMENT '销售员 sys_user.id',
  `sale_price`           DECIMAL(10,2)   NOT NULL COMMENT '售价',
  `cost_price_snapshot`  DECIMAL(10,2)   NOT NULL COMMENT '【固化】成本快照，写入后禁止修改',
  `subsidy_income`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '国补收入',
  `commission`           DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '预估提成(固化)',
  `gross_profit`         DECIMAL(10,2)   NOT NULL COMMENT '【固化】毛利=sale_price+subsidy_income-cost_price_snapshot-commission',
  `payment_method`       VARCHAR(20)     NOT NULL COMMENT '收款方式:cash/wechat/huabei/trade_in/subsidy',
  `actual_paid`          DECIMAL(10,2)   NOT NULL COMMENT '实付金额(已扣减积分抵扣)',
  `points_used`          INT             NOT NULL DEFAULT 0 COMMENT '本次使用积分数',
  `return_status`        ENUM('normal','return_requested','returning','returned') NOT NULL DEFAULT 'normal' COMMENT '退货状态',
  `returned_at`          DATETIME        DEFAULT NULL COMMENT '退货完成时间',
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '销售时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_imei` (`imei`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_payment_method` (`payment_method`),
  KEY `idx_return_status` (`return_status`),
  KEY `idx_shop_created` (`shop_id`, `created_at`),
  KEY `idx_salesperson_date` (`salesperson_id`, `created_at`),
  KEY `idx_member_date` (`member_id`, `created_at`),
  CONSTRAINT `fk_order_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_order_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_order_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_order_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_order_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售单(财务数据INSERT ONLY)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2 VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1 VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2 VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);


-- 7. payment_flow — 收款流水
CREATE TABLE `payment_flow` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`                 BIGINT UNSIGNED NOT NULL COMMENT '收款门店',
  `payment_no`              VARCHAR(30)     NOT NULL COMMENT '收款流水号(雪花ID)',
  `order_no`                VARCHAR(30)     NOT NULL COMMENT '关联销售单号',
  `method`                  VARCHAR(20)     NOT NULL COMMENT '收款方式:cash/wechat/huabei/trade_in/subsidy',
  `amount`                  DECIMAL(10,2)   NOT NULL COMMENT '收款金额',
  `external_transaction_id` VARCHAR(64)     DEFAULT NULL COMMENT '外部支付平台交易号(微信/支付宝)',
  `reconcile_status`        ENUM('pending','matched','mismatched') NOT NULL DEFAULT 'pending' COMMENT '对账状态',
  `reconciled_at`           DATETIME        DEFAULT NULL COMMENT '对账时间',
  `status`                  TINYINT         NOT NULL DEFAULT 1 COMMENT '1=成功 0=失败',
  `created_at`              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收款时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_no` (`payment_no`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_external_transaction_id` (`external_transaction_id`),
  KEY `idx_reconcile_status` (`reconcile_status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_method_date` (`method`, `created_at`),
  KEY `idx_shop_created` (`shop_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收款流水表'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2 VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1 VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2 VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);


-- 8. trade_in_detail — 以旧换新明细
CREATE TABLE `trade_in_detail` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_no`          VARCHAR(30)     NOT NULL COMMENT '关联销售单号',
  `old_imei`          VARCHAR(20)     DEFAULT NULL COMMENT '旧机IMEI',
  `old_brand`         VARCHAR(50)     DEFAULT NULL COMMENT '旧机品牌',
  `old_model`         VARCHAR(100)    DEFAULT NULL COMMENT '旧机型号',
  `old_condition`     VARCHAR(50)     DEFAULT NULL COMMENT '旧机成色',
  `appraised_value`   DECIMAL(10,2)   NOT NULL COMMENT '旧机估值金额',
  `actual_deduction`  DECIMAL(10,2)   NOT NULL COMMENT '实际抵扣金额',
  `remark`            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_old_imei` (`old_imei`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='以旧换新明细表';


-- 9. return_order — 退货单
CREATE TABLE `return_order` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '退货门店',
  `return_no`         VARCHAR(30)     NOT NULL COMMENT '退货单号(雪花ID)',
  `original_order_no` VARCHAR(30)     NOT NULL COMMENT '原销售单号',
  `imei`              VARCHAR(20)     NOT NULL COMMENT '退货IMEI',
  `return_reason`     VARCHAR(500)    NOT NULL COMMENT '退货原因',
  `return_type`       ENUM('full_return','exchange','refund_only') NOT NULL COMMENT '退货类型',
  `refund_amount`     DECIMAL(10,2)   NOT NULL COMMENT '退款金额',
  `points_recalled`   INT             NOT NULL DEFAULT 0 COMMENT '扣回积分',
  `commission_recalled` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '追回提成',
  `subsidy_recalled`  DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '追回国补',
  `audit_status`      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `audited_by`        BIGINT UNSIGNED DEFAULT NULL COMMENT '审核人',
  `audited_at`        DATETIME        DEFAULT NULL COMMENT '审核时间',
  `completed_at`      DATETIME        DEFAULT NULL COMMENT '退货完成时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_no` (`return_no`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_original_order_no` (`original_order_no`),
  KEY `idx_imei` (`imei`),
  KEY `idx_audit_status` (`audit_status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_return_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_return_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_return_auditor` FOREIGN KEY (`audited_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退货单表';


-- ============================================================================
-- 第五节：提成
-- ============================================================================

-- 10. commission_rule — 提成规则配置
CREATE TABLE `commission_rule` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `brand`           VARCHAR(50)     DEFAULT NULL COMMENT '品牌(NULL=所有品牌)',
  `model`           VARCHAR(100)    DEFAULT NULL COMMENT '型号(NULL=所有型号)',
  `min_price`       DECIMAL(10,2)   DEFAULT NULL COMMENT '最低售价区间',
  `max_price`       DECIMAL(10,2)   DEFAULT NULL COMMENT '最高售价区间',
  `commission_type` ENUM('fixed','percentage','tiered') NOT NULL DEFAULT 'fixed' COMMENT '提成类型:固定/百分比/阶梯',
  `commission_value` DECIMAL(10,2)  NOT NULL COMMENT '提成值(固定金额或百分比)',
  `priority`        INT             NOT NULL DEFAULT 0 COMMENT '优先级(越大越优先匹配)',
  `status`          TINYINT         NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_brand_model` (`brand`, `model`),
  KEY `idx_status_priority` (`status`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提成规则配置表';


-- 11. commission_settlement — 月度提成结算
CREATE TABLE `commission_settlement` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '结算门店',
  `salesperson_id`    BIGINT UNSIGNED NOT NULL COMMENT '销售员',
  `settlement_period` VARCHAR(7)      NOT NULL COMMENT '结算周期(YYYY-MM)',
  `estimated_total`   DECIMAL(10,2)   NOT NULL COMMENT '预估提成总额',
  `return_adjustment` DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '退货调整',
  `actual_total`      DECIMAL(10,2)   NOT NULL COMMENT '实发提成',
  `status`            ENUM('pending','confirmed','paid') NOT NULL DEFAULT 'pending',
  `confirmed_by`      BIGINT UNSIGNED DEFAULT NULL COMMENT '确认人',
  `confirmed_at`      DATETIME        DEFAULT NULL COMMENT '确认时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_salesperson_period` (`salesperson_id`, `settlement_period`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_settlement_period` (`settlement_period`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_settlement_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlement_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlement_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月度提成结算表';


-- ============================================================================
-- 第六节：国补管理
-- ============================================================================

-- 12. subsidy_record — 国补记录
CREATE TABLE `subsidy_record` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '申请门店',
  `subsidy_no`        VARCHAR(30)     NOT NULL COMMENT '补贴申请单号',
  `order_no`          VARCHAR(30)     NOT NULL COMMENT '关联销售单号',
  `imei`              VARCHAR(20)     NOT NULL COMMENT '关联串码',
  `applied_amount`    DECIMAL(10,2)   NOT NULL COMMENT '申请补贴金额',
  `approved_amount`   DECIMAL(10,2)   DEFAULT NULL COMMENT '审批通过金额',
  `status`            ENUM('pending_submit','submitted','under_review','approved','rejected','disbursed','recalled') NOT NULL DEFAULT 'pending_submit' COMMENT '补贴状态',
  `submitted_at`      DATETIME        DEFAULT NULL COMMENT '提交时间',
  `reviewed_at`       DATETIME        DEFAULT NULL COMMENT '审核时间',
  `disbursed_at`      DATETIME        DEFAULT NULL COMMENT '拨付到账时间',
  `recalled_at`       DATETIME        DEFAULT NULL COMMENT '补贴追回时间(退货触发)',
  `external_ref_no`   VARCHAR(64)     DEFAULT NULL COMMENT '外部系统参考号',
  `remark`            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subsidy_no` (`subsidy_no`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_imei` (`imei`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_subsidy_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_subsidy_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国补记录表';


-- ============================================================================
-- 第七节：积分体系
-- ============================================================================

-- 13. point_ledger — 积分流水（INSERT ONLY，FIFO过期）
CREATE TABLE `point_ledger` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`         BIGINT UNSIGNED NOT NULL COMMENT '会员 member.id',
  `change_type`       ENUM('earn','redeem','expire','referral','manual_adjust') NOT NULL COMMENT '变动类型',
  `amount`            INT             NOT NULL COMMENT '变动积分(正=获取,负=消耗)',
  `balance_after`     INT             NOT NULL COMMENT '变动后余额(快照,用于对账)',
  `order_no`          VARCHAR(30)     DEFAULT NULL COMMENT '关联销售单号(消费得积分/抵现时必填)',
  `order_time`        DATETIME        DEFAULT NULL COMMENT '订单时间(冗余)',
  `product_model`     VARCHAR(100)    DEFAULT NULL COMMENT '购买型号(冗余)',
  `unit_price`        DECIMAL(10,2)   DEFAULT NULL COMMENT '订单单价(冗余)',
  `quantity`          INT             NOT NULL DEFAULT 1 COMMENT '数量',
  `expires_at`        DATE            DEFAULT NULL COMMENT '过期日期(earn类型=次年12月31日)',
  `expired_amount`    INT             NOT NULL DEFAULT 0 COMMENT '已过期积分',
  `remaining_amount`  INT             NOT NULL COMMENT '剩余有效积分(earn类型=amount-expired_amount-已消耗)',
  `remark`            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '流水时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_change_type` (`change_type`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_member_type_created` (`member_id`, `change_type`, `created_at`),
  KEY `idx_member_expires_remaining` (`member_id`, `expires_at`, `remaining_amount`),
  CONSTRAINT `fk_point_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分流水表(INSERT ONLY,FIFO过期)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2 VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1 VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2 VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);


-- 14. points_expire_log — 积分过期执行日志
CREATE TABLE `points_expire_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`         BIGINT UNSIGNED NOT NULL COMMENT '会员',
  `total_expired`     INT             NOT NULL COMMENT '本次过期总积分',
  `affected_rows`     INT             NOT NULL COMMENT '涉及流水条数',
  `executed_at`       DATETIME        NOT NULL COMMENT '执行时间',
  `status`            ENUM('success','partial','failed') NOT NULL COMMENT '执行结果',
  `error_msg`         VARCHAR(500)    DEFAULT NULL COMMENT '错误信息',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_executed_at` (`executed_at`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_expire_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分过期执行日志';


-- ============================================================================
-- 第八节：预警系统
-- ============================================================================

-- 15. alert_rule — 预警规则配置
CREATE TABLE `alert_rule` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED DEFAULT NULL COMMENT '适用门店(NULL=全局规则)',
  `sku_id`            BIGINT UNSIGNED DEFAULT NULL COMMENT '适用SKU(NULL=全局规则)',
  `alert_type`        ENUM('low_stock','slow_moving','price_anomaly','negative_profit') NOT NULL COMMENT '预警类型',
  `threshold_json`    JSON            NOT NULL COMMENT '阈值配置',
  `notify_channels`   JSON            DEFAULT NULL COMMENT '通知渠道["wecom","sms"]',
  `enabled`           TINYINT         NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `cooldown_minutes`  INT             NOT NULL DEFAULT 240 COMMENT '冷却时间(分钟,同级别告警不重复发)',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_alert_type_enabled` (`alert_type`, `enabled`),
  CONSTRAINT `fk_alert_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_alert_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警规则配置表';


-- 16. alert_log — 预警触发日志
CREATE TABLE `alert_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '触发门店',
  `rule_id`           BIGINT UNSIGNED DEFAULT NULL COMMENT '触发规则',
  `alert_type`        VARCHAR(30)     NOT NULL COMMENT '预警类型',
  `level`             ENUM('urgent','warning','info') NOT NULL COMMENT '预警级别',
  `message`           VARCHAR(500)    NOT NULL COMMENT '预警消息',
  `sku_id`            BIGINT UNSIGNED DEFAULT NULL COMMENT '相关SKU',
  `current_stock`     INT             DEFAULT NULL COMMENT '触发时库存数',
  `is_resolved`       TINYINT         NOT NULL DEFAULT 0 COMMENT '0=未解决 1=已解决',
  `resolved_at`       DATETIME        DEFAULT NULL COMMENT '解决时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_rule_id` (`rule_id`),
  KEY `idx_alert_type` (`alert_type`),
  KEY `idx_level` (`level`),
  KEY `idx_is_resolved` (`is_resolved`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_alert_log_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警触发日志';


-- ============================================================================
-- 第九节：库存盘点
-- ============================================================================

-- 17. stock_check — 盘点任务
CREATE TABLE `stock_check` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '盘点门店',
  `check_no`          VARCHAR(30)     NOT NULL COMMENT '盘点单号',
  `type`              ENUM('full','partial','category') NOT NULL COMMENT '全盘/抽盘/品类盘',
  `operator_id`       BIGINT UNSIGNED NOT NULL COMMENT '盘点人',
  `status`            ENUM('in_progress','committed','confirmed','cancelled') NOT NULL DEFAULT 'in_progress',
  `expected_count`    INT             NOT NULL DEFAULT 0 COMMENT '系统账面数',
  `actual_count`      INT             NOT NULL DEFAULT 0 COMMENT '实盘数',
  `surplus_count`     INT             NOT NULL DEFAULT 0 COMMENT '盘盈数',
  `deficit_count`     INT             NOT NULL DEFAULT 0 COMMENT '盘亏数',
  `confirmed_by`      BIGINT UNSIGNED DEFAULT NULL COMMENT '确认人',
  `confirmed_at`      DATETIME        DEFAULT NULL COMMENT '确认时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_check_no` (`check_no`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_check_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_check_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_check_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='盘点任务表';


-- 18. stock_check_item — 盘点明细
CREATE TABLE `stock_check_item` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `check_id`          BIGINT UNSIGNED NOT NULL COMMENT '盘点任务ID',
  `imei`              VARCHAR(20)     NOT NULL COMMENT '串码',
  `system_status`     ENUM('pending_audit','in_stock','sold','returned','frozen') DEFAULT NULL COMMENT '系统记录状态',
  `actual_status`     ENUM('found','missing','extra','wrong_location','damaged') NOT NULL COMMENT '实盘结果',
  `system_location`   VARCHAR(50)     DEFAULT NULL COMMENT '系统记录货位',
  `actual_location`   VARCHAR(50)     DEFAULT NULL COMMENT '实盘货位',
  `remark`            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_check_id` (`check_id`),
  KEY `idx_imei` (`imei`),
  KEY `idx_actual_status` (`actual_status`),
  CONSTRAINT `fk_check_item_parent` FOREIGN KEY (`check_id`) REFERENCES `stock_check`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='盘点明细表';


-- ============================================================================
-- 第十节：审计与日志
-- ============================================================================

-- 19. audit_log — 入库审核日志
CREATE TABLE `audit_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `imei`              VARCHAR(20)     NOT NULL COMMENT '关联串码',
  `action`            VARCHAR(30)     NOT NULL COMMENT '操作:inbound_apply/inbound_approve/inbound_reject/inbound_resubmit',
  `operator_id`       BIGINT UNSIGNED NOT NULL COMMENT '操作人',
  `remark`            VARCHAR(200)    DEFAULT NULL COMMENT '备注/驳回原因',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_imei` (`imei`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_action` (`action`),
  KEY `idx_imei_action` (`imei`, `action`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_audit_imei` FOREIGN KEY (`imei`) REFERENCES `stock_ledger`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库审核日志';


-- 20. operation_log — 通用操作审计日志
CREATE TABLE `operation_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '操作门店',
  `operator_id`       BIGINT UNSIGNED NOT NULL COMMENT '操作人',
  `module`            VARCHAR(30)     NOT NULL COMMENT '模块:stock/sale/member/point/finance/system',
  `action`            VARCHAR(50)     NOT NULL COMMENT '操作:create/update/sale_outbound/return_approve/price_override/manual_adjust',
  `target_type`       VARCHAR(30)     NOT NULL COMMENT '操作对象类型:stock_ledger/sales_order/member/point_ledger',
  `target_id`         VARCHAR(100)    DEFAULT NULL COMMENT '操作对象ID/NO',
  `detail_json`       JSON            DEFAULT NULL COMMENT '操作详情(变更前后值)',
  `ip_address`        VARCHAR(45)     DEFAULT NULL COMMENT '操作IP',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_shop_id` (`shop_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_oplog_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_oplog_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用操作审计日志'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_h1 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_h2 VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p2027_h1 VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p2027_h2 VALUES LESS THAN (TO_DAYS('2028-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);


-- ============================================================================
-- 第十一节：通知与消息
-- ============================================================================

-- 21. sms_log — 短信通知记录
CREATE TABLE `sms_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`         BIGINT UNSIGNED DEFAULT NULL COMMENT '会员',
  `phone`             VARCHAR(11)     NOT NULL COMMENT '接收手机号',
  `content`           VARCHAR(500)    NOT NULL COMMENT '短信内容',
  `scene`             VARCHAR(30)     NOT NULL COMMENT '场景:purchase_notify/points_expire_remind/referral_reward/stock_alert',
  `status`            TINYINT         NOT NULL DEFAULT 0 COMMENT '0=待发送 1=已发送 2=发送失败',
  `retry_count`       INT             NOT NULL DEFAULT 0 COMMENT '重试次数',
  `sent_at`           DATETIME        DEFAULT NULL COMMENT '实际发送时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_status` (`status`),
  KEY `idx_scene` (`scene`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_status_retry` (`status`, `retry_count`),
  CONSTRAINT `fk_sms_member` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='短信通知记录';


-- 22. notification_outbox — 事务发件箱
CREATE TABLE `notification_outbox` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `aggregate_type`    VARCHAR(50)     NOT NULL COMMENT '聚合类型:sales_order/return_order/points_expire',
  `aggregate_id`      VARCHAR(100)    NOT NULL COMMENT '聚合ID',
  `event_type`        VARCHAR(50)     NOT NULL COMMENT '事件类型:order_created/return_approved/points_expiring',
  `payload_json`      JSON            NOT NULL COMMENT '事件负载',
  `status`            ENUM('pending','processing','published','failed') NOT NULL DEFAULT 'pending',
  `retry_count`       INT             NOT NULL DEFAULT 0 COMMENT '重试次数',
  `max_retries`       INT             NOT NULL DEFAULT 10 COMMENT '最大重试次数',
  `next_retry_at`     DATETIME        DEFAULT NULL COMMENT '下次重试时间',
  `error_msg`         VARCHAR(500)    DEFAULT NULL COMMENT '最后一次错误信息',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_next_retry` (`status`, `next_retry_at`),
  KEY `idx_aggregate` (`aggregate_type`, `aggregate_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='事务发件箱(Transactional Outbox)';


-- ============================================================================
-- 第十二节：日终对账
-- ============================================================================

-- 23. daily_reconcile — 日终对账记录
CREATE TABLE `daily_reconcile` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id`           BIGINT UNSIGNED NOT NULL COMMENT '对账门店',
  `reconcile_date`    DATE            NOT NULL COMMENT '对账日期',
  `check_type`        VARCHAR(30)     NOT NULL COMMENT '对账类型:stock_vs_order/points_vs_ledger/payment_vs_order/subsidy_vs_sales',
  `expected_count`    INT             NOT NULL COMMENT '预期数量',
  `actual_count`      INT             NOT NULL COMMENT '实际数量',
  `diff_count`        INT             NOT NULL DEFAULT 0 COMMENT '差异数量',
  `diff_detail`       JSON            DEFAULT NULL COMMENT '差异明细(JSON)',
  `status`            ENUM('pass','fail') NOT NULL COMMENT '对账结果',
  `resolved_by`       BIGINT UNSIGNED DEFAULT NULL COMMENT '处理人',
  `resolved_at`       DATETIME        DEFAULT NULL COMMENT '处理时间',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_date_type` (`shop_id`, `reconcile_date`, `check_type`),
  KEY `idx_status` (`status`),
  KEY `idx_reconcile_date` (`reconcile_date`),
  KEY `idx_check_type` (`check_type`),
  CONSTRAINT `fk_reconcile_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reconcile_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日终对账记录表';


-- ============================================================================
-- 附录A：数据库用户权限配置（生产环境）
-- ============================================================================

-- 应用读写账号
CREATE USER IF NOT EXISTS 'app_rw'@'%' IDENTIFIED BY '${APP_RW_PASSWORD}';
GRANT SELECT, INSERT ON `3c_retail`.* TO 'app_rw'@'%';

-- 销售单财务字段禁止更新：应用层保证，数据库层仅允许更新 return_status/returned_at
-- 积分流水禁止更新删除：应用层保证 INSERT ONLY
GRANT UPDATE (`return_status`, `returned_at`) ON `3c_retail`.`sales_order` TO 'app_rw'@'%';
GRANT UPDATE (`expired_amount`, `remaining_amount`) ON `3c_retail`.`point_ledger` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`member` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`stock_ledger` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`notification_outbox` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`commission_settlement` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`return_order` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`subsidy_record` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`sms_log` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`alert_log` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`stock_check` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`stock_check_item` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`daily_reconcile` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`shop` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`sys_user` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`product_sku` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`commission_rule` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`alert_rule` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`points_expire_log` TO 'app_rw'@'%';
GRANT UPDATE ON `3c_retail`.`trade_in_detail` TO 'app_rw'@'%';

-- 应用只读账号（AI智能体专用）
CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY '${APP_RO_PASSWORD}';
GRANT SELECT ON `3c_retail`.* TO 'app_ro'@'%';

-- DBA管理账号
CREATE USER IF NOT EXISTS 'dba_admin'@'localhost' IDENTIFIED BY '${DBA_PASSWORD}';
GRANT ALL PRIVILEGES ON `3c_retail`.* TO 'dba_admin'@'localhost' WITH GRANT OPTION;

FLUSH PRIVILEGES;


-- ============================================================================
-- 附录B：审计字段设计说明
-- ============================================================================
--
-- 每张表的审计字段策略:
--
-- | 表名                | created_at | updated_at        | deleted_at | version |
-- |---------------------|------------|-------------------|------------|---------|
-- | shop                | ✅          | ✅ ON UPDATE       | ✅ 软删除   | —       |
-- | sys_user            | ✅          | ✅ ON UPDATE       | ✅ 软删除   | —       |
-- | product_sku         | ✅          | ✅ ON UPDATE       | ✅ 软删除   | —       |
-- | stock_ledger        | ✅          | ✅ ON UPDATE       | —          | ✅ 乐观锁 |
-- | member              | ✅          | ✅ ON UPDATE       | ✅ 软删除   | ✅ 积分乐观锁 |
-- | sales_order         | ✅          | — (INSERT ONLY)   | —          | —       |
-- | payment_flow        | ✅          | —                  | —          | —       |
-- | trade_in_detail     | ✅          | —                  | —          | —       |
-- | return_order        | ✅          | ✅ ON UPDATE       | —          | —       |
-- | commission_rule     | ✅          | ✅ ON UPDATE       | —          | —       |
-- | commission_settlement| ✅         | ✅ ON UPDATE       | —          | —       |
-- | subsidy_record      | ✅          | ✅ ON UPDATE       | —          | —       |
-- | point_ledger        | ✅          | — (INSERT ONLY)   | —          | —       |
-- | points_expire_log   | ✅          | —                  | —          | —       |
-- | alert_rule          | ✅          | ✅ ON UPDATE       | —          | —       |
-- | alert_log           | ✅          | —                  | —          | —       |
-- | stock_check         | ✅          | ✅ ON UPDATE       | —          | —       |
-- | stock_check_item    | ✅          | —                  | —          | —       |
-- | audit_log           | ✅          | —                  | —          | —       |
-- | operation_log       | ✅          | —                  | —          | —       |
-- | sms_log             | ✅          | —                  | —          | —       |
-- | notification_outbox | ✅          | ✅ ON UPDATE       | —          | —       |
-- | daily_reconcile     | ✅          | —                  | —          | —       |
--
-- 软删除表: shop, sys_user, product_sku, member
-- 乐观锁表: stock_ledger(version), member(total_points_version)
-- INSERT ONLY表: sales_order, point_ledger, payment_flow


-- ============================================================================
-- 附录C：索引设计决策记录
-- ============================================================================
--
-- 1. 所有唯一约束同时是索引，不再单独列出
-- 2. 复合索引遵循高选择性字段在前的原则
-- 3. 针对 100万订单/10万会员/10万IMEI 的查询模式设计:
--    - sales_order 高频查询: shop_id + created_at (门店日报)
--    - sales_order 高频查询: salesperson_id + created_at (员工业绩)
--    - point_ledger 高频查询: member_id + change_type + created_at (会员积分明细)
--    - stock_ledger 高频查询: shop_id + status (门店库存看板)
--    - member 高频查询: phone (唯一查找)
-- 4. 分区表无需额外为 created_at 建联合索引的开头列
-- 5. JSON 字段不建索引（threshold_json, detail_json, payload_json）
--    如需 JSON 内字段查询，使用 MySQL 8.0 多值索引或 Generated Column


-- ============================================================================
-- 附录D：乐观锁设计决策记录
-- ============================================================================
--
-- stock_ledger.version:
--   用途: 防止同IMEI并发出库（两个销售员同时扫同一台手机）
--   使用方式:
--     SELECT id, imei, status, version, cost_price, sku_id
--     FROM stock_ledger WHERE imei = ? AND status = 'in_stock';
--
--     UPDATE stock_ledger
--     SET status = 'sold', version = version + 1
--     WHERE imei = ? AND status = 'in_stock' AND version = ?;
--
--     affected_rows = 0 → 并发冲突，事务回滚
--     affected_rows = 1 → 成功
--
-- member.total_points_version:
--   用途: 防止同一会员并发积分操作导致 total_points 错乱
--   使用方式:
--     SELECT id, total_points, total_points_version FROM member WHERE id = ? FOR UPDATE;
--     -- 计算新积分余额
--     UPDATE member SET total_points = ?, total_points_version = total_points_version + 1
--     WHERE id = ? AND total_points_version = ?;
--
--     affected_rows = 0 → 并发冲突，重试
--   补充: 积分操作前必须 SELECT ... FOR UPDATE 锁定member行，保证
--         point_ledger.balance_after 与 member.total_points 在同一事务内一致


-- ============================================================================
-- 附录E：完整唯一约束清单
-- ============================================================================
--
-- | 表名                | 唯一约束                    | 字段                                  |
-- |---------------------|----------------------------|---------------------------------------|
-- | shop                | uk_shop_no                 | shop_no                               |
-- | sys_user            | uk_phone                   | phone                                 |
-- | product_sku         | uk_brand_model_color_spec  | (brand, model, color, spec)           |
-- | stock_ledger        | uk_imei                    | imei                                  |
-- | member              | uk_phone                   | phone                                 |
-- | sales_order         | uk_order_no                | order_no                              |
-- | payment_flow        | uk_payment_no              | payment_no                            |
-- | return_order        | uk_return_no               | return_no                             |
-- | commission_settlement| uk_salesperson_period      | (salesperson_id, settlement_period)   |
-- | subsidy_record      | uk_subsidy_no              | subsidy_no                            |
-- | subsidy_record      | uk_order_no                | order_no                              |
-- | stock_check         | uk_check_no                | check_no                              |
-- | daily_reconcile     | uk_shop_date_type          | (shop_id, reconcile_date, check_type) |


-- ============================================================================
-- 附录F：完整外键关系清单
-- ============================================================================
--
-- | 子表                | 外键名                    | 子表字段         | 父表          | 父表字段 | ON DELETE     |
-- |---------------------|--------------------------|-----------------|---------------|---------|---------------|
-- | sys_user            | fk_user_shop             | shop_id         | shop          | id      | RESTRICT      |
-- | stock_ledger        | fk_stock_shop            | shop_id         | shop          | id      | RESTRICT      |
-- | stock_ledger        | fk_stock_sku             | sku_id          | product_sku   | id      | RESTRICT      |
-- | member              | fk_member_referrer       | referrer_id     | member        | id      | SET NULL      |
-- | sales_order         | fk_order_shop            | shop_id         | shop          | id      | RESTRICT      |
-- | sales_order         | fk_order_imei            | imei            | stock_ledger  | imei    | RESTRICT      |
-- | sales_order         | fk_order_sku             | sku_id          | product_sku   | id      | RESTRICT      |
-- | sales_order         | fk_order_member          | member_id       | member        | id      | SET NULL      |
-- | sales_order         | fk_order_salesperson     | salesperson_id  | sys_user      | id      | RESTRICT      |
-- | return_order        | fk_return_shop           | shop_id         | shop          | id      | RESTRICT      |
-- | return_order        | fk_return_imei           | imei            | stock_ledger  | imei    | RESTRICT      |
-- | return_order        | fk_return_auditor        | audited_by      | sys_user      | id      | RESTRICT      |
-- | commission_settlement| fk_settlement_shop       | shop_id         | shop          | id      | RESTRICT      |
-- | commission_settlement| fk_settlement_salesperson| salesperson_id  | sys_user      | id      | RESTRICT      |
-- | commission_settlement| fk_settlement_confirmer  | confirmed_by    | sys_user      | id      | RESTRICT      |
-- | subsidy_record      | fk_subsidy_shop          | shop_id         | shop          | id      | RESTRICT      |
-- | subsidy_record      | fk_subsidy_imei          | imei            | stock_ledger  | imei    | RESTRICT      |
-- | point_ledger        | fk_point_member          | member_id       | member        | id      | RESTRICT      |
-- | points_expire_log   | fk_expire_member         | member_id       | member        | id      | RESTRICT      |
-- | alert_rule          | fk_alert_shop            | shop_id         | shop          | id      | SET NULL      |
-- | alert_rule          | fk_alert_sku             | sku_id          | product_sku   | id      | SET NULL      |
-- | alert_log           | fk_alert_log_shop        | shop_id         | shop          | id      | RESTRICT      |
-- | stock_check         | fk_check_shop            | shop_id         | shop          | id      | RESTRICT      |
-- | stock_check         | fk_check_operator        | operator_id     | sys_user      | id      | RESTRICT      |
-- | stock_check         | fk_check_confirmer       | confirmed_by    | sys_user      | id      | RESTRICT      |
-- | stock_check_item    | fk_check_item_parent     | check_id        | stock_check   | id      | CASCADE       |
-- | audit_log           | fk_audit_imei            | imei            | stock_ledger  | imei    | RESTRICT      |
-- | audit_log           | fk_audit_operator        | operator_id     | sys_user      | id      | RESTRICT      |
-- | operation_log       | fk_oplog_shop            | shop_id         | shop          | id      | RESTRICT      |
-- | operation_log       | fk_oplog_operator        | operator_id     | sys_user      | id      | RESTRICT      |
-- | sms_log             | fk_sms_member            | member_id       | member        | id      | SET NULL      |
-- | daily_reconcile     | fk_reconcile_shop        | shop_id         | shop          | id      | RESTRICT      |
-- | daily_reconcile     | fk_reconcile_resolver    | resolved_by     | sys_user      | id      | SET NULL      |
--
-- 共计 33 条外键约束
