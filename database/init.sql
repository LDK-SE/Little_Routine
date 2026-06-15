-- ============================================================================
-- 3C数码零售系统 · 数据库初始化脚本
-- ============================================================================
-- 复制自: DB_Production_Design.sql (schema.sql)
-- 用途:    Docker Compose 首次启动时自动创建表结构
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `3c_retail`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE `3c_retail`;

-- 门店表
CREATE TABLE IF NOT EXISTS `shop` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shop_no`         VARCHAR(20)     NOT NULL,
  `name`            VARCHAR(100)    NOT NULL,
  `address`         VARCHAR(200)    DEFAULT NULL,
  `contact_phone`   VARCHAR(11)     DEFAULT NULL,
  `status`          TINYINT         NOT NULL DEFAULT 1,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_no` (`shop_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 系统用户表
CREATE TABLE IF NOT EXISTS `sys_user` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shop_id`         BIGINT UNSIGNED NOT NULL,
  `phone`           VARCHAR(11)     NOT NULL,
  `name`            VARCHAR(50)     NOT NULL,
  `role`            VARCHAR(30)     NOT NULL DEFAULT 'salesperson',
  `status`          TINYINT         NOT NULL DEFAULT 1,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_shop_id` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入默认门店
INSERT IGNORE INTO `shop` (`shop_no`, `name`, `status`) VALUES ('S001', '总店', 1);
