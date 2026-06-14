# ARCHITECTURE — 3C数码零售 ERP + CRM + AI 智能体系统

> **版本**: V1.0
> **日期**: 2026-06-14
> **参考**: PROJECT_CONTEXT.md (Single Source of Truth)
>
> 本文档定义生产环境完整目录结构，遵循 DDD 分层架构，支持未来微服务拆分。

---

## 目录

1. [架构原则](#1-架构原则)
2. [顶层结构](#2-顶层结构)
3. [miniapp — 微信小程序原生](#3-miniapp--微信小程序原生)
4. [backend — NestJS + Prisma 后端](#4-backend--nestjs--prisma-后端)
5. [database — 数据库管理](#5-database--数据库管理)
6. [deploy — 部署与运维](#6-deploy--部署与运维)
7. [docs — 项目文档](#7-docs--项目文档)
8. [CI/CD — GitHub Actions](#8-cicd--github-actions)
9. [微服务拆分路线](#9-微服务拆分路线)

---

## 1. 架构原则

| 原则 | 说明 |
|------|------|
| **DDD 分层** | 每个模块四层：domain → application → infrastructure → interfaces |
| **模块自治** | 模块间通过接口(ports)通信，不直接依赖实现 |
| **微服务就绪** | 模块边界清晰，拆分时仅需改变通信方式(进程内→RPC/消息) |
| **共享内核** | 通用值对象、守卫、拦截器等抽取到 `shared/`，避免重复 |
| **基础设施抽象** | Prisma/Redis/COS/SMS 通过接口抽象，方便替换 |
| **配置外置** | 所有环境相关配置通过环境变量注入，代码零硬编码 |
| **安全优先** | JWT鉴权、数据脱敏、只读守卫、API限流统一在 shared 层实现 |

### 1.2 DDD 四层职责

```
interfaces/    ← HTTP Controller, WebSocket Gateway, 请求/响应 DTO
application/   ← Use Case, Application Service, 领域事件处理
domain/        ← Entity, Value Object, Domain Service, Repository Interface
infrastructure/← Repository Impl, 外部API Client, 消息队列适配
```

**依赖方向**: interfaces → application → domain ← infrastructure

---

## 2. 顶层结构

```
project/
├── miniapp/                    # 微信小程序原生 (C端 + B端)
├── backend/                    # NestJS 后端 (单体 → 微服务就绪)
├── database/                   # 数据库脚本、迁移、备份、分区
├── deploy/                     # Docker、Nginx、K8s、运维脚本
├── docs/                       # 项目文档 (SSOT)
├── .github/                    # CI/CD 工作流
├── .gitignore
├── README.md
└── Makefile                    # 常用命令入口
```

---

## 3. miniapp — 微信小程序原生

### 3.1 目录结构

```
miniapp/
├── pages/                      # 页面（每个页面一个目录，含 .wxml/.wxss/.js/.json）
│   ├── auth/                   # 登录与个人中心
│   │   ├── login/              # 手机号验证码登录
│   │   ├── bind-phone/         # 绑定手机号
│   │   └── profile/            # 个人资料
│   │
│   ├── dashboard/              # B端工作台首页
│   │   └── index/              # 今日概览(销售额/库存/待审核/预警)
│   │
│   ├── inventory/              # 库存管理
│   │   ├── list/               # 库存列表(搜索/筛选/排序)
│   │   ├── detail/             # 串码详情 + 生命周期追溯
│   │   ├── imei-trace/         # IMEI 全链路追踪
│   │   ├── check/              # 盘点任务
│   │   │   ├── list/           #   盘点列表
│   │   │   ├── create/         #   创建盘点
│   │   │   ├── scan/           #   扫码盘点
│   │   │   └── result/         #   盘点结果
│   │   ├── product/            # 商品(SPU)管理
│   │   │   ├── list/           #   商品列表
│   │   │   ├── create/         #   新增商品
│   │   │   └── edit/           #   编辑商品
│   │   └── sku/                # SKU管理
│   │       ├── list/           #   SKU列表
│   │       └── edit/           #   SKU编辑
│   │
│   ├── pos/                    # 收银台（核心业务流程）
│   │   ├── scan/               # 扫码出库(主流程)
│   │   ├── cart/               # 购物车(多件商品)
│   │   ├── payment/            # 收款确认
│   │   ├── return/             # 退货申请
│   │   └── trade-in/           # 以旧换新
│   │
│   ├── purchase/               # 采购入库
│   │   ├── inbound/            # 入库申请(扫码入库)
│   │   ├── list/               # 采购订单列表
│   │   ├── detail/             # 采购订单详情
│   │   └── audit/              # 入库审核(仓管主管)
│   │       ├── list/           #   待审核列表
│   │       └── detail/         #   审核详情(通过/驳回)
│   │
│   ├── member/                 # 会员管理 (B端)
│   │   ├── list/               # 会员列表
│   │   ├── detail/             # 会员详情(积分/订单/推荐)
│   │   ├── register/           # 会员注册(线下)
│   │   └── referral/           # 推荐关系
│   │
│   ├── order/                  # 订单管理
│   │   ├── list/               # 订单列表(搜索/筛选)
│   │   ├── detail/             # 订单详情(商品/支付/提成)
│   │   └── return-list/        # 退货单列表
│   │
│   ├── report/                 # 报表中心
│   │   ├── gross-profit/       # 毛利报表
│   │   ├── performance/        # 员工业绩报表
│   │   ├── cash-flow/          # 资金流水
│   │   ├── inventory-turnover/ # 库存周转
│   │   └── daily-summary/      # 日终汇总
│   │
│   ├── commission/             # 提成管理
│   │   ├── rules/              # 提成规则配置
│   │   ├── ledger/             # 提成流水
│   │   └── settlement/         # 月度结算
│   │
│   ├── subsidy/                # 国补管理
│   │   ├── list/               # 国补记录
│   │   ├── apply/              # 申请国补
│   │   └── detail/             # 国补详情(审批/拨付/追回)
│   │
│   ├── ai/                     # AI 智能助手
│   │   └── chat/               # AI对话(文本 + Function Card)
│   │
│   ├── alert/                  # 预警管理
│   │   ├── rules/              # 预警规则配置
│   │   └── logs/               # 预警日志
│   │
│   ├── settings/               # 系统设置
│   │   ├── shop/               # 门店信息
│   │   ├── user/               # 员工管理
│   │   └── role/               # 角色权限
│   │
│   └── c-side/                 # C端会员端
│       ├── index/              # 会员首页(积分/订单入口)
│       ├── points/             # 积分明细
│       │   ├── ledger/         #   积分流水
│       │   └── exchange/       #   积分换购
│       ├── orders/             # 我的订单
│       ├── referral/           # 我的推荐
│       └── profile/            # 个人资料
│
├── components/                 # 公共组件
│   ├── business/               # 业务组件
│   │   ├── product-card/       # 商品卡片 (含价格/库存状态)
│   │   ├── imei-scanner/       # IMEI扫码器 (调用wx.scanCode)
│   │   ├── member-selector/    # 会员选择器 (搜索/列表)
│   │   ├── amount-input/       # 金额输入框 (限制Decimal格式)
│   │   ├── phone-input/        # 手机号输入(验证+脱敏显示)
│   │   ├── order-status-tag/   # 订单状态标签
│   │   ├── stock-status-tag/   # 库存状态标签
│   │   ├── payment-method-picker/ # 支付方式选择器
│   │   └── commission-display/ # 提成展示组件
│   └── ui/                     # UI 基础组件
│       ├── navbar/             # 自定义导航栏
│       ├── tab-bar/            # 自定义TabBar
│       ├── search-bar/         # 搜索栏(防抖)
│       ├── empty-state/        # 空状态占位
│       ├── loading/            # 加载中
│       ├── skeleton/           # 骨架屏
│       ├── pull-refresh/       # 下拉刷新
│       ├── infinite-scroll/    # 无限滚动(分页)
│       ├── modal/              # 模态框
│       ├── toast/              # 轻提示
│       ├── action-sheet/       # 动作面板
│       ├── filter-bar/         # 筛选栏(多条件)
│       └── chart/              # ECharts 图表封装
│
├── api/                        # API 请求层 (一一对应后端模块)
│   ├── request.js              # 统一请求封装
│   │                           # - JWT Token 自动附加 + 过期刷新
│   │                           # - 请求/响应拦截
│   │                           # - 统一错误处理 + Toast提示
│   │                           # - 请求重试 (网络异常)
│   │                           # - 幂等键自动生成
│   ├── auth.js                 # /api/auth/*
│   ├── member.js               # /api/members/*
│   ├── inventory.js            # /api/inventory/*
│   ├── purchase.js             # /api/purchase/*
│   ├── sale.js                 # /api/sale/*
│   ├── finance.js              # /api/finance/*
│   ├── commission.js           # /api/commission/*
│   ├── subsidy.js              # /api/subsidy/*
│   ├── trade-in.js             # /api/trade-in/*
│   ├── point.js                # /api/points/*
│   ├── alert.js                # /api/alert/*
│   ├── ai.js                   # /api/ai/* (含SSE流式)
│   └── system.js               # /api/system/*
│
├── store/                      # 全局状态 (app.globalData 封装)
│   ├── user.js                 # 当前用户信息(role/shop_id/permissions)
│   ├── shop.js                 # 门店信息
│   └── cart.js                 # 收银台购物车
│
├── utils/                      # 工具函数
│   ├── auth.js                 # Token 存储/读取/清除 (wx.Storage)
│   ├── validator.js            # 表单验证 (手机号/IMEI/金额/车牌)
│   ├── format.js               # 格式化 (金额→元/日期/IMEI脱敏/手机脱敏)
│   ├── permission.js           # 前端权限判断 (can('write:sale')等)
│   ├── idempotency.js          # 幂等键生成 (UUID v4)
│   ├── constant.js             # 常量 (订单状态/库存状态/积分类型等枚举)
│   ├── debounce.js             # 防抖/节流
│   └── wx.js                   # wx API Promise化封装
│
├── styles/                     # 全局样式
│   ├── variables.wxss          # CSS 变量 (主题色/字号/间距/圆角)
│   ├── common.wxss             # 通用工具类
│   └── reset.wxss              # 重置默认样式
│
├── assets/                     # 静态资源
│   ├── images/                 # 图片
│   │   ├── common/             #   通用图片(logo/placeholder/empty)
│   │   ├── tabbar/             #   TabBar图标
│   │   └── ai/                 #   AI相关(Avatar/卡片背景)
│   └── icons/                  # SVG/字体图标
│
├── config/                     # 前端配置
│   ├── env.js                  # 环境切换 (dev/staging/prod)
│   └── appid.js                # AppID + HOST 配置
│
├── app.js                      # 小程序入口
├── app.json                    # 全局配置 (路由/窗口/TabBar/权限)
├── app.wxss                    # 全局样式引入
├── project.config.json         # 项目配置 (开发者工具)
├── sitemap.json                # 站点地图 (SEO无关，微信要求)
└── package.json                # npm依赖 (仅有ECharts等工具包)
```

### 3.2 小程序架构要点

| 要点 | 实现 |
|------|------|
| 角色路由 | `app.json` 通过 `"functionalPages"` 区分 B端/C端 TabBar |
| 权限管控 | 页面 `onLoad` 时调用 `permission.js` 校验，无权限跳转 403 |
| Token 管理 | `utils/auth.js` 存取 wx.Storage，`api/request.js` 自动附加 Authorization |
| 扫码组件 | `business/imei-scanner` 封装 `wx.scanCode()`，支持连续扫描模式 |
| AI 流式 | `api/ai.js` 使用 wx.request enableChunked 接收 SSE 流式响应 |

---

## 4. backend — NestJS + Prisma 后端

### 4.1 顶层结构

```
backend/
├── src/
│   ├── main.ts                     # 应用入口 (Bootstrap, Swagger, ValidationPipe)
│   ├── app.module.ts               # 根模块 (聚合所有业务模块)
│   │
│   ├── shared/                     # 共享内核（跨模块复用）
│   │   ├── domain/                 #   共享领域层
│   │   ├── application/            #   共享应用层
│   │   ├── infrastructure/         #   共享基础设施层
│   │   └── api/                    #   共享接口定义
│   │
│   ├── modules/                    # 业务模块（每个可独立拆分为微服务）
│   │   ├── auth/                   #   认证授权模块
│   │   ├── member/                 #   会员模块
│   │   ├── point/                  #   积分模块
│   │   ├── inventory/              #   库存模块
│   │   ├── purchase/               #   采购模块
│   │   ├── sale/                   #   销售模块
│   │   ├── finance/                #   财务模块
│   │   ├── commission/             #   提成模块
│   │   ├── subsidy/                #   国补模块
│   │   ├── trade-in/               #   以旧换新模块
│   │   ├── alert/                  #   预警模块
│   │   ├── agent/                  #   AI智能体模块
│   │   ├── notification/           #   通知模块(短信/站内信)
│   │   └── system/                 #   系统模块(健康检查/配置)
│   │
│   └── config/                     # 全局配置
│       ├── app.config.ts           #   应用配置 (端口/CORS/限流)
│       ├── database.config.ts      #   Prisma 连接配置
│       ├── redis.config.ts         #   Redis 连接配置
│       ├── jwt.config.ts           #   JWT 密钥 + 有效期配置
│       ├── dify.config.ts          #   Dify API 配置
│       ├── sms.config.ts           #   腾讯云短信配置
│       ├── cos.config.ts           #   腾讯云COS配置
│       ├── logger.config.ts        #   Pino 日志配置
│       └── env.validation.ts       #   环境变量 Zod 校验
│
├── prisma/                         # Prisma ORM
│   ├── schema.prisma               #   核心 Schema (由 PROJECT_CONTEXT.md §5 生成)
│   ├── migrations/                 #   迁移历史
│   │   └── YYYYMMDDHHMMSS_name/
│   │       └── migration.sql
│   └── seeds/                      #   种子数据
│       ├── dev/                    #     开发环境种子
│       │   ├── shop.ts
│       │   ├── user.ts
│       │   ├── role.ts
│       │   ├── product.ts
│       │   └── commission-rule.ts
│       └── production/             #     生产环境必需数据
│           └── admin-user.ts
│
├── test/                           # 测试
│   ├── unit/                       #   单元测试 (Jest)
│   │   ├── domain/                 #     领域逻辑测试
│   │   └── application/            #     应用服务测试
│   ├── integration/                #   集成测试 (Supertest + Testcontainers)
│   │   ├── auth/
│   │   ├── inventory/
│   │   ├── sale/
│   │   └── finance/
│   ├── e2e/                        #   端到端测试
│   │   └── scenarios/
│   │       ├── scan-outbound.e2e-spec.ts   # 扫码出库全流程
│   │       ├── return-order.e2e-spec.ts    # 退货全流程
│   │       └── points-expire.e2e-spec.ts   # 积分过期全流程
│   └── fixtures/                   #   测试夹具
│       ├── imei.fixture.ts
│       ├── order.fixture.ts
│       └── member.fixture.ts
│
├── scripts/                        # 开发/运维脚本
│   ├── prisma-generate.sh          #   Prisma Client 生成
│   ├── db-migrate.sh               #   数据库迁移
│   ├── db-migrate-prod.sh          #   生产数据库迁移(需审批)
│   ├── seed.sh                     #   种子数据填充
│   ├── backup.sh                   #   数据库备份
│   └── partition-manage.sh         #   分区表管理(创建/归档)
│
├── Dockerfile                      # 生产镜像
├── Dockerfile.dev                  # 开发镜像 (含热重载)
├── .dockerignore
├── tsconfig.json                   # TypeScript 基础配置
├── tsconfig.build.json             # 构建配置 (排除 test/ 等)
├── nest-cli.json                   # NestJS CLI 配置
├── package.json
├── pnpm-lock.yaml                  # pnpm 锁定文件
├── .env.example                    # 环境变量模板
├── .eslintrc.js                    # ESLint 配置
└── .prettierrc                     # Prettier 配置
```

### 4.2 共享内核 — shared/

```
src/shared/
├── domain/                         # 共享领域层
│   ├── value-objects/              #   通用值对象
│   │   ├── money.vo.ts             #     Money (amount: Decimal, currency: CNY)
│   │   ├── phone.vo.ts             #     Phone (验证+脱敏)
│   │   ├── imei.vo.ts              #     IMEI (15位校验+脱敏)
│   │   ├── order-no.vo.ts          #     订单号生成规则
│   │   ├── shop-id.vo.ts           #     门店ID
│   │   └── date-range.vo.ts        #     日期范围 (start/end 校验)
│   ├── entities/                   #   共享实体基类
│   │   ├── base.entity.ts          #     id, createdAt, updatedAt
│   │   ├── soft-deletable.entity.ts#     + deletedAt
│   │   └── versioned.entity.ts     #     + version (乐观锁)
│   ├── events/                     #   领域事件基类
│   │   ├── domain-event.base.ts    #     领域事件抽象基类
│   │   └── event-bus.interface.ts  #     IEventBus 接口
│   ├── exceptions/                 #   领域异常
│   │   ├── domain.exception.ts     #     领域异常基类
│   │   ├── business-rule-violation.ts#   业务规则违反
│   │   ├── concurrency-conflict.ts #     乐观锁冲突
│   │   ├── insufficient-stock.ts   #     库存不足
│   │   └── invalid-state-transition.ts#  非法状态转换
│   ├── enums/                      #   共享枚举
│   │   ├── stock-status.enum.ts    #     pending_audit | in_stock | sold | returned | frozen
│   │   ├── audit-status.enum.ts    #     pending | approved | rejected
│   │   ├── order-status.enum.ts    #     订单状态
│   │   ├── payment-method.enum.ts  #     cash | wechat | alipay | bank_transfer | refund
│   │   └── point-change-type.enum.ts#   earn | redeem | expire | referral | manual_adjust
│   └── guards/                     #   领域守卫接口
│       └── permission.interface.ts #     IPermissionChecker
│
├── application/                    # 共享应用层
│   ├── guards/                     #   NestJS Guards
│   │   ├── jwt-auth.guard.ts       #     JWT 签名 + 有效期验证
│   │   ├── roles.guard.ts          #     角色 + 权限校验
│   │   ├── readonly.guard.ts       #     AI只读强制拦截 (非GET→403)
│   │   └── throttler.guard.ts      #     限流守卫 (配合 @nestjs/throttler)
│   ├── interceptors/               #   NestJS Interceptors
│   │   ├── logging.interceptor.ts  #     请求日志 (Pino: traceId/module/action/duration)
│   │   ├── mask-data.interceptor.ts#     数据脱敏 (phone/IMEI/cost)
│   │   ├── audit-log.interceptor.ts#     审计日志自动记录 (配合 @Auditable 装饰器)
│   │   └── transform.interceptor.ts#     响应格式统一包装
│   ├── pipes/                      #   NestJS Pipes
│   │   ├── validation.pipe.ts      #     全局 Zod 验证 (替换默认 ValidationPipe)
│   │   └── parse-object-id.pipe.ts #     参数转换
│   ├── decorators/                 #   自定义装饰器
│   │   ├── current-user.decorator.ts#    @CurrentUser() 获取 JWT payload
│   │   ├── current-shop.decorator.ts#    @CurrentShop() 获取当前门店
│   │   ├── permissions.decorator.ts#     @Permissions('write:sale')
│   │   ├── auditable.decorator.ts  #     @Auditable('sale.outbound') 标记需审计
│   │   ├── idempotent.decorator.ts #     @Idempotent() 幂等校验
│   │   ├── transactional.decorator.ts#   @Transactional() Prisma事务装饰器
│   │   └── public.decorator.ts     #     @Public() 跳过JWT验证
│   ├── filters/                    #   异常过滤器
│   │   ├── http-exception.filter.ts#     统一异常响应格式
│   │   └── domain-exception.filter.ts#   领域异常 → HTTP状态码映射
│   ├── dtos/                       #   共享 DTO
│   │   ├── pagination.dto.ts       #     分页请求 (page/pageSize/sort/order)
│   │   ├── paginated-response.dto.ts#   分页响应 (items/total/page/pageSize)
│   │   └── idempotency.dto.ts      #     幂等键 DTO
│   └── services/                   #   共享应用服务
│       ├── event-bus.service.ts    #     领域事件总线 (进程内 EventEmitter)
│       └── idempotency.service.ts  #     幂等键管理 (Redis SET NX + TTL)
│
├── infrastructure/                 # 共享基础设施层
│   ├── prisma/                     #   Prisma
│   │   ├── prisma.service.ts       #     PrismaService (onModuleInit/Destroy, 连接池)
│   │   ├── prisma-health.indicator.ts#   Prisma 健康检查
│   │   ├── prisma.transaction.ts   #     事务辅助 (封装 $transaction)
│   │   └── prisma-json.mapper.ts   #     JSON字段类型映射
│   ├── redis/                      #   Redis
│   │   ├── redis.service.ts        #     RedisService (ioredis 封装)
│   │   ├── redis-cache.service.ts  #     缓存服务 (get/set/del/keys)
│   │   ├── redis-lock.service.ts   #     分布式锁 (Redlock 简化版)
│   │   └── redis-health.indicator.ts#    Redis 健康检查
│   ├── cache/                      #   缓存策略
│   │   ├── cache.interceptor.ts    #     @Cacheable() 自动缓存拦截器
│   │   └── cache-invalidation.ts   #     缓存失效策略 (写操作后批量清除)
│   ├── cos/                        #   腾讯云 COS 对象存储
│   │   ├── cos.service.ts          #     上传/下载/预签名URL
│   │   └── cos.module.ts           #     COS 动态模块 (异步配置)
│   ├── sms/                        #   腾讯云短信
│   │   ├── sms.service.ts          #     发送短信/模板管理
│   │   └── sms.module.ts           #     SMS 动态模块
│   ├── dify/                       #   Dify AI 平台
│   │   ├── dify.client.ts          #     Dify API 客户端 (chat/upload/feedback)
│   │   └── dify.module.ts          #     Dify 动态模块
│   ├── claude/                     #   Claude API (直连备用)
│   │   └── claude.client.ts        #     直连 Claude API (Dify不可用时降级)
│   ├── logger/                     #   日志
│   │   ├── pino.logger.ts          #     Pino 实例 (JSON格式输出stdout)
│   │   └── logger.module.ts        #     Logger 模块
│   └── crypto/                     #   加密
│       ├── hash.service.ts         #     bcrypt (cost=12)
│       └── aes.service.ts          #     AES-256-GCM (敏感字段存储加密)
│
└── api/                            # 共享接口层
    └── response/                   #   统一响应
        ├── api-response.dto.ts     #     { code, message, data, traceId, timestamp }
        ├── api-error-codes.ts      #     错误码常量 (11个标准错误码)
        └── api-paginated.dto.ts    #     分页响应泛型
```

### 4.3 业务模块标准结构 — modules/

每个模块严格遵循 DDD 四层架构。以 `sale/` 为例展示完整结构：

```
src/modules/sale/                          # ── 销售模块 ──
├── domain/                                # 领域层（无外部依赖）
│   ├── entities/                          #   实体
│   │   ├── sale-order.entity.ts           #     SaleOrder (包含财务字段)
│   │   ├── sale-item.entity.ts            #     SaleItem (单件商品明细)
│   │   └── return-order.entity.ts         #     ReturnOrder (退货单)
│   ├── value-objects/                     #   值对象
│   │   ├── order-no.vo.ts                 #     订单号 (生成规则: SO+YYYYMMDD+序号)
│   │   ├── return-no.vo.ts               #     退货单号
│   │   ├── sale-price.vo.ts              #     售价 (含最低售价校验)
│   │   └── payment-amount.vo.ts          #     收款金额
│   ├── events/                            #   领域事件
│   │   ├── order-created.event.ts         #     订单已创建
│   │   ├── order-paid.event.ts            #     订单已收款
│   │   ├── return-requested.event.ts      #     退货已申请
│   │   └── return-approved.event.ts       #     退货已审核
│   ├── services/                          #   领域服务
│   │   ├── profit-calculator.service.ts   #     毛利计算 (售价-成本快照-提成-补贴)
│   │   ├── points-calculator.service.ts   #     积分计算 (实付金额→积分)
│   │   └── commission-estimator.service.ts#    提成预估 (匹配规则→预估金额)
│   └── repositories/                      #   仓储接口 (端口)
│       ├── sale-order.repository.ts       #     ISaleOrderRepository
│       ├── sale-item.repository.ts        #     ISaleItemRepository
│       └── return-order.repository.ts     #     IReturnOrderRepository
│
├── application/                           # 应用层（编排领域对象）
│   ├── services/                          #   应用服务 (Use Case)
│   │   ├── scan-outbound.service.ts       #     扫码出库 (核心事务)
│   │   │                                   #     - 校验IMEI在库 + 乐观锁
│   │   │                                   #     - 创建订单 + 更新库存 + 积分 + 提成
│   │   │                                   #     - 单数据库事务保证一致性
│   │   ├── create-payment.service.ts      #     记录收款
│   │   ├── return-order.service.ts        #     退货申请→审核流程
│   │   ├── approve-return.service.ts      #     退货审核 (恢复库存+冲正积分+追回提成)
│   │   ├── soft-delete-order.service.ts   #     软删除订单
│   │   └── order-query.service.ts         #     订单查询 (列表/详情/导出)
│   ├── dtos/                              #   应用层 DTO
│   │   ├── scan-outbound.dto.ts           #     出库请求: imei[], memberId?, paymentMethod
│   │   ├── payment.dto.ts                 #     收款请求
│   │   ├── return-request.dto.ts          #     退货请求
│   │   ├── return-audit.dto.ts            #     退货审核请求
│   │   ├── order-query.dto.ts             #     订单查询筛选
│   │   └── order-list-response.dto.ts     #     订单列表响应 (含脱敏IMEI)
│   ├── ports/                             #   端口接口 (出站)
│   │   ├── inventory.port.ts              #     IInventoryPort (依赖库存模块)
│   │   ├── member.port.ts                 #     IMemberPort (依赖会员模块)
│   │   ├── point.port.ts                  #     IPointPort (依赖积分模块)
│   │   ├── commission.port.ts             #     ICommissionPort (依赖提成模块)
│   │   ├── notification.port.ts           #     INotificationPort (发短信通知)
│   │   └── finance.port.ts               #     IFinancePort (依赖财务模块)
│   └── sagas/                             #   Saga (分布式事务编排 — 微服务阶段用)
│       └── return-order.saga.ts           #     退货流程 Saga (库存→积分→提成→退款)
│
├── infrastructure/                        # 基础设施层（实现端口）
│   ├── persistence/                       #   持久化
│   │   ├── prisma-sale-order.repository.ts#    Prisma 实现 ISaleOrderRepository
│   │   ├── prisma-sale-item.repository.ts #    Prisma 实现 ISaleItemRepository
│   │   ├── prisma-return-order.repository.ts#  Prisma 实现 IReturnOrderRepository
│   │   └── sale.mapper.ts                 #    Prisma Model ↔ Domain Entity 映射
│   ├── adapters/                          #   适配器 (实现 ports/)
│   │   ├── inventory.adapter.ts           #     调用 InventoryModuleService
│   │   ├── member.adapter.ts              #     调用 MemberModuleService
│   │   ├── point.adapter.ts               #     调用 PointModuleService
│   │   ├── commission.adapter.ts          #     调用 CommissionModuleService
│   │   ├── notification.adapter.ts        #     写入 notification_outbox 表
│   │   └── finance.adapter.ts            #     调用 FinanceModuleService
│   └── external/                          #   外部服务
│       └── (销售模块不直接访问外部服务，通过 adapters)
│
├── interfaces/                            # 接口层（HTTP Controllers）
│   ├── http/                              #   REST Controllers
│   │   ├── sale.controller.ts             #     /api/sale/*
│   │   │                                   #     POST outbound/scan
│   │   │                                   #     GET  orders
│   │   │                                   #     GET  orders/:orderNo
│   │   │                                   #     DELETE orders/:orderNo (软删除)
│   │   │                                   #     POST payment
│   │   │                                   #     GET  payment/list
│   │   │                                   #     GET  payment/:paymentNo
│   │   │                                   #     GET  daily-summary
│   │   │                                   #     GET  export
│   │   └── return.controller.ts           #     /api/return/*
│   │                                       #     POST submit (退货申请)
│   │                                       #     GET  list (退货列表)
│   │                                       #     GET  :returnNo (退货详情)
│   │                                       #     POST :returnNo/audit (审核)
│   │                                       #     DELETE :returnNo (撤销退货单)
│   ├── dto/                               #   接口层 DTO (请求验证 + Swagger 装饰器)
│   │   ├── scan-outbound.request.dto.ts
│   │   ├── payment.request.dto.ts
│   │   ├── return.request.dto.ts
│   │   └── order-query.request.dto.ts
│   └── mappers/                           #   DTO ↔ Application DTO 映射
│       └── sale-dto.mapper.ts
│
├── sale.module.ts                         # NestJS 模块定义
│                                           # imports: [SharedModule, InventoryModule, ...]
│                                           # providers: [所有 Service + Repository]
│                                           # controllers: [SaleController, ReturnController]
│                                           # exports: [Port Implementations]
└── sale.module.spec.ts                    # 模块集成测试
```

### 4.4 全部业务模块速览

```
src/modules/
├── auth/                                  # 认证授权
│   ├── domain/
│   │   ├── entities/user.entity.ts
│   │   ├── entities/role.entity.ts
│   │   ├── value-objects/password.vo.ts
│   │   ├── value-objects/token.vo.ts
│   │   ├── services/token-blacklist.service.ts
│   │   └── repositories/user.repository.ts
│   ├── application/
│   │   ├── services/login.service.ts      #   手机号+验证码登录 / 密码登录
│   │   ├── services/token.service.ts      #   JWT签发 + Refresh Token 轮换
│   │   ├── services/logout.service.ts     #   Token加入Redis黑名单
│   │   ├── dtos/login.dto.ts
│   │   └── dtos/token-response.dto.ts
│   ├── infrastructure/
│   │   ├── persistence/prisma-user.repository.ts
│   │   ├── persistence/prisma-role.repository.ts
│   │   └── external/jwt.service.ts        #   @nestjs/jwt 封装
│   ├── interfaces/
│   │   ├── http/auth.controller.ts        #     /api/auth/*
│   │   └── guards/                        #     JwtAuthGuard, RolesGuard 实现
│   └── auth.module.ts
│
├── member/                                # 会员管理
│   ├── domain/
│   │   ├── entities/member.entity.ts
│   │   ├── entities/referral.entity.ts
│   │   ├── value-objects/member-phone.vo.ts
│   │   ├── events/member-registered.event.ts
│   │   ├── events/referral-rewarded.event.ts
│   │   └── repositories/member.repository.ts
│   ├── application/
│   │   ├── services/register.service.ts
│   │   ├── services/member-query.service.ts
│   │   ├── services/referral.service.ts   #   推荐关系 + 老带新奖励
│   │   ├── dtos/register.dto.ts
│   │   └── dtos/member-list.dto.ts
│   ├── infrastructure/
│   │   └── persistence/prisma-member.repository.ts
│   ├── interfaces/
│   │   ├── http/member.controller.ts      #     /api/members/* (B端)
│   │   └── http/c-member.controller.ts    #     /api/c/members/*  (C端)
│   └── member.module.ts
│
├── point/                                 # 积分
│   ├── domain/
│   │   ├── entities/point-ledger.entity.ts
│   │   ├── value-objects/point-amount.vo.ts
│   │   ├── events/points-earned.event.ts
│   │   ├── events/points-expired.event.ts
│   │   ├── services/fifo-consumer.service.ts  # FIFO积分消耗算法
│   │   ├── services/expire-calculator.service.ts# 积分过期计算
│   │   └── repositories/point-ledger.repository.ts
│   ├── application/
│   │   ├── services/point-earn.service.ts
│   │   ├── services/point-redeem.service.ts
│   │   ├── services/point-expire.service.ts    # 定时批量过期
│   │   ├── services/manual-adjust.service.ts   # 手动调整(冲正)
│   │   └── dtos/
│   ├── infrastructure/
│   │   └── persistence/prisma-point-ledger.repository.ts
│   ├── interfaces/
│   │   ├── http/point.controller.ts       #     /api/points/* (B端)
│   │   └── http/c-point.controller.ts     #     /api/c/points/*  (C端)
│   └── point.module.ts
│
├── inventory/                             # 库存
│   ├── domain/
│   │   ├── entities/product.entity.ts
│   │   ├── entities/product-sku.entity.ts
│   │   ├── entities/imei-stock.entity.ts
│   │   ├── entities/stock-ledger.entity.ts
│   │   ├── entities/stock-check.entity.ts
│   │   ├── entities/stock-check-item.entity.ts
│   │   ├── value-objects/imei.vo.ts       #     IMEI 15位校验
│   │   ├── value-objects/cost-price.vo.ts
│   │   ├── value-objects/location.vo.ts
│   │   ├── events/stock-inbound.event.ts
│   │   ├── events/stock-outbound.event.ts
│   │   ├── events/stock-check-committed.event.ts
│   │   ├── services/imei-lifecycle.service.ts# IMEI全生命周期追踪
│   │   └── repositories/imei-stock.repository.ts
│   ├── application/
│   │   ├── services/product-crud.service.ts
│   │   ├── services/stock-query.service.ts
│   │   ├── services/stock-check.service.ts     # 盘点创建/扫码/提交/确认
│   │   ├── services/low-stock-check.service.ts # 低库存预警
│   │   └── dtos/
│   ├── infrastructure/
│   │   ├── persistence/prisma-product.repository.ts
│   │   ├── persistence/prisma-imei-stock.repository.ts
│   │   └── persistence/prisma-stock-ledger.repository.ts
│   ├── interfaces/
│   │   ├── http/product.controller.ts
│   │   ├── http/stock.controller.ts
│   │   ├── http/stock-check.controller.ts
│   │   └── http/export.controller.ts      #     Excel导出
│   └── inventory.module.ts
│
├── purchase/                              # 采购
│   ├── domain/
│   │   ├── entities/purchase-order.entity.ts
│   │   ├── entities/purchase-item.entity.ts
│   │   ├── value-objects/purchase-no.vo.ts
│   │   ├── events/purchase-submitted.event.ts
│   │   ├── events/purchase-audited.event.ts
│   │   └── repositories/purchase-order.repository.ts
│   ├── application/
│   │   ├── services/scan-inbound.service.ts    # 扫码入库
│   │   ├── services/audit-inbound.service.ts   # 入库审核
│   │   ├── services/purchase-query.service.ts
│   │   └── dtos/
│   ├── infrastructure/
│   │   └── persistence/prisma-purchase.repository.ts
│   ├── interfaces/
│   │   └── http/purchase.controller.ts
│   └── purchase.module.ts
│
├── sale/                                  # 销售（详见 4.3）
│   └── ...
│
├── finance/                               # 财务
│   ├── domain/
│   │   ├── entities/payment-flow.entity.ts
│   │   ├── entities/daily-reconcile.entity.ts
│   │   ├── value-objects/payment-no.vo.ts
│   │   ├── services/gross-profit.service.ts#  毛利汇总计算
│   │   ├── services/reconcile.service.ts  #   日终对账逻辑
│   │   └── repositories/payment-flow.repository.ts
│   ├── application/
│   │   ├── services/finance-query.service.ts
│   │   ├── services/reconcile-executor.service.ts
│   │   └── dtos/
│   ├── infrastructure/
│   │   └── persistence/prisma-finance.repository.ts
│   ├── interfaces/
│   │   └── http/finance.controller.ts
│   └── finance.module.ts
│
├── commission/                            # 提成
│   ├── domain/
│   │   ├── entities/commission-rule.entity.ts
│   │   ├── entities/commission-ledger.entity.ts
│   │   ├── value-objects/commission-value.vo.ts
│   │   ├── services/rule-matcher.service.ts#   提成规则匹配引擎
│   │   └── repositories/commission.repository.ts
│   ├── application/
│   │   ├── services/rule-crud.service.ts
│   │   ├── services/settlement.service.ts
│   │   └── dtos/
│   ├── infrastructure/
│   │   └── persistence/prisma-commission.repository.ts
│   ├── interfaces/
│   │   └── http/commission.controller.ts
│   └── commission.module.ts
│
├── subsidy/                               # 国补
│   ├── domain/
│   │   ├── entities/subsidy-record.entity.ts
│   │   ├── value-objects/subsidy-amount.vo.ts
│   │   ├── events/subsidy-approved.event.ts
│   │   ├── events/subsidy-recalled.event.ts
│   │   └── repositories/subsidy.repository.ts
│   ├── application/
│   │   ├── services/subsidy-apply.service.ts
│   │   ├── services/subsidy-audit.service.ts
│   │   └── dtos/
│   ├── infrastructure/
│   │   └── persistence/prisma-subsidy.repository.ts
│   ├── interfaces/
│   │   └── http/subsidy.controller.ts
│   └── subsidy.module.ts
│
├── trade-in/                              # 以旧换新
│   ├── domain/
│   │   ├── entities/trade-in-order.entity.ts
│   │   ├── value-objects/appraisal.vo.ts
│   │   └── repositories/trade-in.repository.ts
│   ├── application/
│   │   └── services/trade-in.service.ts
│   ├── infrastructure/
│   │   └── persistence/prisma-trade-in.repository.ts
│   ├── interfaces/
│   │   └── http/trade-in.controller.ts
│   └── trade-in.module.ts
│
├── alert/                                 # 预警
│   ├── domain/
│   │   ├── entities/alert-rule.entity.ts
│   │   ├── entities/alert-log.entity.ts
│   │   ├── value-objects/threshold.vo.ts
│   │   ├── services/alert-evaluator.service.ts#预警条件评估引擎
│   │   └── repositories/alert.repository.ts
│   ├── application/
│   │   ├── services/rule-config.service.ts
│   │   └── services/alert-check.service.ts#   定时检查预警条件
│   ├── infrastructure/
│   │   └── persistence/prisma-alert.repository.ts
│   ├── interfaces/
│   │   └── http/alert.controller.ts
│   └── alert.module.ts
│
├── agent/                                 # AI 智能体（全部只读）
│   ├── domain/
│   │   ├── entities/ai-chat-log.entity.ts
│   │   ├── value-objects/confidence.vo.ts
│   │   ├── enums/ai-function.enum.ts
│   │   └── services/intent-parser.service.ts
│   ├── application/
│   │   ├── services/chat.service.ts       #   AI对话 (透传Dify/Claude)
│   │   ├── services/function-calling.service.ts# Function Calling 路由
│   │   ├── services/transfer-human.service.ts
│   │   └── dtos/chat.dto.ts
│   ├── infrastructure/
│   │   ├── external/dify.adapter.ts       #   Dify API 调用
│   │   └── persistence/prisma-ai-log.repository.ts
│   ├── interfaces/
│   │   ├── http/agent.controller.ts       #     /api/ai/*
│   │   ├── http/ai-inventory.controller.ts#    /api/ai/inventory/*
│   │   ├── http/ai-finance.controller.ts  #    /api/ai/finance/*
│   │   └── http/ai-member.controller.ts   #    /api/ai/member/*
│   └── agent.module.ts
│
├── notification/                          # 通知
│   ├── domain/
│   │   ├── entities/notification-outbox.entity.ts
│   │   ├── entities/sms-log.entity.ts
│   │   ├── events/notification-published.event.ts
│   │   └── repositories/outbox.repository.ts
│   ├── application/
│   │   ├── services/outbox-poller.service.ts  # 定时轮询 outbox 表发送
│   │   ├── services/sms-sender.service.ts
│   │   └── dtos/
│   ├── infrastructure/
│   │   ├── external/sms.adapter.ts        #   腾讯云短信 SDK 适配
│   │   └── persistence/prisma-outbox.repository.ts
│   ├── interfaces/
│   │   └── (无HTTP接口，仅定时任务 + 模块间调用)
│   └── notification.module.ts
│
└── system/                                # 系统
    ├── application/
    │   └── services/health-check.service.ts
    ├── interfaces/
    │   └── http/system.controller.ts      #     /api/system/health, /api/system/metrics
    └── system.module.ts
```

### 4.5 模块间通信规则

```
模块间通信严格遵循 Port/Adapter 模式：

┌──────────────────────────────────────────────┐
│  SaleModule (调用方)                          │
│                                              │
│  application/ports/inventory.port.ts          │
│    interface IInventoryPort {                 │
│      checkAndLockImei(imei, version): Promise │
│    }                                          │
│                                              │
│  infrastructure/adapters/inventory.adapter.ts │
│    @Injectable()                              │
│    class InventoryAdapter                     │
│      implements IInventoryPort {             │
│      constructor(                              │
│        private inventorySvc: InventoryService │ ← 注入被调用方 Application Service
│      ) {}                                     │
│    }                                          │
└──────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  InventoryModule (被调用方)                   │
│                                              │
│  application/services/inventory.service.ts    │
│    @Injectable()                              │
│    class InventoryService {                  │ ← 提供公共方法
│      checkAndLockImei(imei, version) {}       │
│    }                                          │
│  inventory.module.ts                          │
│    exports: [InventoryService]               │ ← 导出给其他模块
└──────────────────────────────────────────────┘

规则:
1. 模块间仅通过 Application Service 通信
2. 不直接访问其他模块的 Repository
3. 不直接访问其他模块的 Domain Entity
4. 端口接口定义在调用方 (application/ports/)
5. 适配器实现在调用方 (infrastructure/adapters/)
6. 被调用方仅需 export Application Service
```

### 4.6 后端配置模块 — config/

```
src/config/
├── app.config.ts                   # 应用配置
│   registerAs('app', () => ({
│     port: parseInt(process.env.PORT, 10) || 3000,
│     cors: { origin: process.env.CORS_ORIGIN?.split(',') || [] },
│     globalPrefix: 'api',
│     throttle: { ttl: 60, limit: 30 },  # 限流默认值
│   }))
├── database.config.ts              # Prisma 连接配置
│   registerAs('database', () => ({
│     url: process.env.DATABASE_URL,     # mysql://user:pass@host:3306/db
│     pool: { min: 2, max: 20 },         # 连接池大小
│   }))
├── redis.config.ts                 # Redis 连接配置
│   registerAs('redis', () => ({
│     host: process.env.REDIS_HOST || 'localhost',
│     port: parseInt(process.env.REDIS_PORT, 10) || 6379,
│     password: process.env.REDIS_PASS,
│     db: parseInt(process.env.REDIS_DB, 10) || 0,
│     keyPrefix: '3c:',
│   }))
├── jwt.config.ts                   # JWT 配置
│   registerAs('jwt', () => ({
│     secret: process.env.JWT_SECRET,
│     aiReadonlySecret: process.env.AI_READONLY_SECRET,
│     expiresIn: '2h',                    # 商家端2小时
│     memberExpiresIn: '24h',             # 会员端24小时
│     aiExpiresIn: '24h',                 # AI Token 24小时
│     refreshExpiresIn: '7d',
│   }))
├── dify.config.ts                  # Dify API 配置
├── sms.config.ts                   # 腾讯云短信配置
├── cos.config.ts                   # 腾讯云 COS 配置
├── logger.config.ts                # Pino 日志配置
│   registerAs('logger', () => ({
│     level: process.env.LOG_LEVEL || 'info',
│     redact: ['req.headers.authorization', 'req.headers.cookie'],
│   }))
└── env.validation.ts               # 环境变量 Zod Schema 校验
    # 应用启动时自动校验所有必需的环境变量
    # 缺失 → 抛出明确错误，拒绝启动
```

---

## 5. database — 数据库管理

```
database/
├── scripts/                         # 运维脚本
│   ├── backup-full.sh               #   全量备份 (mysqldump --single-transaction)
│   ├── backup-binlog.sh             #   增量备份 (binlog)
│   ├── restore.sh                   #   数据恢复
│   ├── archive.sh                   #   冷数据归档 (分区表 → COS)
│   ├── migrate.sh                   #   数据库迁移执行 (Prisma)
│   └── verify-reconcile.sh          #   对账验证脚本
│
├── migrations/                      # 历史SQL迁移 (参考用，正式迁移由Prisma管理)
│   └── V1.0__init.sql              #   初始 DDL 归档
│
├── partitioning/                    # 分区管理
│   ├── create-partitions.sql        #   创建新分区 (提前6个月)
│   ├── drop-old-partitions.sql      #   清理旧分区 (归档后删除)
│   ├── partition-maintenance.sql    #   分区维护(REORGANIZE)
│   └── README.md                    #   分区表维护说明
│
├── seeds/                           # SQL 种子数据
│   ├── 01-shop.sql                  #   默认门店
│   ├── 02-sys-role.sql              #   6种系统角色
│   ├── 03-admin-user.sql            #   管理员初始账号
│   └── 04-alert-rule-defaults.sql  #   默认预警规则
│
└── README.md                        # 数据库运维手册
```

---

## 6. deploy — 部署与运维

```
deploy/
├── docker/                          # Docker Compose 部署
│   ├── docker-compose.yml           #   开发环境
│   ├── docker-compose.prod.yml      #   生产环境
│   ├── .env.docker                  #   Docker 环境变量模板
│   ├── nginx/                       #   Nginx 配置
│   │   ├── nginx.conf               #     主配置 (worker_processes/events/http)
│   │   ├── conf.d/
│   │   │   ├── api.conf             #       API 反向代理 + SSL
│   │   │   ├── rate-limit.conf      #       限流规则 (30r/s, 关键接口10r/s)
│   │   │   └── security.conf        #       安全头 (HSTS/CSP/X-Frame-Options)
│   │   └── ssl/                     #       SSL 证书
│   │       ├── cert.pem
│   │       └── key.pem
│   ├── mysql/                       #   MySQL 配置
│   │   ├── my.cnf                   #     字符集/InnoDB/慢查询/连接数
│   │   └── init/                    #     初始化脚本
│   │       ├── 01-create-db.sql     #       创建数据库
│   │       ├── 02-grant-user.sql    #       授权 app_rw / app_ro
│   │       └── 03-init-schema.sql   #       初始化表结构 (Prisma已有，备用)
│   ├── redis/                       #   Redis 配置
│   │   └── redis.conf              #       maxmemory/policy/持久化
│   └── monitoring/                  #   监控套件
│       ├── prometheus/
│       │   └── prometheus.yml       #       Prometheus 抓取配置
│       ├── grafana/
│       │   └── dashboards/          #       Grafana 面板 JSON
│       │       ├── api-overview.json
│       │       ├── database.json
│       │       └── business-metrics.json
│       └── loki/
│           └── loki-config.yml      #       Loki 日志聚合配置
│
├── k8s/                             # Kubernetes 部署 (未来)
│   ├── base/                        #   基础配置
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secret.yaml              #     (SealedSecret 引用)
│   │   └── kustomization.yaml
│   └── overlays/                    #   环境覆盖
│       ├── staging/
│       │   └── kustomization.yaml
│       └── production/
│           ├── kustomization.yaml
│           └── ingress.yaml
│
├── scripts/                         # 运维脚本
│   ├── deploy.sh                    #   一键部署 (docker compose up -d)
│   ├── rollback.sh                  #   回滚 (切换到上一个镜像版本)
│   ├── health-check.sh              #   健康检查 (curl /api/system/health)
│   ├── ssl-renew.sh                 #   SSL证书续期 (certbot)
│   └── log-rotate.sh               #   日志轮转
│
└── README.md                        # 部署手册
```

---

## 7. docs — 项目文档

```
docs/
├── PROJECT_CONTEXT.md               # 唯一标准 (SSOT) ★★★
├── ARCHITECTURE.md                   # 本文档 — 目录结构 ★★★
├── API.md                           # API接口规范 (114 endpoints)
├── DB_Production_Design.sql         # 数据库完整DDL (参考)
├── Test_Plan.md                     # 测试方案 (75 case)
├── MVP_Iteration_Plan.md            # MVP 迭代计划
├── PRD_3C零售小程序智能体.md         # 产品需求文档 (参考)
│
├── adr/                             # 架构决策记录
│   ├── 001-prisma-over-typeorm.md   #   选择 Prisma 而非 TypeORM 的原因
│   ├── 002-transactional-outbox.md  #   事务发件箱模式 (替代分布式事务)
│   ├── 003-optimistic-locking.md    #   乐观锁设计决策
│   ├── 004-insert-only-pattern.md   #   INSERT ONLY 审计模式
│   ├── 005-ai-readonly-guard.md     #   AI只读双重校验
│   └── 006-monolith-first.md        #   单体优先→渐进拆分的策略
│
└── diagrams/                        # 架构图 (PlantUML / Mermaid 源码)
    ├── system-context.puml          #   系统上下文图 (C4 Level-1)
    ├── container.puml               #   容器图 (C4 Level-2)
    ├── deployment.puml              #   部署拓扑图
    ├── database-er.puml             #   数据库ER图 (30表)
    ├── auth-flow.puml               #   认证流程时序图
    ├── scan-outbound.puml           #   扫码出库时序图 (最复杂事务)
    └── return-flow.puml             #   退货流程时序图
```

---

## 8. CI/CD — GitHub Actions

```
.github/
├── workflows/
│   ├── ci.yml                       # CI: 代码检查 + 测试
│   │   # 触发: push → feature/*, bugfix/*, PR → main
│   │   # Jobs:
│   │   #   1. lint (ESLint + Prettier)
│   │   #   2. type-check (tsc --noEmit)
│   │   #   3. unit-test (Jest --coverage, 覆盖率≥80%)
│   │   #   4. integration-test (Testcontainers MySQL+Redis)
│   │   #   5. e2e-test (关键场景: 出库/退货/积分)
│   │   #   6. security-scan (npm audit, CodeQL)
│   │
│   ├── cd-staging.yml               # CD: 部署到预发布环境
│   │   # 触发: push → main
│   │   # Jobs:
│   │   #   1. build (Docker build + push → 腾讯云 TCR)
│   │   #   2. migrate (Prisma migrate deploy)
│   │   #   3. deploy (SSH → docker compose pull + up -d)
│   │   #   4. smoke-test (curl 核心API → 预期响应码)
│   │   #   5. rollback (on failure: 切回上一个镜像)
│   │
│   └── cd-production.yml            # CD: 部署到生产环境
│       # 触发: release published
│       # 需要: 手动审批 (environment protection rule)
│       # Jobs:
│       #   1. build (同 staging)
│       #   2. db-backup (部署前强制备份)
│       #   3. migrate (生产迁移需额外审批)
│       #   4. deploy-blue-green (蓝绿部署, 零停机)
│       #   5. health-check (持续3分钟, 确认P95≤200ms)
│       #   6. rollback (on failure: 自动回滚)
│       #   7. notify (企业微信通知)
│
├── dependabot.yml                   # 依赖自动更新
│   # nuget: false, docker: true, npm: true
│   # schedule: weekly
│   # 自动 PR: patch/minor 自动合并, major 手动审核
│
└── CODEOWNERS                       # 代码所有者
    # backend/   @backend-team
    # miniapp/   @frontend-team
    # database/  @dba-team
    # deploy/    @devops-team
```

---

## 9. 微服务拆分路线

### 9.1 当前状态：模块化单体 (Modular Monolith)

```
┌─────────────────────────────────────────────────┐
│  NestJS App (单进程)                             │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ Auth │ │Member│ │Point │ │Inven │ │ Sale │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │Finance│ │Comm. │ │Subsidy│ │Alert │ │Agent │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│                                                  │
│  通信: 进程内 Application Service 调用            │
│  事务: Prisma $transaction (单数据库)             │
│  部署: 单 Docker 镜像                             │
└─────────────────────────────────────────────────┘
```

### 9.2 拆分优先级

| 优先级 | 模块 | 拆分信号 | 原因 |
|:------:|------|----------|------|
| 1 | **agent** | AI 请求量激增 | 独立扩缩容，不消耗主服务资源 |
| 2 | **notification** | 短信量达10万/天 | 独立限流 + 故障隔离 |
| 3 | **sale + inventory** | 扫码出库 P95 > 500ms | 核心写链路独立优化 |
| 4 | **member + point** | 会员量 > 50万 | C端读多写少，独立缓存策略 |
| 5 | **finance + commission** | 报表查询影响业务 | 读库分离 + 独立连接池 |
| 6 | **subsidy** | 国补政策变更频繁 | 独立部署，减少回归范围 |

### 9.3 拆分目录迁移

拆分时，模块目录仅需以下变更：

```
变更前 (单体):
backend/src/modules/sale/   →  全在同一个 NestJS 进程中

变更后 (微服务):
services/
├── api-gateway/                # Nginx → NestJS API Gateway (仅路由/鉴权/限流)
│   └── src/
│       └── gateway.module.ts
├── sale-service/               # sale/ 目录内容直接迁移
│   ├── src/
│   │   └── modules/sale/       # 原封不动迁移
│   ├── Dockerfile
│   └── package.json
├── inventory-service/          # inventory/ 目录内容直接迁移
│   └── ...
└── shared-lib/                 # shared/ 抽取为 npm 私有包
    └── @3c/shared/
        ├── domain/
        ├── infrastructure/
        └── package.json

关键变更:
1. 模块间 Application Service 调用 → HTTP/gRPC Client 调用
2. Prisma $transaction → Saga 编排 (消息队列)
3. 共享内核 → 发布为 @3c/shared npm 私有包
4. AppModule → 按服务拆分，各自独立 Bootstrap
```

---

## 附录 A. 文件统计

| 目录 | 一级模块 | 二级模块 | 预计文件数 |
|------|:-------:|:-------:|:---------:|
| miniapp/ | 15 pages | 40+ 子页面 | ~200 |
| backend/src/modules/ | 14 modules | 56 DDD子目录 | ~350 |
| backend/src/shared/ | 4 layers | 20+ 组件 | ~60 |
| database/ | 3 categories | — | ~15 |
| deploy/ | 3 categories | — | ~25 |
| docs/ | 3 categories | — | ~12 |
| .github/ | 3 workflows | — | ~6 |

## 附录 B. 技术约束速查

| 约束 | 值 |
|------|-----|
| Node.js | ≥ 20 LTS |
| 包管理器 | pnpm |
| TypeScript | strict mode |
| 测试框架 | Jest + Supertest |
| 集成测试 | Testcontainers (MySQL + Redis) |
| 代码覆盖率 | ≥ 80% |
| 提交规范 | Conventional Commits |
| API 风格 | RESTful (OpenAPI 3.0) |
| 日志格式 | Pino JSON |
| 部署方式 | Docker Compose → K8s |
