# 3C 数码零售管家

基于微信小程序 + NestJS 的 3C 数码零售门店全流程管理系统，覆盖进销存、会员、提成、财务、AI 智能助手。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生 |
| 后端 | NestJS + Prisma + TypeScript |
| 数据库 | MySQL 8.0 |
| 缓存 | Redis 7 |
| 反向代理 | Nginx |
| AI 平台 | Dify + DeepSeek |
| 部署 | Ubuntu 22.04 + Docker / Systemd |

---

## 功能模块

- **扫码出入库** — IMEI 串码级库存管理，乐观锁防并发冲突
- **采购管理** — 采购入库 → 审核 → 入库，全链路追踪
- **销售收银** — 购物车 → 收款 → 出库 → 积分 → 提成，单事务保证
- **库存盘点** — 创建盘点任务 → 扫码盘点 → 差异确认
- **会员管理** — 会员注册、积分流水、FIFO 积分消耗、推荐关系
- **提成结算** — 灵活提成规则引擎，月度自动结算
- **国补管理** — 国补申请 → 审批 → 拨付 → 追回
- **报表中心** — 毛利报表、员工业绩、资金流水、库存周转
- **AI 智能助手** — 自然语言查询库存 / 销售 / 会员数据，只读安全隔离
- **预警系统** — 低库存预警、滞销预警、价格异常预警

---

## 项目结构

```
├── backend/          # NestJS API 服务（DDD 架构）
│   ├── src/modules/  # 14 个业务模块（auth/member/inventory/sale/...）
│   ├── src/shared/   # 共享内核（守卫/拦截器/管道/装饰器）
│   ├── prisma/       # 数据模型 + 迁移
│   ├── nginx/        # Nginx 配置 + SSL 证书目录
│   ├── mysql/        # MySQL 配置
│   ├── redis/        # Redis 配置
│   ├── scripts/      # 备份/健康检查/分区维护脚本
│   └── DEPLOY.md     # 生产环境部署指南
├── miniapp/          # 微信小程序源码
│   ├── pages/        # 页面（auth/inventory/pos/member/report/ai/...）
│   ├── api/          # API 请求层（统一拦截/Auth/幂等）
│   ├── components/   # 公共组件（IMEI 扫码器/商品卡片/选择器等）
│   └── utils/        # 工具函数（格式化/验证/权限/Auth）
├── database/         # 数据库脚本、分区管理、种子数据
├── deploy/           # Docker Compose + Dockerfile
├── docs/             # 项目文档（架构/API/PRD/测试方案）
└── .github/          # CI/CD 工作流
```

---

## API 概览

| 模块 | 端点 | 说明 |
|------|------|------|
| Auth | `POST /api/v1/auth/login` | 手机号+验证码/密码登录 |
| Inventory | `GET /api/v1/inventory/stock` | 库存查询（IMEI/商品/门店） |
| Sale | `POST /api/v1/sale/outbound/scan` | 扫码出库 |
| Member | `GET /api/v1/members` | 会员查询 |
| Finance | `GET /api/v1/finance/daily-summary` | 日终汇总 |
| AI | `POST /api/v1/ai/chat` | AI 对话（SSE 流式） |
| System | `GET /api/v1/ai/health` | 健康检查 |

完整 API 文档见 [`docs/API.md`](docs/API.md)

---

## 快速开始 (本地开发)

### 前置要求

- Node.js >= 20 LTS
- MySQL 8.0
- Redis 7
- pnpm

### 安装

```bash
cd backend

# 安装依赖
npm ci

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库、Redis、JWT 等配置

# 数据库迁移
npx prisma migrate deploy

# 启动开发服务器
npm run start:dev

# 访问
curl http://localhost:3000/api/v1/ai/health
```

### 小程序

用微信开发者工具打开 `miniapp/` 目录，修改 `app.js` 中 `baseUrl` 为本地或线上 API 地址。

---

## 生产部署

详见 [`上线部署完整指南.md`](上线部署完整指南.md)，涵盖：

- 腾讯云服务器购买与配置
- 域名 + DNS + SSL 证书配置
- Docker / Systemd 部署方案
- Dify AI 平台配置
- 自动备份 + 健康监控
- 小程序备案与发布流程

---

## 架构亮点

- **DDD 四层架构** — domain → application → infrastructure → interfaces，模块自治，微服务就绪
- **INSERT ONLY 审计** — 所有数据变更不可覆盖，完整历史可追溯
- **乐观锁防并发** — 出库时 IMEI 版本号校验，防止一码多卖
- **AI 只读隔离** — AI Token 与应用 Token 分离，Guard 强制拦截非 GET 请求
- **Port/Adapter 模式** — 模块间通过接口耦合，依赖方向可控
- **事务发件箱** — 领域事件通过 outbox 表保证最终一致性

---

## License

UNLICENSED — 内部使用，保留所有权利。
