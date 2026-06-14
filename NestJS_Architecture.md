# NestJS 项目架构设计

## 小程序 + 智能体（3C 数码零售）系统

---

## 一、DDD 分层总览

```
src/
├── domain/                    # 领域层 — 纯业务逻辑，不依赖任何框架
│   ├── shared/                # 共享基类与值对象
│   └── {module}/              # 每个模块的领域代码
│       ├── entities/          # 领域实体（充血模型）
│       ├── value-objects/     # 值对象
│       ├── repositories/      # 仓储接口（端口）
│       ├── services/          # 领域服务（跨实体的业务规则）
│       └── events/            # 领域事件
│
├── application/               # 应用层 — 用例编排，DTO，命令/查询
│   └── {module}/
│       ├── commands/          # 写操作命令 + Handler
│       ├── queries/           # 读操作查询 + Handler
│       ├── dto/               # 入参 DTO + 出参 VO
│       └── services/          # 应用服务（协调领域对象完成用例）
│
├── infrastructure/            # 基础设施层 — 技术实现
│   ├── database/              # TypeORM 配置、Migration、Entity Schema
│   ├── cache/                 # Redis 缓存
│   ├── queue/                 # BullMQ 消息队列
│   ├── sms/                   # 短信网关适配器
│   ├── ai/                    # Dify API 适配器
│   └── {module}/
│       └── repositories/      # 仓储实现（TypeORM）
│
└── interfaces/                # 接口层 — HTTP 控制器、中间件、守卫
    ├── common/                # 全局 Guard、Interceptor、Filter、Pipe
    └── {module}/
        ├── controllers/       # REST Controller
        └── middleware/        # 模块级中间件
```

---

## 二、完整目录结构

```
3c-retail-api/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env
├── .env.example
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── domain/
│   │   ├── shared/
│   │   │   ├── base.entity.ts                  # 抽象实体基类（含 id/createdAt/updatedAt）
│   │   │   ├── aggregate-root.ts               # 聚合根基类
│   │   │   ├── domain-event.ts                 # 领域事件基类
│   │   │   ├── value-objects/
│   │   │   │   ├── phone.ts                    # 手机号值对象（校验格式）
│   │   │   │   ├── imei.ts                     # IMEI 值对象（校验 15-20 位）
│   │   │   │   ├── money.ts                    # 金额值对象（精度/舍入规则）
│   │   │   │   ├── order-no.ts                 # 订单号值对象（雪花算法）
│   │   │   │   ├── payment-method.ts           # 收款方式枚举
│   │   │   │   └── stock-status.ts             # 库存状态枚举
│   │   │   └── exceptions/
│   │   │       ├── conflict.exception.ts       # 并发冲突异常
│   │   │       ├── insufficient-stock.exception.ts
│   │   │       ├── insufficient-points.exception.ts
│   │   │       └── audit-rejected.exception.ts
│   │   │
│   │   ├── auth/
│   │   │   └── entities/
│   │   │       └── sys-user.entity.ts           # 系统用户实体（充血模型）
│   │   │
│   │   ├── member/
│   │   │   ├── entities/
│   │   │   │   └── member.entity.ts             # 会员实体（充血模型）
│   │   │   ├── value-objects/
│   │   │   │   └── license-plate.ts             # 车号值对象
│   │   │   ├── repositories/
│   │   │   │   └── member.repository.ts         # 会员仓储接口
│   │   │   └── events/
│   │   │       └── member-registered.event.ts   # 会员注册事件
│   │   │
│   │   ├── point/
│   │   │   ├── entities/
│   │   │   │   └── point-ledger.entity.ts       # 积分流水实体（INSERT ONLY）
│   │   │   ├── value-objects/
│   │   │   │   └── point-change-type.ts         # 积分变动类型枚举
│   │   │   ├── repositories/
│   │   │   │   └── point-ledger.repository.ts   # 积分流水仓储接口
│   │   │   └── services/
│   │   │       └── point-domain.service.ts      # 积分领域服务（规则计算）
│   │   │
│   │   ├── inventory/
│   │   │   ├── entities/
│   │   │   │   ├── product-sku.entity.ts        # 商品 SKU 实体
│   │   │   │   └── stock-ledger.entity.ts       # 库存台账实体（含 version 乐观锁）
│   │   │   ├── value-objects/
│   │   │   │   └── sku-spec.ts                  # SKU 规格值对象
│   │   │   ├── repositories/
│   │   │   │   ├── product-sku.repository.ts    # SKU 仓储接口
│   │   │   │   └── stock-ledger.repository.ts   # 库存台账仓储接口
│   │   │   └── events/
│   │   │       ├── stock-inbounded.event.ts     # 入库完成事件
│   │   │       └── stock-sold.event.ts          # 库存已售事件
│   │   │
│   │   ├── purchase/
│   │   │   ├── entities/
│   │   │   │   └── audit-log.entity.ts          # 审核日志实体
│   │   │   ├── repositories/
│   │   │   │   └── audit-log.repository.ts      # 审核日志仓储接口
│   │   │   └── services/
│   │   │       └── inbound-domain.service.ts    # 入库领域服务（审核规则）
│   │   │
│   │   ├── sale/
│   │   │   ├── entities/
│   │   │   │   ├── sales-order.entity.ts        # 销售单实体（成本/毛利固化）
│   │   │   │   └── payment-flow.entity.ts       # 收款流水实体
│   │   │   ├── repositories/
│   │   │   │   ├── sales-order.repository.ts    # 销售单仓储接口
│   │   │   │   └── payment-flow.repository.ts   # 收款流水仓储接口
│   │   │   ├── services/
│   │   │   │   └── profit-domain.service.ts     # 毛利计算领域服务
│   │   │   └── events/
│   │   │       └── order-created.event.ts       # 订单创建事件
│   │   │
│   │   ├── commission/
│   │   │   ├── entities/
│   │   │   │   └── commission.entity.ts         # 提成实体（源于 sales_order.commission）
│   │   │   ├── repositories/
│   │   │   │   └── commission.repository.ts     # 提成查询仓储接口
│   │   │   └── services/
│   │   │       └── commission-domain.service.ts # 提成规则领域服务
│   │   │
│   │   └── agent/
│   │       ├── repositories/
│   │       │   └── agent-query.repository.ts    # AI 只读查询聚合仓储接口
│   │       └── value-objects/
│   │           └── confidence-score.ts          # 置信度值对象
│   │
│   ├── application/
│   │   ├── auth/
│   │   │   ├── commands/
│   │   │   │   └── login.command.ts             # 登录命令 + Handler
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   └── login-result.vo.ts
│   │   │   └── services/
│   │   │       └── auth-app.service.ts          # 认证应用服务
│   │   │
│   │   ├── member/
│   │   │   ├── commands/
│   │   │   │   ├── register-member.command.ts   # 注册会员命令
│   │   │   │   └── update-member.command.ts     # 更新会员命令
│   │   │   ├── queries/
│   │   │   │   ├── get-member.query.ts          # 会员详情查询
│   │   │   │   └── list-members.query.ts        # 会员列表查询
│   │   │   ├── dto/
│   │   │   │   ├── register-member.dto.ts
│   │   │   │   ├── update-member.dto.ts
│   │   │   │   ├── member-detail.vo.ts
│   │   │   │   └── member-list.vo.ts
│   │   │   └── services/
│   │   │       └── member-app.service.ts        # 会员应用服务
│   │   │
│   │   ├── point/
│   │   │   ├── commands/
│   │   │   │   ├── earn-points.command.ts       # 获取积分命令
│   │   │   │   ├── redeem-points.command.ts     # 积分抵现命令
│   │   │   │   ├── expire-points.command.ts     # 积分过期命令（定时任务）
│   │   │   │   └── referral-reward.command.ts   # 推荐奖励命令
│   │   │   ├── queries/
│   │   │   │   ├── get-points-balance.query.ts  # 积分余额查询
│   │   │   │   └── list-points-ledger.query.ts  # 积分流水分页查询
│   │   │   ├── dto/
│   │   │   │   ├── points-balance.vo.ts
│   │   │   │   ├── points-ledger.vo.ts
│   │   │   │   └── redeem-request.dto.ts
│   │   │   └── services/
│   │   │       └── point-app.service.ts         # 积分应用服务
│   │   │
│   │   ├── inventory/
│   │   │   ├── commands/
│   │   │   │   └── upsert-product-sku.command.ts # 新建/编辑 SKU 命令
│   │   │   ├── queries/
│   │   │   │   ├── list-products.query.ts       # SKU 列表查询
│   │   │   │   ├── get-product.query.ts         # SKU 详情查询
│   │   │   │   ├── list-stock.query.ts          # 库存列表查询（多维筛选）
│   │   │   │   ├── get-stock-by-imei.query.ts   # 按 IMEI 查库存详情
│   │   │   │   └── export-stock.query.ts        # 库存 Excel 导出
│   │   │   ├── dto/
│   │   │   │   ├── product-sku.dto.ts
│   │   │   │   ├── product-sku.vo.ts
│   │   │   │   ├── stock-list-filter.dto.ts
│   │   │   │   ├── stock-detail.vo.ts
│   │   │   │   └── stock-export.dto.ts
│   │   │   └── services/
│   │   │       ├── product-app.service.ts       # SKU 应用服务
│   │   │       └── stock-query-app.service.ts   # 库存查询应用服务
│   │   │
│   │   ├── purchase/
│   │   │   ├── commands/
│   │   │   │   ├── inbound-scan.command.ts      # 扫码入库命令
│   │   │   │   └── inbound-audit.command.ts     # 入库审核命令
│   │   │   ├── queries/
│   │   │   │   └── list-audit-pending.query.ts  # 待审核列表查询
│   │   │   ├── dto/
│   │   │   │   ├── inbound-scan.dto.ts
│   │   │   │   └── inbound-audit.dto.ts
│   │   │   └── services/
│   │   │       └── inbound-app.service.ts       # 入库应用服务
│   │   │
│   │   ├── sale/
│   │   │   ├── commands/
│   │   │   │   ├── outbound-scan.command.ts     # 扫码出库命令（核心事务）
│   │   │   │   └── record-payment.command.ts    # 记录收款命令
│   │   │   ├── queries/
│   │   │   │   ├── list-orders.query.ts         # 销售订单列表查询
│   │   │   │   ├── get-order.query.ts           # 订单详情查询
│   │   │   │   ├── get-gross-profit.query.ts    # 毛利汇总查询
│   │   │   │   └── list-payment-flow.query.ts   # 收款流水查询
│   │   │   ├── dto/
│   │   │   │   ├── outbound-scan.dto.ts
│   │   │   │   ├── order-list-filter.dto.ts
│   │   │   │   ├── order-detail.vo.ts
│   │   │   │   ├── gross-profit.vo.ts
│   │   │   │   └── payment-flow.vo.ts
│   │   │   └── services/
│   │   │       └── sale-app.service.ts          # 销售应用服务（编排出库+订单+积分+通知）
│   │   │
│   │   ├── commission/
│   │   │   ├── queries/
│   │   │   │   ├── get-salesperson-performance.query.ts  # 销售员业绩查询
│   │   │   │   └── get-subsidy-summary.query.ts           # 国补收入汇总查询
│   │   │   ├── dto/
│   │   │   │   ├── performance.vo.ts
│   │   │   │   └── subsidy-summary.vo.ts
│   │   │   └── services/
│   │   │       └── performance-app.service.ts   # 业绩应用服务
│   │   │
│   │   └── agent/
│   │       ├── queries/
│   │       │   ├── agent-chat.query.ts          # AI 对话透传查询
│   │       │   ├── query-inventory.query.ts     # AI 查库存
│   │       │   ├── query-profit.query.ts        # AI 查毛利
│   │       │   ├── query-member-points.query.ts # AI 查会员积分
│   │       │   └── query-member-orders.query.ts # AI 查会员订单
│   │       ├── dto/
│   │       │   ├── agent-chat.dto.ts
│   │       │   └── agent-response.vo.ts
│   │       └── services/
│   │           └── agent-app.service.ts         # AI 智能体应用服务（鉴权+路由+转人工）
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── typeorm.config.ts                # TypeORM 连接配置
│   │   │   ├── migrations/                      # 数据库迁移文件
│   │   │   ├── subscribers/                     # TypeORM 事件订阅者
│   │   │   └── typeorm-entities.ts              # 实体注册汇总
│   │   │
│   │   ├── cache/
│   │   │   ├── redis.config.ts                  # Redis 配置
│   │   │   └── cache.service.ts                 # 缓存服务封装
│   │   │
│   │   ├── queue/
│   │   │   ├── bullmq.config.ts                 # BullMQ 配置
│   │   │   ├── sms.producer.ts                  # 短信队列生产者
│   │   │   ├── sms.consumer.ts                  # 短信队列消费者
│   │   │   └── reconcile.producer.ts            # 对账任务生产者
│   │   │
│   │   ├── sms/
│   │   │   ├── sms-gateway.interface.ts         # 短信网关端口
│   │   │   └── aliyun-sms.adapter.ts            # 阿里云短信适配器
│   │   │
│   │   ├── ai/
│   │   │   ├── dify-client.ts                   # Dify API 客户端
│   │   │   └── function-calling/
│   │   │       ├── function-registry.ts         # Function 注册表
│   │   │       ├── query-inventory.fn.ts        # 查库存 Function
│   │   │       ├── query-profit.fn.ts           # 查毛利 Function
│   │   │       └── query-member.fn.ts           # 查会员 Function
│   │   │
│   │   ├── auth/
│   │   │   └── repositories/
│   │   │       └── sys-user.repository.impl.ts  # 用户仓储实现
│   │   │
│   │   ├── member/
│   │   │   └── repositories/
│   │   │       └── member.repository.impl.ts    # 会员仓储实现
│   │   │
│   │   ├── point/
│   │   │   ├── repositories/
│   │   │   │   └── point-ledger.repository.impl.ts  # 积分流水仓储实现（仅 expose insert）
│   │   │   └── tasks/
│   │   │       ├── daily-points-reconcile.task.ts   # 每日积分对账定时任务
│   │   │       └── points-expire.task.ts            # 积分过期定时任务
│   │   │
│   │   ├── inventory/
│   │   │   └── repositories/
│   │   │       ├── product-sku.repository.impl.ts
│   │   │       └── stock-ledger.repository.impl.ts
│   │   │
│   │   ├── purchase/
│   │   │   └── repositories/
│   │   │       └── audit-log.repository.impl.ts
│   │   │
│   │   ├── sale/
│   │   │   ├── repositories/
│   │   │   │   ├── sales-order.repository.impl.ts
│   │   │   │   └── payment-flow.repository.impl.ts
│   │   │   └── tasks/
│   │   │       └── daily-stock-reconcile.task.ts    # 每日库存对账定时任务
│   │   │
│   │   ├── commission/
│   │   │   └── repositories/
│   │   │       └── commission.repository.impl.ts
│   │   │
│   │   └── agent/
│   │       └── repositories/
│   │           └── agent-query.repository.impl.ts   # AI 只读查询仓储实现
│   │
│   └── interfaces/
│       ├── common/
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts               # JWT 鉴权守卫
│       │   │   ├── roles.guard.ts                  # 角色权限守卫
│       │   │   └── readonly.guard.ts               # AI 只读守卫（拒绝非 GET）
│       │   ├── interceptors/
│       │   │   ├── response-transform.interceptor.ts # 统一响应格式
│       │   │   └── audit-log.interceptor.ts          # 操作审计拦截器
│       │   ├── filters/
│       │   │   └── http-exception.filter.ts          # 全局异常过滤器
│       │   ├── pipes/
│       │   │   └── validation.pipe.ts                # 全局校验管道
│       │   └── decorators/
│       │       ├── roles.decorator.ts                # 角色装饰器
│       │       ├── current-user.decorator.ts         # 当前用户装饰器
│       │       └── readonly.decorator.ts             # 只读标记装饰器
│       │
│       ├── auth/
│       │   ├── controllers/
│       │   │   └── auth.controller.ts              # POST /api/auth/login
│       │   └── middleware/
│       │       └── jwt.strategy.ts                  # JWT 策略
│       │
│       ├── member/
│       │   └── controllers/
│       │       ├── member.controller.ts             # 商家端会员管理
│       │       └── member-public.controller.ts      # C 端会员注册/编辑
│       │
│       ├── point/
│       │   └── controllers/
│       │       └── point.controller.ts              # 积分查询/流水
│       │
│       ├── inventory/
│       │   └── controllers/
│       │       ├── product.controller.ts            # SKU CRUD
│       │       └── stock.controller.ts              # 库存列表/详情/导出
│       │
│       ├── purchase/
│       │   └── controllers/
│       │       └── inbound.controller.ts            # 扫码入库/审核
│       │
│       ├── sale/
│       │   └── controllers/
│       │       ├── outbound.controller.ts           # 扫码出库（生成销售单）
│       │       ├── order.controller.ts              # 订单列表/详情
│       │       └── finance.controller.ts            # 毛利/收款流水
│       │
│       ├── commission/
│       │   └── controllers/
│       │       └── performance.controller.ts        # 员工业绩/国补汇总
│       │
│       └── agent/
│           └── controllers/
│               └── agent.controller.ts              # AI 对话 + 转人工
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
    └── api/
        └── swagger.json
```

---

## 三、模块说明

### 3.1 Auth — 认证模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 手机号 + 验证码登录、JWT 签发与验证、角色权限绑定 |
| **映射 DB 表** | `sys_user` |
| **核心服务** | `AuthAppService` — 登录逻辑、Token 生成；`JwtStrategy` — 请求鉴权；`RolesGuard` — 接口级角色拦截 |
| **提供接口** | |
| | `POST /api/auth/login` — 手机号 + 验证码登录，返回 JWT |
| | `GET /api/users/me` — 当前登录用户信息 |

### 3.2 Member — 会员模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 会员注册（含推荐人绑定）、会员信息编辑、会员列表/详情查询、推荐关系管理 |
| **映射 DB 表** | `member` |
| **核心服务** | `MemberAppService` — 注册/编辑用例编排；`MemberDomainService` — 推荐关系校验（不可自推、不可改推荐人） |
| **提供接口** | |
| | `POST /api/members/register` — C 端会员注册（可选填推荐人手机号） |
| | `GET /api/members/list` — 会员列表（商家端，按手机号搜索） |
| | `GET /api/members/:id` — 会员详情（含积分余额、推荐关系） |
| | `PUT /api/members/:id` — 编辑个人信息（地址、车号、备用电话） |
| | `GET /api/members/:id/referral-list` — 查看推荐列表 |

### 3.3 Point — 积分模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 积分获取（消费/推荐）、积分消耗（抵现/换购/过期）、积分流水记录、每日积分对账 |
| **映射 DB 表** | `point_ledger`，关联 `member`、`sales_order` |
| **核心服务** | `PointAppService` — 积分增减用例；`PointDomainService` — 1元1分规则、100:1 抵现规则、3000 分换购门槛；`DailyPointsReconcileTask` — 日终 `SUM(point_ledger) vs member.total_points` 对账 |
| **红线** | point_ledger **INSERT ONLY**，修正靠负数冲正 |
| **提供接口** | |
| | `GET /api/members/:id/points` — 积分余额 + 流水明细 |
| | `POST /api/points/redeem` — 积分抵现（内部接口，收银台调用） |
| | `POST /api/points/referral-reward` — 推荐奖励发放（系统内部，首单触发） |

### 3.4 Inventory — 库存模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 商品 SKU 管理、库存列表查询（多维筛选）、库存详情追溯（串码生命周期）、库存 Excel 导出、库存盘点 |
| **映射 DB 表** | `product_sku`、`stock_ledger` |
| **核心服务** | `ProductAppService` — SKU CRUD；`StockQueryAppService` — 多维筛选 + 分页 + 导出；`StockLedgerRepository` — 乐观锁 version 管控 |
| **红线** | 只提供查询，不出库操作（出库归属 Sale 模块） |
| **提供接口** | |
| | `GET /api/products` — SKU 列表（品牌/型号/颜色筛选） |
| | `POST /api/products` — 新建 SKU（老板） |
| | `GET /api/products/:id` — SKU 详情 |
| | `PUT /api/products/:id` — 编辑 SKU（老板） |
| | `GET /api/stock/list` — 库存列表（机型/颜色/状态/货位筛选 + 分页） |
| | `GET /api/stock/detail/:imei` — 单条库存详情（全生命周期追溯） |
| | `GET /api/stock/export` — 导出库存 Excel |
| | `POST /api/stock/check` — 库存盘点提交（仓管） |

### 3.5 Purchase — 入库模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 扫码入库申请、入库审核（通过/驳回）、审核日志记录 |
| **映射 DB 表** | `stock_ledger`（写）、`audit_log`（写） |
| **核心服务** | `InboundAppService` — 扫码→补充属性→提交待审（imei 唯一约束防重）；`InboundDomainService` — 审核规则（状态机：pending_audit → approved → in_stock / rejected） |
| **提供接口** | |
| | `POST /api/stock/inbound/scan` — 扫码入库（仓管提交审核） |
| | `GET /api/stock/inbound/audit-list` — 待审核列表 |
| | `POST /api/stock/inbound/audit/:id` — 审核（通过/驳回） |

### 3.6 Sale — 销售模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 扫码出库（核心事务）、销售单生成（成本毛利固化）、收款流水记录、毛利汇总、订单查询 |
| **映射 DB 表** | `sales_order`（写）、`payment_flow`（写）、`stock_ledger`（更新）、`point_ledger`（写） |
| **核心服务** | `SaleAppService` — 出库核心事务编排（乐观锁出库 → 订单固化 → 积分写入 → 短信异步通知）；`ProfitDomainService` — 移动加权平均成本计算 + 毛利 = 售价+国补-成本-提成 |
| **红线** | cost_price_snapshot / gross_profit **INSERT 后不可 UPDATE**；整个出库流程在 TypeORM QueryRunner 单事务内 |
| **提供接口** | |
| | `POST /api/stock/outbound/scan` — 扫码出库（生成销售单，核心接口） |
| | `GET /api/orders/list` — 销售订单列表（日期/销售员/收款方式筛选） |
| | `GET /api/orders/:orderNo` — 订单详情（含固化毛利，只读） |
| | `GET /api/finance/gross-profit` — 毛利汇总（今日/本周/本月） |
| | `GET /api/finance/payment-flow` — 收款流水列表 |

### 3.7 Commission — 业绩模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 销售员业绩统计、提成明细、国补收入汇总、业绩报表 |
| **映射 DB 表** | `sales_order`（只读）、`sys_user`（只读） |
| **核心服务** | `PerformanceAppService` — 业绩多维度统计；`CommissionDomainService` — 提成计算规则（可在第二期扩展为可配置规则） |
| **提供接口** | |
| | `GET /api/finance/salesperson-performance` — 销售员业绩 + 提成明细 |
| | `GET /api/finance/subsidy-summary` — 国补收入汇总 |

### 3.8 Agent — AI 智能体模块

| 维度 | 说明 |
|------|------|
| **主要职责** | 透传 Dify 对话、提供 Function Calling 的只读 API、置信度 <85% 转人工、网关层拒绝非 GET 请求 |
| **映射 DB 表** | 全部只读（`stock_ledger`、`sales_order`、`member`、`point_ledger`） |
| **核心服务** | `AgentAppService` — 意图路由 + 置信度判读 + 转人工；`ReadonlyGuard` — 拦截 AI token 的非 GET 请求；`FunctionRegistry` — 注册可调用函数列表 |
| **红线** | AI 无写入权限，Gateway 层拦截 POST/PUT/DELETE；AI 仅调用只读 JWT Token |
| **提供接口** | |
| | `GET /api/ai/chat` — AI 对话接口（透传 Dify） |
| | `GET /api/ai/inventory/query?keyword=` — AI 查库存 |
| | `GET /api/ai/finance/gross-profit?period=` — AI 查毛利 |
| | `GET /api/ai/member/points?phone=` — AI 查会员积分 |
| | `GET /api/ai/member/orders?phone=` — AI 查会员订单 |
| | `POST /api/ai/transfer-human` — 转人工客服（生成工单） |

---

## 四、模块间依赖关系

```
                    ┌─────────┐
                    │  Auth   │  ← 所有模块鉴权依赖
                    └────┬────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌──────┐  ┌────────┐  ┌──────────┐  ┌───────────┐
│Member│  │Inventory│  │ Purchase │  │   Sale    │  ← 核心写链路，强事务
└──┬───┘  └────┬───┘  └────┬─────┘  └─────┬─────┘
   │           │            │              │
   ▼           │            │              │
┌──────┐       │            │        ┌─────┴──────┐
│Point │◄──────┘            │        │ Commission │  ← 只读 Sale 数据
└──────┘                    │        └────────────┘
   │                        │
   └────────────────────────┘
                │
                ▼
          ┌──────────┐
          │  Agent   │  ← 全部只读，不写任何表
          └──────────┘
```

**依赖原则：**
- Agent 依赖所有模块的只读查询接口，不产生写入依赖
- Sale 是核心事务模块，写入时依赖 Inventory（查库存）、Member（查会员）、Point（写入积分）
- Commission 仅只读 Sale 的数据，无写入权限
- Purchase 写入时依赖 Inventory（查 SKU、写 stock_ledger）
