# 3C 数码零售管家

<div align="center">

基于 **微信小程序 + NestJS** 的 3C 数码零售门店全流程管理系统，覆盖进销存、会员、提成、财务与 AI 智能助手，为数码零售门店提供一站式数字化解决方案。

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io)
[![微信小程序](https://img.shields.io/badge/微信小程序-原生-07C160?style=flat&logo=wechat&logoColor=white)](https://developers.weixin.qq.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat&logo=mysql&logoColor=white)](https://www.mysql.com)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io)
[![Dify](https://img.shields.io/badge/AI-Dify%2BDeepSeek-8B5CF6?style=flat)](https://dify.ai)
[![Docker](https://img.shields.io/badge/Docker-24_Alpine-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat&logo=githubactions&logoColor=white)](https://github.com/LDK-SE/Little_Routine/actions)

</div>

---

## 项目概览

| 指标 | 数值 |
|------|------|
| 后端文件 | 146+ TypeScript 文件 |
| 业务模块 | 18 个领域模块 |
| 控制器 / 服务 | 13 个控制器 · 24 个服务 |
| 数据模型 | 31 个 Prisma Model · 11 个 Enum |
| 测试覆盖 | 31 个 Spec 文件，全模块覆盖 |
| API 端点 | 60+ RESTful 接口 |
| 文档 | 15 份技术文档，超 500 KB |

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | 微信小程序原生框架 | — |
| 后端框架 | NestJS | 11 |
| ORM | Prisma | 6 |
| 语言 | TypeScript | 5.9 |
| 数据库 | MySQL | 8.0 |
| 缓存 | Redis | 7 |
| 反向代理 | Nginx | — |
| AI 平台 | Dify + DeepSeek | — |
| 容器化 | Docker (Alpine) | 24 |
| CI/CD | GitHub Actions | — |
| 部署 | Ubuntu + Docker Compose / Systemd | 22.04 |

---

## 功能模块

### 进销存核心

| 模块 | 说明 |
|------|------|
| **扫码出入库** | IMEI 串码级库存管理，乐观锁防并发冲突，单码全生命周期追踪 |
| **采购管理** | 采购入库 → 审核 → 入库，全链路闭环 |
| **销售收银** | 购物车 → 收款 → 出库 → 积分 → 提成，单一事务保证数据一致性 |
| **库存盘点** | 创建盘点任务 → 扫码盘点 → 差异确认 → 调整库存 |
| **商品管理** | 多 SKU 商品维护，价格管理，分类体系 |

### 运营管理

| 模块 | 说明 |
|------|------|
| **会员管理** | 会员注册、积分流水、FIFO 积分消耗、推荐关系 |
| **提成结算** | 灵活提成规则引擎，月度自动结算 |
| **国补管理** | 国家补贴申请 → 审批 → 拨付 → 追回，全流程管控 |
| **退换货** | 退货审核、退款处理、库存回退 |
| **以旧换新** | 旧机估价 → 折抵 → 差价结算 |

### 财审风控

| 模块 | 说明 |
|------|------|
| **报表中心** | 毛利报表、员工业绩、资金流水、库存周转 |
| **日终对账** | 每日资金流与库存变动自动对账 |
| **审计日志** | 全操作链路 INSERT ONLY 审计，不可篡改 |
| **预警系统** | 低库存预警、滞销预警、价格异常预警 |

### AI 智能助手

| 能力 | 说明 |
|------|------|
| **自然语言查询** | 库存 / 毛利 / 会员积分 / 员工业绩 / 会员订单 五大领域 |
| **本地函数调用** | Dify 工作流 + 本地 5 个业务 Function，混合编排 |
| **置信度阈值** | 低于 0.85 自动转人工，生成工单 `TK{YYYYMMDD}{RAND6}` |
| **只读安全隔离** | AI Token 独立签发，Guard 强制拦截非 GET 请求 |
| **全量审计** | 每次 AI 对话记录意图、置信度、延迟、调用链路 |
| **优雅降级** | Dify 不可用时自动 Fallback，返回友好提示而非报错 |

---

## 项目结构

```
├── backend/              # NestJS API 服务
│   ├── src/
│   │   ├── agent/        # AI 智能助手 (Dify 对接 + 本地函数调用)
│   │   ├── auth/         # 认证授权 (JWT + 角色守卫)
│   │   ├── commission/   # 提成结算 (规则引擎 + 月度结算)
│   │   ├── common/       # 共享基础设施 (守卫 / 拦截器 / 管道 / 装饰器)
│   │   ├── config/       # 全局配置
│   │   ├── inventory/    # 库存管理 (IMEI 串码 + 乐观锁)
│   │   ├── member/       # 会员管理 (FIFO 积分)
│   │   ├── national-subsidy/  # 国补管理
│   │   ├── point/        # 积分引擎
│   │   ├── prisma/       # Prisma Client 封装
│   │   ├── product/      # 商品管理 (多 SKU)
│   │   ├── purchase/     # 采购管理
│   │   ├── redis/        # Redis 缓存
│   │   ├── return/       # 退换货
│   │   ├── sale/         # 销售收银
│   │   ├── trade-in/     # 以旧换新
│   │   └── user/         # 用户与门店管理
│   ├── prisma/           # 数据模型 (31 Model) + 迁移文件
│   ├── scripts/          # 备份 / 健康检查 / 分区维护脚本
│   └── test/             # 测试配置
├── miniprogram/           # 微信小程序源码
├── database/             # 数据库初始化 SQL + 分区脚本
├── deploy/               # Dockerfile (多阶段构建) + docker-compose.yml
├── .github/workflows/    # CI/CD (Lint → Test → Build → Docker)
└── docs/                 # 15 份技术文档 (架构 / API / PRD / 测试 / AI 设计)
```

---

## 数据模型速览

| 领域 | 模型 |
|------|------|
| **组织** | Shop · SysUser · SysRole · SysUserRole |
| **商品** | Product · ProductSku · ImeiStock · StockLedger |
| **采购** | PurchaseOrder · PurchaseItem |
| **销售** | SaleOrder · SaleItem · PaymentFlow |
| **会员** | Member · MemberReferral · PointLedger · PointsExpireLog |
| **退换 / 以旧换新** | ReturnOrder · TradeInOrder |
| **财务** | CommissionRule · CommissionLedger · NationalSubsidy · DailyReconcile |
| **AI** | AiChatLog |
| **审计** | AuditLog · SystemLog · NotificationOutbox |
| **预警** | AlertRule · AlertLog |
| **盘点** | StockCheck · StockCheckItem |

**高级特性**：乐观锁（`version` 字段）· 软删除（7 张表）· 分区表（5 张表 / 半年 RANGE 分区）· INSERT ONLY 审计（4 张核心财务表）

---

## API 概览

| 模块 | 端点 | 说明 |
|------|------|------|
| Auth | `POST /api/v1/auth/login` | 手机号 + 验证码 / 密码登录，返回 JWT |
| Inventory | `GET /api/v1/inventory/stock` | 库存查询（IMEI / 商品 / 门店 / 批次） |
| Sale | `POST /api/v1/sale/outbound/scan` | 扫码出库，乐观锁防并发 |
| Member | `GET /api/v1/members` | 会员查询 + 积分余额 |
| Finance | `GET /api/v1/finance/daily-summary` | 日终汇总（资金 + 库存变动） |
| AI | `POST /api/v1/ai/chat` | AI 对话（SSE 流式），支持 Function Calling |
| System | `GET /api/v1/ai/health` | 健康检查 |
| Swagger | `GET /api/docs` | Swagger UI 在线文档 |

> 完整 API 文档见 [`API.md`](API.md) · Swagger 文档启动后访问 `/api/docs`

---

## 快速开始

### 前置要求

- Node.js >= 20 LTS
- MySQL 8.0
- Redis 7
- pnpm（可选，项目使用 npm）

### 后端

```bash
cd backend

# 安装依赖
npm ci

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL、REDIS、JWT_SECRET 等配置

# 数据库迁移
npx prisma migrate deploy

# （可选）填充种子数据
npx prisma db seed

# 启动开发服务器
npm run start:dev

# 验证
curl http://localhost:3000/api/v1/ai/health
# → { "status": "ok", "timestamp": "..." }
```

### 小程序

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开 `miniprogram/` 目录
3. 修改 `app.js` 中 `baseUrl` 指向后端 API 地址
4. 编译预览

### Docker 本地部署

```bash
cd deploy

# 复制环境变量
cp ../backend/.env.example .env
# 编辑 .env 填入配置

# 一键启动 (MySQL + Redis + API)
docker compose up -d

# 查看状态
docker compose ps
```

---

## 生产部署

详见 [`上线部署完整指南.md`](上线部署完整指南.md)，涵盖：

- 腾讯云服务器选购与配置
- 域名 + DNS + SSL 证书
- Docker / Systemd 双方案部署
- Dify AI 平台对接
- 自动备份 + 健康监控
- 小程序备案与发布流程

Docker 生产镜像采用**三阶段构建**（deps → builder → runner），基于 `node:24-alpine`，以非 root 用户 `nestjs` 运行，内置 HEALTHCHECK 探针。

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────┐
│  Interfaces (Controller / Gateway)   │  ← 请求接入，参数校验
├─────────────────────────────────────┤
│  Application (Service / DTO)         │  ← 用例编排，事务管理
├─────────────────────────────────────┤
│  Domain (Entity / Repository)        │  ← 核心业务逻辑，无框架依赖
├─────────────────────────────────────┤
│  Infrastructure (Prisma / Redis)     │  ← 持久化，外部服务适配
└─────────────────────────────────────┘
```

### 核心设计决策

| 设计点 | 方案 | 解决的问题 |
|--------|------|-----------|
| **乐观锁** | IMEI `version` 字段 + Prisma 乐观并发 | 防止一码多卖，高并发出库场景下数据一致 |
| **INSERT ONLY** | 核心财务表禁止 UPDATE/DELETE | 完整审计追溯，满足合规要求 |
| **事务发件箱** | NotificationOutbox 表 + 定时投递 | 领域事件最终一致性，解耦模块间通信 |
| **Port / Adapter** | 接口定义在 Domain 层，实现在 Infrastructure | 依赖反转，便于测试和替换实现 |
| **AI 令牌隔离** | AI Token header 独立签发，Guard 级别强制只读 | AI 无法执行任何写操作，安全保障 |
| **多级缓存** | Redis 热点数据 + Prisma 查询缓存 | 降低数据库压力，提升查询性能 |
| **API 限流** | `@nestjs/throttler` + Redis 存储 | 防止恶意请求，保护 API 稳定性 |
| **优雅降级** | AI 服务不可用时 Fallback 响应 | 核心业务流程不受 AI 故障影响 |

---

## CI/CD

GitHub Actions 自动化流水线（`.github/workflows/ci.yml`）：

```
Push / PR → Lint (ESLint) → Type Check (tsc) → Test (Jest, 31 Spec) → Build (NestJS) → Docker Build
```

- 启动 MySQL 8.0 + Redis 7 Service Container
- 运行 Prisma Generate → TypeScript 编译检查 → 全量测试 + 覆盖率
- 构建生产 Docker 镜像 `3c-retail-api:ci`

---

## 贡献者

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/LDK-SE">
        <img src="https://github.com/LDK-SE.png" width="80" height="80" alt="LDK-SE" /><br />
        <sub><b>LDK-SE</b></sub>
      </a>
    </td>
  </tr>
</table>

---

## License

UNLICENSED — 内部使用，保留所有权利。
