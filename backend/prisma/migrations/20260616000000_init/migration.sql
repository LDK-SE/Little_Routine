-- CreateTable
CREATE TABLE `shop` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_no` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `address` VARCHAR(200) NULL,
    `contact_phone` VARCHAR(11) NULL,
    `status` ENUM('1', '0') NOT NULL DEFAULT '1',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `shop_shop_no_key`(`shop_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `sys_role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `phone` VARCHAR(11) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('1', '0') NOT NULL DEFAULT '1',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `sys_user_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_role` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uk_user_role`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `brand` VARCHAR(50) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `category` VARCHAR(30) NULL,
    `status` ENUM('1', '0') NOT NULL DEFAULT '1',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_category`(`category`),
    INDEX `idx_status`(`status`),
    INDEX `idx_deleted_at`(`deleted_at`),
    INDEX `idx_brand_model_status`(`brand`, `model`, `status`),
    UNIQUE INDEX `uk_brand_model`(`brand`, `model`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_sku` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `product_id` BIGINT UNSIGNED NOT NULL,
    `color` VARCHAR(30) NOT NULL,
    `spec` VARCHAR(50) NOT NULL,
    `barcode` VARCHAR(50) NULL,
    `retail_price` DECIMAL(10, 2) NULL,
    `min_sale_price` DECIMAL(10, 2) NULL,
    `status` ENUM('1', '0') NOT NULL DEFAULT '1',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_barcode`(`barcode`),
    INDEX `idx_status`(`status`),
    INDEX `idx_deleted_at`(`deleted_at`),
    UNIQUE INDEX `uk_product_color_spec`(`product_id`, `color`, `spec`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imei_stock` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `sku_id` BIGINT UNSIGNED NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `batch_no` VARCHAR(50) NULL,
    `location` VARCHAR(50) NULL,
    `cost_price` DECIMAL(10, 2) NULL,
    `channel` VARCHAR(50) NULL,
    `status` ENUM('pending_audit', 'in_stock', 'locked', 'sold', 'returned', 'scrapped') NOT NULL DEFAULT 'pending_audit',
    `audit_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `imei_stock_imei_key`(`imei`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_sku_id`(`sku_id`),
    INDEX `idx_status`(`status`),
    INDEX `idx_audit_status`(`audit_status`),
    INDEX `idx_location`(`location`),
    INDEX `idx_batch_no`(`batch_no`),
    INDEX `idx_shop_status`(`shop_id`, `status`),
    INDEX `idx_sku_status`(`sku_id`, `status`),
    INDEX `idx_status_location`(`status`, `location`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_ledger` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `change_type` ENUM('inbound', 'inbound_audit_approve', 'inbound_audit_reject', 'outbound', 'outbound_lock', 'outbound_unlock', 'return', 'scrap') NOT NULL,
    `from_status` VARCHAR(20) NULL,
    `to_status` VARCHAR(20) NOT NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `order_no` VARCHAR(30) NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_imei`(`imei`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_change_type`(`change_type`),
    INDEX `idx_operator_id`(`operator_id`),
    INDEX `idx_order_no`(`order_no`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_imei_created`(`imei`, `created_at`),
    INDEX `idx_shop_type_created`(`shop_id`, `change_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `supplier_name` VARCHAR(100) NULL,
    `supplier_contact` VARCHAR(50) NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `status` ENUM('pending', 'approved', 'received', 'cancelled') NOT NULL DEFAULT 'pending',
    `approved_by` BIGINT UNSIGNED NULL,
    `approved_at` DATETIME(0) NULL,
    `received_at` DATETIME(0) NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `purchase_order_order_no_key`(`order_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_status`(`status`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_deleted_at`(`deleted_at`),
    INDEX `idx_shop_status`(`shop_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_item` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `purchase_order_id` BIGINT UNSIGNED NOT NULL,
    `sku_id` BIGINT UNSIGNED NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_cost` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_po_id`(`purchase_order_id`),
    INDEX `idx_sku_id`(`sku_id`),
    INDEX `idx_imei`(`imei`),
    INDEX `idx_po_sku`(`purchase_order_id`, `sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(11) NOT NULL,
    `name` VARCHAR(50) NULL,
    `address` VARCHAR(200) NULL,
    `license_plate` VARCHAR(20) NULL,
    `backup_phone` VARCHAR(11) NULL,
    `last_purchase_model` VARCHAR(100) NULL,
    `total_points` INTEGER NOT NULL DEFAULT 0,
    `total_points_version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `referrer_id` BIGINT UNSIGNED NULL,
    `status` ENUM('1', '0') NOT NULL DEFAULT '1',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `member_phone_key`(`phone`),
    INDEX `idx_referrer_id`(`referrer_id`),
    INDEX `idx_status`(`status`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_deleted_at`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_referral` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `referrer_id` BIGINT UNSIGNED NOT NULL,
    `referee_id` BIGINT UNSIGNED NOT NULL,
    `reward_granted` BOOLEAN NOT NULL DEFAULT false,
    `reward_granted_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_referee_id`(`referee_id`),
    UNIQUE INDEX `uk_referrer_referee`(`referrer_id`, `referee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `point_ledger` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `member_id` BIGINT UNSIGNED NOT NULL,
    `change_type` ENUM('earn', 'redeem', 'expire', 'referral', 'manual_adjust') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `order_no` VARCHAR(30) NULL,
    `order_time` DATETIME(0) NULL,
    `product_model` VARCHAR(100) NULL,
    `unit_price` DECIMAL(10, 2) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `expires_at` DATE NULL,
    `expired_amount` INTEGER NOT NULL DEFAULT 0,
    `remaining_amount` INTEGER NOT NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_member_id`(`member_id`),
    INDEX `idx_order_no`(`order_no`),
    INDEX `idx_change_type`(`change_type`),
    INDEX `idx_expires_at`(`expires_at`),
    INDEX `idx_member_type_created`(`member_id`, `change_type`, `created_at`),
    INDEX `idx_member_expires_remaining`(`member_id`, `expires_at`, `remaining_amount`),
    PRIMARY KEY (`id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `member_id` BIGINT UNSIGNED NULL,
    `salesperson_id` BIGINT UNSIGNED NOT NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `total_cost_snapshot` DECIMAL(10, 2) NOT NULL,
    `total_subsidy` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_commission` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `gross_profit` DECIMAL(10, 2) NOT NULL,
    `actual_paid` DECIMAL(10, 2) NOT NULL,
    `points_used_total` INTEGER NOT NULL DEFAULT 0,
    `payment_method` ENUM('cash', 'wechat', 'alipay', 'bank_transfer', 'trade_in', 'subsidy', 'refund') NOT NULL,
    `return_status` ENUM('normal', 'return_requested', 'returning', 'returned') NOT NULL DEFAULT 'normal',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `sale_order_order_no_key`(`order_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_member_id`(`member_id`),
    INDEX `idx_salesperson_id`(`salesperson_id`),
    INDEX `idx_payment_method`(`payment_method`),
    INDEX `idx_return_status`(`return_status`),
    INDEX `idx_deleted_at`(`deleted_at`),
    INDEX `idx_shop_created`(`shop_id`, `created_at`),
    INDEX `idx_salesperson_created`(`salesperson_id`, `created_at`),
    INDEX `idx_member_created`(`member_id`, `created_at`),
    UNIQUE INDEX `uk_order_no_created`(`order_no`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_item` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `sku_id` BIGINT UNSIGNED NOT NULL,
    `sale_price` DECIMAL(10, 2) NOT NULL,
    `cost_price_snapshot` DECIMAL(10, 2) NOT NULL,
    `subsidy_income` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `commission` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `gross_profit` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_order_id`(`order_id`),
    INDEX `idx_imei`(`imei`),
    INDEX `idx_sku_id`(`sku_id`),
    INDEX `idx_order_imei`(`order_id`, `imei`),
    PRIMARY KEY (`id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_flow` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `payment_no` VARCHAR(30) NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `method` ENUM('cash', 'wechat', 'alipay', 'bank_transfer', 'trade_in', 'subsidy', 'refund') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `refund_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `payment_type` ENUM('normal', 'refund') NOT NULL DEFAULT 'normal',
    `external_transaction_id` VARCHAR(64) NULL,
    `reconcile_status` ENUM('pending', 'matched', 'mismatched') NOT NULL DEFAULT 'pending',
    `reconciled_at` DATETIME(0) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `payment_flow_payment_no_key`(`payment_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_order_no`(`order_no`),
    INDEX `idx_external_transaction_id`(`external_transaction_id`),
    INDEX `idx_reconcile_status`(`reconcile_status`),
    INDEX `idx_payment_type`(`payment_type`),
    INDEX `idx_method_type`(`method`, `payment_type`),
    INDEX `idx_shop_created`(`shop_id`, `created_at`),
    UNIQUE INDEX `uk_payment_no_created`(`payment_no`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `return_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `return_no` VARCHAR(30) NOT NULL,
    `original_order_no` VARCHAR(30) NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `return_reason` VARCHAR(500) NOT NULL,
    `return_type` ENUM('full_return', 'exchange', 'refund_only') NOT NULL,
    `refund_amount` DECIMAL(10, 2) NOT NULL,
    `points_recalled` INTEGER NOT NULL DEFAULT 0,
    `commission_recalled` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `subsidy_recalled` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `audit_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `audited_by` BIGINT UNSIGNED NULL,
    `audited_at` DATETIME(0) NULL,
    `completed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `return_order_return_no_key`(`return_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_original_order_no`(`original_order_no`),
    INDEX `idx_imei`(`imei`),
    INDEX `idx_audit_status`(`audit_status`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_deleted_at`(`deleted_at`),
    INDEX `idx_order_imei`(`original_order_no`, `imei`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_in_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `old_imei` VARCHAR(20) NULL,
    `old_brand` VARCHAR(50) NULL,
    `old_model` VARCHAR(100) NULL,
    `old_condition` VARCHAR(50) NULL,
    `appraised_value` DECIMAL(10, 2) NOT NULL,
    `actual_deduction` DECIMAL(10, 2) NOT NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_order_no`(`order_no`),
    INDEX `idx_old_imei`(`old_imei`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_rule` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `brand` VARCHAR(50) NULL,
    `model` VARCHAR(100) NULL,
    `min_price` DECIMAL(10, 2) NULL,
    `max_price` DECIMAL(10, 2) NULL,
    `commission_type` ENUM('fixed', 'percentage', 'tiered') NOT NULL DEFAULT 'fixed',
    `commission_value` DECIMAL(10, 2) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_brand_model`(`brand`, `model`),
    INDEX `idx_status_priority`(`status`, `priority`),
    INDEX `idx_price_range`(`min_price`, `max_price`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_ledger` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `salesperson_id` BIGINT UNSIGNED NOT NULL,
    `settlement_period` VARCHAR(7) NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `estimated_commission` DECIMAL(10, 2) NOT NULL,
    `adjustment` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `actual_commission` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('pending', 'confirmed', 'paid') NOT NULL DEFAULT 'pending',
    `confirmed_by` BIGINT UNSIGNED NULL,
    `confirmed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_order_no`(`order_no`),
    INDEX `idx_settlement_period`(`settlement_period`),
    INDEX `idx_status`(`status`),
    UNIQUE INDEX `uk_salesperson_period_order`(`salesperson_id`, `settlement_period`, `order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `national_subsidy` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `subsidy_no` VARCHAR(30) NOT NULL,
    `order_no` VARCHAR(30) NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `applied_amount` DECIMAL(10, 2) NOT NULL,
    `approved_amount` DECIMAL(10, 2) NULL,
    `status` ENUM('pending_submit', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'recalled') NOT NULL DEFAULT 'pending_submit',
    `submitted_at` DATETIME(0) NULL,
    `reviewed_at` DATETIME(0) NULL,
    `disbursed_at` DATETIME(0) NULL,
    `recalled_at` DATETIME(0) NULL,
    `external_ref_no` VARCHAR(64) NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `national_subsidy_subsidy_no_key`(`subsidy_no`),
    UNIQUE INDEX `national_subsidy_order_no_key`(`order_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_imei`(`imei`),
    INDEX `idx_status`(`status`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `imei` VARCHAR(20) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_imei`(`imei`),
    INDEX `idx_operator_id`(`operator_id`),
    INDEX `idx_action`(`action`),
    INDEX `idx_imei_action`(`imei`, `action`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `module` VARCHAR(30) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_type` VARCHAR(30) NOT NULL,
    `target_id` VARCHAR(100) NULL,
    `detail_json` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_operator_id`(`operator_id`),
    INDEX `idx_module_action`(`module`, `action`),
    INDEX `idx_target`(`target_type`, `target_id`),
    PRIMARY KEY (`id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_chat_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `user_role` VARCHAR(20) NOT NULL,
    `query` VARCHAR(1000) NOT NULL,
    `intent` VARCHAR(50) NULL,
    `function_called` VARCHAR(50) NULL,
    `confidence` DECIMAL(5, 2) NULL,
    `reply` TEXT NULL,
    `is_transferred` BOOLEAN NOT NULL DEFAULT false,
    `ticket_id` VARCHAR(50) NULL,
    `latency_ms` INTEGER NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_user_id`(`user_id`),
    INDEX `idx_user_role`(`user_role`),
    INDEX `idx_intent`(`intent`),
    INDEX `idx_function_called`(`function_called`),
    INDEX `idx_is_transferred`(`is_transferred`),
    INDEX `idx_confidence`(`confidence`),
    INDEX `idx_user_created`(`user_id`, `created_at`),
    INDEX `idx_latency`(`latency_ms`),
    PRIMARY KEY (`id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_outbox` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `aggregate_type` VARCHAR(50) NOT NULL,
    `aggregate_id` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `payload_json` JSON NOT NULL,
    `status` ENUM('pending', 'processing', 'published', 'failed') NOT NULL DEFAULT 'pending',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `next_retry_at` DATETIME(0) NULL,
    `error_msg` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_status_next_retry`(`status`, `next_retry_at`),
    INDEX `idx_aggregate`(`aggregate_type`, `aggregate_id`),
    INDEX `idx_event_type`(`event_type`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sms_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `member_id` BIGINT UNSIGNED NULL,
    `phone` VARCHAR(11) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `scene` VARCHAR(30) NOT NULL,
    `status` ENUM('0', '1', '2') NOT NULL DEFAULT '0',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_member_id`(`member_id`),
    INDEX `idx_status`(`status`),
    INDEX `idx_scene`(`scene`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_status_retry`(`status`, `retry_count`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_reconcile` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `reconcile_date` DATE NOT NULL,
    `check_type` ENUM('stock_vs_order', 'points_vs_ledger', 'payment_vs_order', 'subsidy_vs_sales') NOT NULL,
    `expected_count` INTEGER NOT NULL,
    `actual_count` INTEGER NOT NULL,
    `diff_count` INTEGER NOT NULL DEFAULT 0,
    `diff_detail` JSON NULL,
    `status` ENUM('pass', 'fail') NOT NULL,
    `resolved_by` BIGINT UNSIGNED NULL,
    `resolved_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_status`(`status`),
    INDEX `idx_reconcile_date`(`reconcile_date`),
    INDEX `idx_check_type`(`check_type`),
    UNIQUE INDEX `uk_shop_date_type`(`shop_id`, `reconcile_date`, `check_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `points_expire_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `member_id` BIGINT UNSIGNED NOT NULL,
    `total_expired` INTEGER NOT NULL,
    `affected_rows` INTEGER NOT NULL,
    `executed_at` DATETIME(0) NOT NULL,
    `status` ENUM('success', 'partial', 'failed') NOT NULL,
    `error_msg` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_member_id`(`member_id`),
    INDEX `idx_executed_at`(`executed_at`),
    INDEX `idx_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alert_rule` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NULL,
    `sku_id` BIGINT UNSIGNED NULL,
    `alert_type` ENUM('low_stock', 'slow_moving', 'price_anomaly', 'negative_profit') NOT NULL,
    `threshold_json` JSON NOT NULL,
    `notify_channels` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `cooldown_minutes` INTEGER NOT NULL DEFAULT 240,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_sku_id`(`sku_id`),
    INDEX `idx_alert_type_enabled`(`alert_type`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alert_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `rule_id` BIGINT UNSIGNED NULL,
    `alert_type` VARCHAR(30) NOT NULL,
    `level` ENUM('urgent', 'warning', 'info') NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `sku_id` BIGINT UNSIGNED NULL,
    `current_stock` INTEGER NULL,
    `is_resolved` BOOLEAN NOT NULL DEFAULT false,
    `resolved_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_rule_id`(`rule_id`),
    INDEX `idx_alert_type`(`alert_type`),
    INDEX `idx_level`(`level`),
    INDEX `idx_is_resolved`(`is_resolved`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_check` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NOT NULL,
    `check_no` VARCHAR(30) NOT NULL,
    `type` ENUM('full', 'partial', 'category') NOT NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('in_progress', 'committed', 'confirmed', 'cancelled') NOT NULL DEFAULT 'in_progress',
    `expected_count` INTEGER NOT NULL DEFAULT 0,
    `actual_count` INTEGER NOT NULL DEFAULT 0,
    `surplus_count` INTEGER NOT NULL DEFAULT 0,
    `deficit_count` INTEGER NOT NULL DEFAULT 0,
    `confirmed_by` BIGINT UNSIGNED NULL,
    `confirmed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `stock_check_check_no_key`(`check_no`),
    INDEX `idx_shop_id`(`shop_id`),
    INDEX `idx_operator_id`(`operator_id`),
    INDEX `idx_status`(`status`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_check_item` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `check_id` BIGINT UNSIGNED NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `system_status` ENUM('pending_audit', 'in_stock', 'locked', 'sold', 'returned', 'scrapped') NULL,
    `actual_status` ENUM('found', 'missing', 'extra', 'wrong_location', 'damaged') NOT NULL,
    `system_location` VARCHAR(50) NULL,
    `actual_location` VARCHAR(50) NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_check_id`(`check_id`),
    INDEX `idx_imei`(`imei`),
    INDEX `idx_actual_status`(`actual_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_sku` ADD CONSTRAINT `product_sku_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imei_stock` ADD CONSTRAINT `imei_stock_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imei_stock` ADD CONSTRAINT `imei_stock_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_ledger` ADD CONSTRAINT `stock_ledger_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_ledger` ADD CONSTRAINT `stock_ledger_imei_fkey` FOREIGN KEY (`imei`) REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_ledger` ADD CONSTRAINT `stock_ledger_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member` ADD CONSTRAINT `member_referrer_id_fkey` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_referral` ADD CONSTRAINT `member_referral_referrer_id_fkey` FOREIGN KEY (`referrer_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_referral` ADD CONSTRAINT `member_referral_referee_id_fkey` FOREIGN KEY (`referee_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `point_ledger` ADD CONSTRAINT `point_ledger_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_order` ADD CONSTRAINT `sale_order_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_order` ADD CONSTRAINT `sale_order_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_order` ADD CONSTRAINT `sale_order_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item` ADD CONSTRAINT `sale_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `sale_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item` ADD CONSTRAINT `sale_item_imei_fkey` FOREIGN KEY (`imei`) REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item` ADD CONSTRAINT `sale_item_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_flow` ADD CONSTRAINT `payment_flow_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_flow` ADD CONSTRAINT `payment_flow_order_no_fkey` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_order` ADD CONSTRAINT `return_order_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_order` ADD CONSTRAINT `return_order_original_order_no_fkey` FOREIGN KEY (`original_order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_order` ADD CONSTRAINT `return_order_imei_fkey` FOREIGN KEY (`imei`) REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_order` ADD CONSTRAINT `return_order_audited_by_fkey` FOREIGN KEY (`audited_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_in_order` ADD CONSTRAINT `trade_in_order_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_in_order` ADD CONSTRAINT `trade_in_order_order_no_fkey` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_order_no_fkey` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_confirmed_by_fkey` FOREIGN KEY (`confirmed_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `national_subsidy` ADD CONSTRAINT `national_subsidy_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `national_subsidy` ADD CONSTRAINT `national_subsidy_order_no_fkey` FOREIGN KEY (`order_no`) REFERENCES `sale_order`(`order_no`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `national_subsidy` ADD CONSTRAINT `national_subsidy_imei_fkey` FOREIGN KEY (`imei`) REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_imei_fkey` FOREIGN KEY (`imei`) REFERENCES `imei_stock`(`imei`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_log` ADD CONSTRAINT `system_log_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_log` ADD CONSTRAINT `system_log_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sms_log` ADD CONSTRAINT `sms_log_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reconcile` ADD CONSTRAINT `daily_reconcile_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reconcile` ADD CONSTRAINT `daily_reconcile_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `points_expire_log` ADD CONSTRAINT `points_expire_log_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_rule` ADD CONSTRAINT `alert_rule_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_rule` ADD CONSTRAINT `alert_rule_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_sku`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_log` ADD CONSTRAINT `alert_log_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_log` ADD CONSTRAINT `alert_log_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `alert_rule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_check` ADD CONSTRAINT `stock_check_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_check` ADD CONSTRAINT `stock_check_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_check` ADD CONSTRAINT `stock_check_confirmed_by_fkey` FOREIGN KEY (`confirmed_by`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_check_item` ADD CONSTRAINT `stock_check_item_check_id_fkey` FOREIGN KEY (`check_id`) REFERENCES `stock_check`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
