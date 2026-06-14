# PROJECT CONTEXT — 3C数码零售 ERP + CRM + AI 智能体系统

> **Single Source of Truth（唯一标准）**
>
> 版本：V1.0-FROZEN
> 冻结日期：2026-06-14
> 适用范围：全部开发活动（Claude / Cursor / Claude Code / 手动开发）
>
> **禁止创建任何替代本文档的设计文件。所有设计决策以本文档为准。**

---

## 目录

1. [项目介绍](#1-项目介绍)
2. [技术栈（冻结）](#2-技术栈冻结)
3. [业务规则（冻结）](#3-业务规则冻结)
4. [权限体系](#4-权限体系)
5. [数据库设计](#5-数据库设计)
6. [API模块](#6-api模块)
7. [AI规则（冻结）](#7-ai规则冻结)
8. [部署规则](#8-部署规则)
9. [安全规则](#9-安全规则)
10. [审计规则](#10-审计规则)
11. [扩展规则](#11-扩展规则)
12. [风险清单](#12-风险清单)

---

## 1. 项目介绍

### 1.1 产品定位

面向3C数码单店/连锁门店的**确定性交易账本 + AI只读增强**门店经营SaaS。

### 1.2 核心用户

| 角色 | 身份 | 核心诉求 |
|------|------|----------|
| 老板/店长 | 门店经营决策者 | 实时毛利、库存水位、员工业绩、资金流水 |
| 销售员 | 一线开单 | 扫码出库快、查库存准、算提成透明 |
| 仓管员 | 入库验收 | 扫码入库不重不漏、审核流程清晰 |
| 会员(C端) | 消费者 | 查积分、消费记录、参加老带新 |
| AI客服 | 系统角色 | 只读查询，不操作任何写链路 |

### 1.3 项目目标

1. 支撑单店→连锁门店全生命周期
2. IMEI全生命周期管理（入库→在库→销售→退货）
3. 会员积分体系（获取/消耗/过期/推荐）
4. 销售提成（规则配置/预估/月度结算）
5. 国补管理（申请/审批/拨付/追回）
6. AI智能助手（库存/毛利/积分/订单查询，只读）

---

## 2. 技术栈（冻结）

### 2.1 前端

| 层 | 技术 | 版本要求 |
|----|------|----------|
| 框架 | 微信小程序原生 | 基础库 ≥ 3.0.0 |
| UI | 原生 WXML + WXSS | — |
| 状态管理 | 全局 app.globalData | — |

### 2.2 后端

| 层 | 技术 | 版本要求 |
|----|------|----------|
| 运行时 | Node.js | ≥ 20 LTS |
| 框架 | NestJS | ≥ 10.x |
| ORM | Prisma | ≥ 5.x |
| 数据库 | MySQL | 8.0.36+ |
| 缓存 | Redis | 7.2+ |
| 对象存储 | 腾讯云 COS | — |
| 短信 | 腾讯云短信 | — |
| AI引擎 | Dify + Claude API | Claude Opus 4.x / Sonnet 4.x |
| 日志 | Pino | ≥ 8.x |
| API文档 | Swagger | @nestjs/swagger |
| 定时任务 | @nestjs/schedule | ≥ 4.x |
| 监控 | Prometheus + Grafana | — |

### 2.3 部署

| 层 | 技术 |
|----|------|
| 容器 | Docker + Docker Compose |
| 反向代理 | Nginx 1.25 |
| 云平台 | 腾讯云 |
| CI/CD | 待定（建议 GitHub Actions） |

---

## 3. 业务规则（冻结）

### 3.1 库存规则

| # | 规则 | 实现方式 |
|---|------|----------|
| 1 | IMEI全局唯一 | `imei_stock.uk_imei` 唯一约束 |
| 2 | 一个IMEI只能销售一次 | 乐观锁 `version` + 状态机 |
| 3 | 库存不可为负 | 应用层校验 + `status` 状态机 |
| 4 | 入库需审核 | pending_audit → approved → in_stock |
| 5 | 出库需IMEI在库 | `WHERE status='in_stock' AND version=?` |
| 6 | 退货回库需审核 | sold → returned → 审核 → in_stock |

### 3.2 财务规则

| # | 规则 | 实现方式 |
|---|------|----------|
| 1 | 销售成本永久固化 | `sale_order.cost_price_snapshot` INSERT后禁止UPDATE |
| 2 | 毛利永久固化 | `sale_order.gross_profit` INSERT后禁止UPDATE |
| 3 | 所有金额字段使用Decimal | DECIMAL(10,2)，禁止FLOAT/DOUBLE |
| 4 | 所有时间统一UTC存储 | DATETIME，应用层转换时区 |
| 5 | 售价低于成本需审批 | 后端硬校验 + 老板二次确认 |
| 6 | 提成预估在销售时固化 | 月度结算时根据退货调整实发金额 |

### 3.3 积分规则

| # | 规则 | 实现方式 |
|---|------|----------|
| 1 | 消费：1元 = 1积分 | 按实付金额(actual_paid)计算 |
| 2 | 抵现：100积分 = 1元 | 至少100积分方可抵现 |
| 3 | 换购：≥3000积分 | 入口不可见 + 接口拦截 |
| 4 | 仅一级推荐 | referrer_id 写入后不可改 |
| 5 | 推荐奖励：双方各200积分 | 被推荐人首单消费后触发 |
| 6 | 积分流水不可修改 | INSERT ONLY + 数据库层REVOKE UPDATE/DELETE |
| 7 | 错误用负数冲正 | manual_adjust 类型插入相反记录 |
| 8 | 积分年度滚动过期 | 次年12月31日过期，FIFO消耗 |
| 9 | 会员积分余额 = SUM(point_ledger.amount) | 每日自动对账 |

### 3.4 订单规则

| # | 规则 | 实现方式 |
|---|------|----------|
| 1 | 订单采用软删除 | `sale_order.deleted_at`，财务字段不可改 |
| 2 | 财务字段(成本/毛利/提成)不可更新 | 应用层 + 数据库层双重保护 |
| 3 | 退货生成独立退货单 | `return_order` 表，不修改原销售单 |

### 3.5 AI规则

| # | 规则 | 实现方式 |
|---|------|----------|
| 1 | AI只读 | JWT `access_level: ai_readonly` + ReadonlyGuard |
| 2 | 置信度<85%自动转人工 | Dify工作流置信度判断节点 |
| 3 | AI不返回成本/IMEI完整串码 | 脱敏中间件 + API层过滤 |
| 4 | AI查询任意会员需验证 | 商家端AI需验证查询权限 |

---

## 4. 权限体系

### 4.1 角色定义

| 角色 | sys_role.code | 说明 |
|------|---------------|------|
| 老板/店长 | `owner` | 全部权限 |
| 销售员 | `salesperson` | 库存查询/出库/会员查看/售价修改 |
| 仓管员 | `warehouse` | 库存查询/入库申请 |
| 仓管主管 | `warehouse_supervisor` | 仓管员权限 + 入库审核 + 盘点确认 |
| 会员(C端) | `member` | 仅查看自己的积分/订单/推荐 |
| AI系统 | `ai_agent` | 全部只读(GET only) |

### 4.2 权限矩阵

| 权限 | owner | salesperson | warehouse | warehouse_supervisor | member | ai_agent |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| 库存查询 | ✅ | ✅ | ✅ | ✅ | — | ✅(R) |
| 入库申请 | ✅ | — | ✅ | ✅ | — | — |
| 入库审核 | ✅ | — | — | ✅ | — | — |
| 扫码出库 | ✅ | ✅ | — | — | — | — |
| 售价修改 | ✅ | ✅(限) | — | — | — | — |
| 会员查看 | ✅ | ✅ | — | — | 仅自己 | ✅(R) |
| 财务报表 | ✅ | — | — | — | — | ✅(R) |
| 系统设置 | ✅ | — | — | — | — | — |
| AI对话 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 4.3 权限实现

```
JWT Payload:
{
  "sub": "<user_id>",
  "role": "<role_code>",
  "shop_id": "<shop_id>",
  "access_level": "normal | ai_readonly",
  "permissions": ["read:inventory", "write:sale", ...],
  "iat": ...,
  "exp": ...
}

鉴权链路:
Request → JwtAuthGuard(验证签名+有效期) → RolesGuard(校验role+permissions) → ReadonlyGuard(校验access_level) → Controller

AI Token 特殊校验:
- access_level = "ai_readonly"
- ReadonlyGuard 强制要求 HTTP method = GET
- JwtStrategy.validate() 中标记 req.isReadonly = true
- 双重校验: JWT claims + Guard
```

### 4.4 Token管理

| 类型 | 有效期 | 刷新策略 |
|------|--------|----------|
| 商家端JWT | 2小时 | Refresh Token 7天 |
| 会员端JWT | 24小时 | Refresh Token 30天 |
| AI专用JWT | 24小时 | 定时轮换 |

**强制下线**: Redis维护Token黑名单（key=`blacklist:<jti>`，TTL=Token剩余有效期），`JwtStrategy.validate()` 先查黑名单。

---

## 5. 数据库设计

### 5.1 数据库配置

```
数据库: MySQL 8.0.36
引擎: InnoDB
字符集: utf8mb4
排序规则: utf8mb4_unicode_ci
隔离级别: REPEATABLE READ
Binlog格式: ROW
```

### 5.2 表清单（30张表）

#### 基础架构

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `shop` | 门店/连锁管理 | <100 | ✅ |
| `sys_user` | 系统用户/员工 | <500 | ✅ |
| `sys_role` | 角色定义 | <20 | — |
| `sys_user_role` | 用户-角色关联 | <1000 | — |

#### 商品与库存

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `product` | 产品基础信息(SPU) | <1000 | ✅ |
| `product_sku` | 产品多规格(SKU) | <5000 | ✅ |
| `imei_stock` | IMEI库存主表 | 10万 | — |
| `stock_ledger` | 库存变动流水 | 50万 | — |
| `purchase_order` | 采购订单 | <5万 | ✅ |
| `purchase_item` | 采购明细 | <50万 | — |

#### 会员与积分

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `member` | 会员表 | 10万 | ✅ |
| `member_referral` | 推荐关系表 | 10万 | — |
| `point_ledger` | 积分流水(INSERT ONLY) | 500万(分区) | — |

#### 销售与财务

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `sale_order` | 销售订单(财务字段INSERT ONLY) | 100万(分区) | ✅ |
| `sale_item` | 销售明细 | 100万(分区) | — |
| `payment_flow` | 收款流水 | 100万(分区) | — |
| `return_order` | 退货单 | <10万 | ✅ |
| `trade_in_order` | 以旧换新订单 | <50万 | — |

#### 提成与国补

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `commission_rule` | 提成规则配置 | <100 | — |
| `commission_ledger` | 提成流水/结算 | <10万 | — |
| `national_subsidy` | 国补记录 | <50万 | — |

#### 审计与日志

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `audit_log` | 入库审核日志 | <50万 | — |
| `system_log` | 通用操作审计日志 | <500万(分区) | — |
| `ai_chat_log` | AI对话日志 | <500万(分区) | — |

#### 通知与对账

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `notification_outbox` | 事务发件箱 | <100万 | — |
| `sms_log` | 短信发送记录 | <200万 | — |
| `daily_reconcile` | 日终对账记录 | <1万 | — |
| `points_expire_log` | 积分过期执行日志 | <10万 | — |

#### 预警与盘点

| 表名 | 说明 | 预估行数 | 软删除 |
|------|------|----------|:--:|
| `alert_rule` | 预警规则配置 | <100 | — |
| `alert_log` | 预警触发日志 | <10万 | — |
| `stock_check` | 盘点任务 | <1万 | — |
| `stock_check_item` | 盘点明细 | <10万 | — |

### 5.3 核心表字段定义

> **注：完整DDL见 `DB_Production_Design.sql`。Prisma Schema见 `prisma/schema.prisma`。以下仅列出关键字段和设计决策。**

#### shop

```
id, shop_no(UK), name, address, contact_phone, status, created_at, updated_at, deleted_at
```

#### sys_user

```
id, shop_id(FK→shop), phone(UK), name, password_hash, status, created_at, updated_at, deleted_at
```

#### sys_role

```
id, code(UK), name, description, created_at, updated_at
```

#### sys_user_role

```
id, user_id(FK→sys_user), role_id(FK→sys_role), created_at, updated_at
UK(user_id, role_id)
```

#### product

```
id, brand, model, category, status, created_at, updated_at, deleted_at
UK(brand, model)
```

#### product_sku

```
id, product_id(FK→product), color, spec, barcode, retail_price, min_sale_price, status, created_at, updated_at, deleted_at
UK(product_id, color, spec)
```

#### imei_stock

```
id, shop_id(FK→shop), sku_id(FK→product_sku), imei(UK), batch_no, location, cost_price, channel, status(pending_audit/in_stock/sold/returned/frozen), audit_status(pending/approved/rejected), version(乐观锁), created_at, updated_at
```

#### stock_ledger

```
id, shop_id(FK→shop), imei(FK→imei_stock), change_type(inbound/outbound/return/check_adjust), from_status, to_status, operator_id(FK→sys_user), order_no, remark, created_at
INSERT ONLY
```

#### purchase_order

```
id, shop_id(FK→shop), order_no(UK), supplier_name, supplier_contact, total_amount(DECIMAL(10,2)), status(pending/approved/received/cancelled), approved_by(FK→sys_user), approved_at, received_at, remark, created_at, updated_at, deleted_at
软删除
```

#### purchase_item

```
id, purchase_order_id(FK→purchase_order), sku_id(FK→product_sku), imei, quantity(INT), unit_cost(DECIMAL(10,2)), subtotal(DECIMAL(10,2)), created_at
```

#### member

```
id, phone(UK), name, address, license_plate, backup_phone, last_purchase_model, total_points, total_points_version(乐观锁), status, created_at, updated_at, deleted_at
```

#### member_referral

```
id, referrer_id(FK→member), referee_id(FK→member), reward_granted(TINYINT), reward_granted_at, created_at
UK(referrer_id, referee_id)
```

#### point_ledger

```
id, member_id(FK→member), change_type(earn/redeem/expire/referral/manual_adjust), amount, balance_after, order_no, order_time, product_model, unit_price, quantity, expires_at, expired_amount, remaining_amount, remark, created_at
INSERT ONLY, 分区表
```

#### sale_order

```
id, shop_id(FK→shop), order_no(UK), member_id(FK→member), salesperson_id(FK→sys_user), total_amount, total_cost_snapshot, total_subsidy, total_commission, gross_profit, actual_paid, points_used_total, payment_method, return_status(normal/return_requested/returning/returned), created_at, deleted_at
财务字段(带_snapshot后缀) INSERT ONLY, 软删除
```

#### sale_item

```
id, order_id(FK→sale_order), imei(FK→imei_stock), sku_id(FK→product_sku), sale_price, cost_price_snapshot, subsidy_income, commission, gross_profit, created_at
INSERT ONLY
```

#### payment_flow

```
id, shop_id(FK→shop), payment_no(UK), order_no(FK→sale_order), method, amount, refund_amount(DECIMAL(10,2) DEFAULT 0.00), payment_type(normal/refund), external_transaction_id, reconcile_status(pending/matched/mismatched), reconciled_at, status, created_at
```
- `method` 增加 `refund` 枚举值，用于退款流水
- `refund_amount` 记录退款金额，与 `amount` 区分
- `payment_type` 区分正常收款/退款

#### return_order

```
id, shop_id(FK→shop), return_no(UK), original_order_no(FK→sale_order), imei(FK→imei_stock), return_reason, return_type(full_return/exchange/refund_only), refund_amount, points_recalled, commission_recalled, subsidy_recalled, audit_status(pending/approved/rejected), audited_by(FK→sys_user), audited_at, completed_at, created_at, updated_at, deleted_at
软删除(退货单撤销)
```

#### trade_in_order

```
id, shop_id(FK→shop), order_no(FK→sale_order), old_imei, old_brand, old_model, old_condition, appraised_value, actual_deduction, remark, created_at, updated_at
```

#### commission_rule

```
id, brand, model, min_price, max_price, commission_type(fixed/percentage/tiered), commission_value, priority, status, created_at, updated_at
```

#### commission_ledger

```
id, shop_id(FK→shop), salesperson_id(FK→sys_user), settlement_period, order_no(FK→sale_order), estimated_commission, adjustment, actual_commission, status(pending/confirmed/paid), confirmed_by, confirmed_at, created_at, updated_at
UK(salesperson_id, settlement_period, order_no)
```

#### national_subsidy

```
id, shop_id(FK→shop), subsidy_no(UK), order_no(FK→sale_order, UK), imei(FK→imei_stock), applied_amount, approved_amount, status(pending_submit/submitted/under_review/approved/rejected/disbursed/recalled), submitted_at, reviewed_at, disbursed_at, recalled_at, external_ref_no, remark, created_at, updated_at
```

#### audit_log

```
id, imei(FK→imei_stock), action, operator_id(FK→sys_user), remark, created_at
```

#### system_log

```
id, shop_id(FK→shop), operator_id(FK→sys_user), module, action, target_type, target_id, detail_json(JSON), ip_address, created_at
分区表
```

#### ai_chat_log

```
id, user_id, user_role, query, intent, function_called, confidence, reply, is_transferred, ticket_id, latency_ms, created_at
分区表
```

#### notification_outbox

```
id, aggregate_type, aggregate_id, event_type, payload_json(JSON), status(pending/processing/published/failed), retry_count, max_retries, next_retry_at, error_msg, created_at, updated_at
```

#### sms_log

```
id, member_id(FK→member), phone, content, scene, status(0=待发送/1=已发送/2=失败), retry_count, sent_at, created_at
```

#### daily_reconcile

```
id, shop_id(FK→shop), reconcile_date, check_type(stock_vs_order/points_vs_ledger/payment_vs_order/subsidy_vs_sales), expected_count, actual_count, diff_count, diff_detail(JSON), status(pass/fail), resolved_by, resolved_at, created_at
UK(shop_id, reconcile_date, check_type)
```

#### points_expire_log

```
id, member_id(FK→member), total_expired, affected_rows, executed_at, status(success/partial/failed), error_msg, created_at
```

#### alert_rule

```
id, shop_id(FK→shop), sku_id(FK→product_sku), alert_type(low_stock/slow_moving/price_anomaly/negative_profit), threshold_json(JSON), notify_channels(JSON), enabled, cooldown_minutes, created_at, updated_at
```

#### alert_log

```
id, shop_id(FK→shop), rule_id(FK→alert_rule), alert_type, level(urgent/warning/info), message, sku_id, current_stock, is_resolved, resolved_at, created_at
```

#### stock_check

```
id, shop_id(FK→shop), check_no(UK), type(full/partial/category), operator_id(FK→sys_user), status(in_progress/committed/confirmed/cancelled), expected_count, actual_count, surplus_count, deficit_count, confirmed_by(FK→sys_user), confirmed_at, created_at, updated_at
```

#### stock_check_item

```
id, check_id(FK→stock_check, CASCADE), imei, system_status, actual_status(found/missing/extra/wrong_location/damaged), system_location, actual_location, remark, created_at
```

### 5.4 设计决策

#### 乐观锁（2处）

| 表 | 字段 | 冲突处理 |
|----|------|----------|
| `imei_stock` | `version INT UNSIGNED DEFAULT 0` | `WHERE imei=? AND status='in_stock' AND version=?` → affected_rows=0则回滚 |
| `member` | `total_points_version INT UNSIGNED DEFAULT 0` | 积分操作前 `SELECT ... FOR UPDATE` + version校验 |

#### 软删除（7张表）

`shop`, `sys_user`, `product`, `product_sku`, `member`, `sale_order`, `return_order`

实现：`deleted_at DATETIME DEFAULT NULL`，查询时加 `WHERE deleted_at IS NULL`。

#### INSERT ONLY（4张表）

`sale_order`(财务字段), `sale_item`, `point_ledger`, `stock_ledger`

数据库层：`REVOKE UPDATE, DELETE` 或应用层禁止暴露UPDATE/DELETE方法。

#### 分区表（5张表）

`sale_order`, `sale_item`, `point_ledger`, `system_log`, `ai_chat_log`

按 `created_at` RANGE分区（每半年一个分区）。

### 5.5 事务设计

| 事务 | 涉及表 | 隔离级别 | 说明 |
|------|--------|----------|------|
| 扫码出库 | imei_stock(UPDATE), sale_order(INSERT), sale_item(INSERT), point_ledger(INSERT), member(UPDATE), notification_outbox(INSERT) | REPEATABLE READ | 单数据库事务，任一失败全部回滚 |
| 退货回库 | return_order(INSERT), imei_stock(UPDATE), sale_order(UPDATE return_status), point_ledger(INSERT冲正), payment_flow(INSERT退款), notification_outbox(INSERT) | REPEATABLE READ | 同上 |
| 入库审核 | imei_stock(UPDATE status+audit_status), audit_log(INSERT) | READ COMMITTED | 乐观锁防重复审核 |
| 积分过期 | point_ledger(UPDATE expired_amount+remaining_amount), member(UPDATE total_points), points_expire_log(INSERT), notification_outbox(INSERT) | REPEATABLE READ | 按member分批，每批内加行锁 |
| 积分对账 | daily_reconcile(INSERT) | READ COMMITTED | 只读比对 + 写入结果 |

### 5.6 关键索引策略

- 所有 `WHERE` 条件中的单列建索引
- 高频组合查询建复合索引：`(shop_id, created_at)`, `(salesperson_id, created_at)`, `(member_id, change_type, created_at)`
- 唯一约束字段自动成为索引
- 外键字段建索引
- 分区表不再单独为 `created_at` 建索引

---

## 6. API模块

### 6.1 模块清单

| 模块 | 路径前缀 | 职责 |
|------|----------|------|
| Auth | `/api/auth` | 登录/登出/Token刷新 |
| Member | `/api/members` | 会员注册/查询/编辑/推荐 |
| Point | `/api/points` | 积分查询/流水 |
| Inventory | `/api/inventory` | SKU管理/库存查询/导出/盘点 |
| Purchase | `/api/purchase` | 采购订单/入库申请/入库审核 |
| Sale | `/api/sale` | 扫码出库/销售订单/收款 |
| Finance | `/api/finance` | 毛利/流水/对账 |
| Commission | `/api/commission` | 提成规则/业绩/结算 |
| Subsidy | `/api/subsidy` | 国补申请/审批/拨付 |
| TradeIn | `/api/trade-in` | 以旧换新 |
| Return | `/api/return` | 退货申请/审核 |
| Alert | `/api/alert` | 预警规则/日志 |
| Agent | `/api/ai` | AI对话/Function Calling |
| System | `/api/system` | 健康检查/监控指标/配置 |

### 6.2 核心API端点

#### Auth

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 手机号+验证码登录 | 公开 |
| POST | `/api/auth/refresh` | 刷新Token | 需登录 |
| POST | `/api/auth/logout` | 登出(Token加入黑名单) | 需登录 |
| GET | `/api/auth/me` | 当前用户信息 | 需登录 |

#### Inventory

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/inventory/products` | SKU列表(筛选+分页) | 商家 |
| POST | `/api/inventory/products` | 新建SKU | owner |
| PUT | `/api/inventory/products/:id` | 编辑SKU | owner |
| GET | `/api/inventory/stock` | 库存列表(多维筛选) | 商家 |
| GET | `/api/inventory/stock/:imei` | 串码生命周期追溯 | 商家 |
| GET | `/api/inventory/stock/export` | 导出库存Excel | owner/warehouse_supervisor |

#### Purchase

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/purchase/inbound/scan` | 扫码入库申请 | warehouse/owner |
| GET | `/api/purchase/inbound/audit-list` | 待审核列表 | owner/warehouse_supervisor |
| POST | `/api/purchase/inbound/audit/:id` | 审核(通过/驳回) | owner/warehouse_supervisor |

#### Sale

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/sale/outbound/scan` | 扫码出库(核心事务) | salesperson/owner |
| GET | `/api/sale/orders` | 订单列表(筛选+分页) | 商家 |
| GET | `/api/sale/orders/:orderNo` | 订单详情 | 商家 |
| POST | `/api/sale/payment` | 记录收款 | salesperson/owner |

#### Finance

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/finance/gross-profit` | 毛利汇总(今日/本周/本月) | owner |
| GET | `/api/finance/payment-flow` | 收款流水列表 | owner |
| GET | `/api/finance/daily-reconcile` | 日终对账结果 | owner |

#### AI Agent（全部GET，只读）

| 方法 | 路径 | 说明 | 调用方 |
|------|------|------|--------|
| GET | `/api/ai/chat` | AI对话(透传Dify) | 小程序 |
| GET | `/api/ai/inventory/query` | 查库存 | AI Function |
| GET | `/api/ai/finance/gross-profit` | 查毛利 | AI Function |
| GET | `/api/ai/member/points` | 查会员积分 | AI Function |
| GET | `/api/ai/member/orders` | 查会员订单 | AI Function |
| GET | `/api/ai/finance/performance` | 查销售员业绩 | AI Function |
| POST | `/api/ai/transfer-human` | 转人工客服 | AI判定低置信度 |

### 6.3 模块依赖

```
Auth ← 全部依赖
Member ← Sale(出库写入会员), Point(积分关联会员)
Inventory ← Purchase(入库), Sale(出库)
Purchase → Inventory(查SKU, 写imei_stock+stock_ledger)
Sale → Inventory(乐观锁出库), Member(积分), Point(积分写入), Commission(提成计算), Subsidy(国补)
Finance → Sale(只读), Payment(只读)
Agent → 全部只读
```

---

## 7. AI规则（冻结）

### 7.1 架构

```
小程序 → NestJS API Gateway → Dify工作流 → Claude API
                                  ↓
                         Function Calling
                                  ↓
                         NestJS 只读API (GET only)
```

### 7.2 允许的操作

| Function | API | 返回数据 |
|----------|-----|----------|
| `query_inventory` | `GET /api/ai/inventory/query?keyword=` | 型号/颜色/规格/库存数/货位 |
| `query_gross_profit` | `GET /api/ai/finance/gross-profit?period=` | 销售额/成本/国补/提成/毛利/订单数 |
| `query_member_points` | `GET /api/ai/member/points?phone=` | 积分余额/最近获取/消耗记录 |
| `query_member_orders` | `GET /api/ai/member/orders?phone=` | 订单列表(IMEI脱敏) |
| `query_salesperson_performance` | `GET /api/ai/finance/performance?name=&period=` | 订单数/销售额/提成 |

### 7.3 禁止的操作

修改库存、修改价格、修改积分、修改订单、执行退款、执行审批、任何POST/PUT/DELETE。

### 7.4 安全机制

1. **JWT层**: 签发时 `access_level: "ai_readonly"`
2. **Guard层**: `ReadonlyGuard` 强制校验 HTTP method = GET
3. **数据脱敏层**: 手机号中间4位隐藏、IMEI中间4位隐藏、成本不返回
4. **日志层**: 所有AI查询记录 `ai_chat_log`，含用户/意图/置信度/延迟
5. **转人工**: 置信度 < 85% 自动创建工单

### 7.5 RAG配置

| 参数 | 值 |
|------|-----|
| 分块大小 | 500 tokens |
| 重叠 | 50 tokens |
| 向量模型 | text-embedding-3-small |
| Top-K | 5 |
| 相似度阈值 | 0.7 |
| Rerank模型 | bge-reranker-v2-m3 |

### 7.6 超时与降级

- Dify API超时: 5秒
- 超时返回: "系统繁忙，请稍后重试或转人工"
- 连续3次超时: 自动熔断60秒

---

## 8. 部署规则

### 8.1 服务拓扑

```
Nginx :443 (SSL终结 + 限流)
   ↓
NestJS API × 2 (Docker容器, :3000)
   ↓
MySQL 8.0 (Master, :3306) + Redis 7.2 (:6379)
   ↓
监控: Prometheus(:9091) + Grafana(:3001) + Loki(:3100)
```

### 8.2 环境变量（生产环境必需）

```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
REDIS_HOST, REDIS_PORT, REDIS_PASS
JWT_SECRET, AI_READONLY_SECRET
DIFY_API_URL, DIFY_API_KEY
SMS_SECRET_ID, SMS_SECRET_KEY (腾讯云)
COS_SECRET_ID, COS_SECRET_KEY (腾讯云)
```

### 8.3 备份策略

| 类型 | 频率 | 保留 |
|------|------|------|
| 全量 mysqldump | 每日 02:00 | 30天 |
| Binlog增量 | 实时 | 7天 |
| COS异地备份 | 每周 | 90天 |

### 8.4 健康检查

```
GET /api/system/health
→ { "status": "ok", "uptime": 3600, "db": "connected", "redis": "connected" }
```

### 8.5 日志

- NestJS: Pino JSON格式输出到stdout
- Docker: json-file driver采集，max-size=50m, max-file=5
- 日志聚合: Promtail → Loki → Grafana
- 关键字段: traceId, module, action, duration_ms, userId, orderNo

---

## 9. 安全规则

### 9.1 API安全

| 规则 | 实现 |
|------|------|
| 全站HTTPS | Nginx SSL终结，TLS 1.2+ |
| JWT鉴权 | 所有 `/api/*` 除 `/api/auth/login` 外均需Bearer Token |
| API限流 | Nginx `limit_req` 30r/s + NestJS ThrottlerGuard |
| CORS | 仅允许小程序域名 |
| 请求大小限制 | 10MB (主要为Excel导入预留) |
| SQL注入防护 | Prisma参数化查询，禁止拼接SQL |
| XSS防护 | 所有用户输入HTML实体编码 |

### 9.2 数据安全

| 规则 | 实现 |
|------|------|
| 密码存储 | bcrypt，cost=12 |
| 敏感字段加密 | AES-256-GCM 加密手机号/IMEI存储（可选） |
| 数据库连接 | TLS加密，仅允许应用服务器IP |
| 备份加密 | 备份文件AES加密后上传COS |
| 脱敏输出 | AI响应自动脱敏手机号/IMEI/成本 |

### 9.3 数据库权限

```sql
-- 应用账号
app_rw: SELECT, INSERT (全表) + 部分表UPDATE(仅状态字段)
app_ro: SELECT (全表) — AI专用

-- 禁止
app_rw 无 DELETE 权限（任何表）
app_rw 无 sale_order/sale_item/point_ledger/stock_ledger 的 UPDATE 权限
app_ro 无 INSERT/UPDATE/DELETE 权限
```

---

## 10. 审计规则

### 10.1 审计范围

| 操作类型 | 审计表 | 记录内容 |
|----------|--------|----------|
| 入库申请 | audit_log | 操作人/IMEI/时间 |
| 入库审核 | audit_log | 审批人/结果/驳回原因/时间 |
| 扫码出库 | system_log | 销售员/IMEI/售价/成本/时间 |
| 退货审批 | system_log | 审批人/原订单号/IMEI/退货原因 |
| 售价异常 | system_log | 操作人/订单号/售价/成本/偏差% |
| 积分调整(manual_adjust) | system_log | 操作人/会员/金额/原因 |
| 系统配置修改 | system_log | 操作人/配置项/变更前后值 |
| AI查询 | ai_chat_log | 用户/意图/置信度/延迟 |
| AI越权尝试 | system_log | 尝试的方法/路径/时间 |

### 10.2 审计原则

- 审计日志 INSERT ONLY，不可删除
- `system_log.detail_json` 记录变更前后值
- 审计日志保留至少1年
- 超过1年的审计日志归档到COS

---

## 11. 扩展规则

### 11.1 多门店扩展

**已预留设计**：所有业务表含 `shop_id`，MVP阶段默认值为1（单店ID）。

扩展到连锁时：
1. 新建 `shop` 记录
2. 员工分配 `shop_id`
3. 商品SKU连锁共用（`product_sku` 无 shop_id）
4. 库存在门店间隔离（`imei_stock.shop_id`）
5. 会员连锁通用（`member` 无 shop_id）

### 11.2 性能扩展

| 阶段 | 订单量 | 措施 |
|------|--------|------|
| MVP | < 10万 | 单实例MySQL，无分区 |
| 增长期 | 10万-100万 | 分区表启用，读写分离(主从) |
| 成熟期 | > 100万 | 分库分表(按shop_id)，冷热数据分离 |

### 11.3 功能扩展接口预留

- **多级推荐**: `member_referral` 表可扩展为闭包表
- **AI写操作**: 预留 `AgentCommand` 接口，需用户二次确认
- **多语言**: 所有面向用户的消息文本使用i18n键值
- **开放API**: 预留 `/api/open/` 路径前缀，使用独立的API Key鉴权

---

## 12. 风险清单

### 12.1 已知风险

| # | 风险 | 等级 | 缓解措施 | 状态 |
|----|------|:--:|----------|:--:|
| R1 | 积分并发更新导致total_points错乱 | P0 | SELECT FOR UPDATE + version乐观锁 + 每日对账 | 已设计 |
| R2 | 乐观锁出库失败后订单表未回滚 | P0 | 单数据库事务(REPEATABLE READ)保证原子性 | 已设计 |
| R3 | 微信审核拒绝推荐有礼功能 | P0 | 推荐码模式(非分享直接奖励)，审核说明文档 | 待运营配合 |
| R4 | iOS端积分抵现被封禁 | P0 | C端不开放积分抵现，仅B端收银台使用 | 已设计 |
| R5 | 退货财务核算缺失 | P0 | return_order + 冲正积分 + 追回提成 | 已设计 |
| R6 | JWT无法即时失效 | P1 | Redis Token黑名单 | 已设计 |
| R7 | AI查询隐私泄露 | P1 | 数据脱敏 + 商家端AI验证查询权限 | 已设计 |
| R8 | 单店→连锁改表成本高 | P1 | 所有表已预留shop_id | 已设计 |
| R9 | 短信通知丢失 | P1 | Transactional Outbox模式 + 重试机制 | 已设计 |
| R10 | 数据库无归档策略 | P2 | 分区表 + 定期归档脚本 | 已设计 |

### 12.2 上线前必须验证

- [ ] 同IMEI 100并发出库，仅1笔成功，0穿透
- [ ] 每日自动对账 KPI-01~06 全部通过
- [ ] 毛利计算 FIN-001~008 偏差=0
- [ ] AI只读拦截 AI-008~009 通过
- [ ] 8小时浸泡测试无内存泄漏
- [ ] P95延迟 ≤ 200ms

---

## 附录

### A. 文件索引

| 文件 | 用途 | 优先级 |
|------|------|:--:|
| `PROJECT_CONTEXT.md` | **本文档 — 唯一标准** | ★★★ |
| `prisma/schema.prisma` | Prisma数据库Schema(由本文档第5节生成) | ★★★ |
| `DB_Production_Design.sql` | MySQL完整DDL(参考，Prisma为权威) | ★★☆ |
| `PRD_3C零售小程序智能体.md` | 产品需求(参考) | ★★☆ |
| `NestJS_Architecture.md` | NestJS架构(参考，本文档第6节为权威) | ★★☆ |
| `AI_Agent_Design.md` | AI设计(参考，本文档第7节为权威) | ★★☆ |
| `Deployment_Plan.md` | 部署方案(参考，本文档第8节为权威) | ★★☆ |
| `Test_Plan.md` | 测试方案(参考) | ★★☆ |
| `MVP_Iteration_Plan.md` | MVP迭代计划(参考) | ★☆☆ |

### B. 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-14 | V1.0-FROZEN | 初始冻结版本，合并PRD/DB/架构/AI/部署/测试全部设计 |

### C. 使用约定

1. 任何开发活动开始前，先阅读本文档
2. 发现本文档与实际代码不一致时，以本文档为准，修正代码
3. 如需修改设计，先更新本文档，再修改代码
4. 禁止创建替代性的架构/设计文档
5. 本文档使用Markdown，编码UTF-8
