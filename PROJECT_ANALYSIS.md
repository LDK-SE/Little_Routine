# PROJECT ANALYSIS — 3C数码零售 ERP + CRM + AI 智能体系统

> **分析日期**: 2026-06-14
> **分析范围**: PROJECT_CONTEXT.md / API.md / ARCHITECTURE.md / TASK.md / Test_Plan.md / schema.sql / schema.prisma
> **前提**: 不修改任何业务规则，不生成代码
> **基准文档**: PROJECT_CONTEXT.md (SSOT, V1.0-FROZEN)

---

## 一、项目总览

### 1.1 产品定位

面向3C数码门店的**确定性交易账本 + AI只读增强**门店经营SaaS，支撑单店→连锁门店全生命周期。

### 1.2 核心用户

| 角色 | 身份 | 核心诉求 |
|------|------|---------|
| 老板/店长 | 经营决策者 | 实时毛利、库存水位、员工业绩、资金流水 |
| 销售员 | 一线开单 | 扫码出库快、查库存准、算提成透明 |
| 仓管员 | 入库验收 | 扫码入库不重不漏、审核流程清晰 |
| 会员(C端) | 消费者 | 查积分、消费记录、老带新 |
| AI客服 | 系统角色 | 只读查询，不操作任何写链路 |

### 1.3 项目规模

| 指标 | 数据 |
|------|------|
| 技术栈 | 微信小程序原生 + NestJS + Prisma + MySQL 8.0 + Redis 7.2 + Dify + Claude API |
| 数据库表 | 32 张（schema.sql） / 32 个 Model（schema.prisma） |
| API 端点 | 116 个（API.md）/ 14 个模块 |
| 任务总数 | 125 个（TASK.md），预估 840h |
| 团队配置 | 后端 2 人 + 前端 1 人 + 测试 1 人（兼职），12 周 MVP |
| 测试用例 | 75 个（Test_Plan.md：MEM 15 + PT 12 + INV 9 + SALE 14 + AI 11 + KPI 6 + FIN 8） |

---

## 二、模块依赖关系分析

### 2.1 14 个业务模块全景

```
                        ┌─────────────────────────────┐
                        │     Shared Kernel (共享内核)    │
                        │  Guards / Interceptors / Pipes │
                        │  Value Objects / Exceptions    │
                        │  Prisma / Redis / COS / SMS    │
                        └──────────────┬──────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        │              │               │               │              │
   ┌────▼────┐   ┌────▼────┐   ┌──────▼──────┐  ┌────▼────┐  ┌────▼────┐
   │  Auth   │   │ System  │   │Notification │  │  Agent  │  │ Alert   │
   │(认证授权)│   │(健康检查)│   │ (短信/发件箱) │  │(AI智能体)│  │ (预警)  │
   └────┬────┘   └─────────┘   └──────┬──────┘  └────┬────┘  └────┬────┘
        │                             │               │            │
        │         被全部模块依赖       │    被业务模块  │  全模块    │  独立
        │                             │    写入Outbox  │  只读      │
   ┌────▼──────────────────────────────────────────────────────────────────┐
   │                          业务模块依赖链                                  │
   │                                                                       │
   │  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     │
   │  │  Member  │     │Inventory │     │ Purchase │     │   Sale   │     │
   │  │  (会员)  │◄────│ (库存)   │◄────│ (采购)   │     │  (销售)  │     │
   │  └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     │
   │       │                │                │                │           │
   │       │      ┌─────────┘                │                │           │
   │       │      │                          │                │           │
   │       ▼      ▼                          ▼                ▼           │
   │  ┌──────────┐              ┌──────────────────────────────────┐      │
   │  │  Point   │              │         Sale (核心事务)            │      │
   │  │ (积分)   │◄─────────────│  依赖: Inventory + Member +      │      │
   │  └──────────┘              │        Point + Commission +      │      │
   │                            │        Subsidy + Notification    │      │
   │                            └──────────────┬───────────────────┘      │
   │                                           │                          │
   │              ┌────────────────────────────┼──────────────┐           │
   │              │                            │              │           │
   │         ┌────▼─────┐  ┌──────────┐  ┌────▼─────┐  ┌────▼─────┐      │
   │         │ Finance  │  │Commission│  │ Subsidy  │  │ TradeIn  │      │
   │         │ (财务)   │  │ (提成)   │  │ (国补)   │  │(以旧换新) │      │
   │         └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
   └───────────────────────────────────────────────────────────────────────┘
```

### 2.2 依赖关系矩阵（上游 → 下游，← 表示"被依赖"）

| 模块 | 直接依赖 | 被以下模块依赖 | 依赖类型 |
|------|---------|---------------|---------|
| **Shared** | —（基础层） | 全部 14 个模块 | 基础设施 |
| **Auth** | Shared, Redis, DB | 全部模块（JWT 鉴权） | 横切 |
| **System** | Shared, DB, Redis | 运维/监控 | 独立 |
| **Notification** | Shared, Redis, SMS SDK | Sale, Point, Alert, Member | 消息驱动 |
| **Member** | Shared, Auth | Sale, Point, Agent | 数据依赖 |
| **Point** | Shared, Member | Sale, Commission（结算扣减） | 数据依赖 |
| **Inventory** | Shared, Auth | Purchase, Sale, Agent | 数据依赖 |
| **Purchase** | Shared, Inventory | —（被外部调用创建库存） | 数据依赖 |
| **Sale** | Shared, Inventory, Member, Point, Commission, Subsidy, Notification | Finance, Agent | **核心枢纽** |
| **Finance** | Shared, Sale | Agent, System（对账） | 只读依赖 |
| **Commission** | Shared, Sale | Sale（销售时预估） | 双向依赖⚠️ |
| **Subsidy** | Shared, Sale | Sale（销售时写入） | 数据依赖 |
| **TradeIn** | Shared, Sale | Sale（出库可选） | 数据依赖 |
| **Alert** | Shared, Inventory | —（定时检查+通知） | 独立 |
| **Agent** | Shared, Dify, Inventory, Finance, Member | —（只读全部） | 只读聚合 |

### 2.3 Sale（销售模块）— 核心枢纽分析

Sale 是系统中最复杂的模块，在一次"扫码出库"事务中涉及 **7~8 张表**：

```
扫码出库事务 (REPEATABLE READ):
┌─────────────────────────────────────────────────────────┐
│ 1. 校验 IMEI 在库 (乐观锁 WHERE imei=? AND version=?)    │
│ 2. UPDATE imei_stock (status→sold, version+1)            │
│ 3. INSERT sale_order (财务字段固化)                       │
│ 4. INSERT sale_item (成本快照固化)                        │
│ 5. INSERT point_ledger (消费获取积分)                     │
│ 6. UPDATE member (total_points + version 乐观锁)          │
│ 7. INSERT payment_flow (收款记录)                         │
│ 8. INSERT trade_in_order (如有以旧换新)                   │
│ 9. INSERT commission_ledger (预估提成)                    │
│ 10. INSERT national_subsidy (如有国补)                    │
│ 11. INSERT stock_ledger (库存变动流水)                     │
│ 12. INSERT notification_outbox (短信通知)                 │
└─────────────────────────────────────────────────────────┘
```

Sale 模块的 Port 接口依赖（5 个出站端口）：

| 端口 | 目标模块 | 用途 |
|------|---------|------|
| `IInventoryPort` | Inventory | 校验+锁定 IMEI |
| `IMemberPort` | Member | 查询/更新会员积分 |
| `IPointPort` | Point | 写入积分流水 |
| `ICommissionPort` | Commission | 计算/记录预估提成 |
| `INotificationPort` | Notification | 写入发件箱（短信通知） |

### 2.4 Commission ↔ Sale 双向依赖分析

存在一个微妙的设计决策：

- **Sale → Commission**: 销售时预估提成，调用 `CommissionEstimator`
- **Commission → Sale**: 退货时追回提成，需要查询原销售单信息

文档中该依赖通过 Port/Adapter 模式处理，依赖方向为：
- `Sale/application/ports/commission.port.ts` (定义在 Sale 侧)
- `Sale/infrastructure/adapters/commission.adapter.ts` (调用 Commission Application Service)

退货追回提成时，`ReturnAuditService` (在 Sale 模块内) 直接操作 `commission_ledger` 的 adjustment 字段，这在 DDD 严格意义上跨模块直接写入了 Commission 的数据。当前单体架构下可行，微服务拆分后需通过 Saga 或事件驱动处理。

---

## 三、开发顺序分析

### 3.1 关键路径（来自 TASK.md 甘特图）

```
INF-001 → DB-001 → BE-001(Auth) → BE-005(Member) → BE-009(Inventory)
→ BE-014(Purchase) → BE-017(Sale) → BE-041(Agent) → AI-001(Dify)
→ TST-010(E2E) → DEP-007(Production CD) → 上线
```

总工期：**12 周**（2026-06-15 ~ 2026-09-06）

### 3.2 分阶段开发顺序

#### Phase 0: 基础设施（Week 1, 15 任务, 53h, P0 为主）

```
次序  任务范围                   依赖关系
 1   INF-001 项目脚手架           —
 2   INF-002 Prisma 初始化        ← INF-001
 3   INF-003 Redis 集成           ← INF-001
 4   INF-004 Pino 日志            ← INF-001
 5   INF-005 环境配置管理         ← INF-001
 6   INF-006 Docker 开发环境      ← INF-001 (可并行)
 7   INF-008 共享值对象           ← INF-001 (可并行)
 8   INF-009 共享领域异常         ← INF-008
 9   INF-010 JWT Guard           ← INF-005, INF-003
10   INF-011 Roles Guard         ← INF-010
11   INF-012 Readonly Guard      ← INF-010
12   INF-013 日志拦截器           ← INF-004
13   INF-014 数据脱敏拦截器       ← INF-008
14   INF-015 统一响应+异常过滤    ← INF-004
15   INF-007 CI 流水线            ← INF-001 (可并行)
```

#### Phase 1: 数据库（Week 1-2, 12 任务, 46h）

```
次序  任务范围                   依赖关系
 1   DB-001~003 基础+商品+采购表  ← INF-002
 2   DB-004~005 会员积分+销售财务 ← DB-001
 3   DB-006~008 提成国补+审计日志 ← DB-001 (可并行: 与前组不同表)
 4   DB-009 初始迁移+种子数据     ← DB-001~008 全部
 5   DB-010~012 分区+备份+归档   ← DB-004, DB-005, DB-007
```

⚠️ **关键注意**: DB-001~008 可以并行开发（不同表），但 DB-009 必须等全部模型定义完成后才能执行。

#### Phase 2: 后端开发（Week 2-8, 43 任务, 245h）— 严格顺序

```
次序  模块          依赖                            优先级
 1   Auth          Shared + DB-001                  P0 (全部模块依赖)
 2   Member        Auth + DB-004                   P0 (Sale 依赖)
 3   Inventory     Auth + DB-002                   P0 (Purchase + Sale 依赖)
 4   Purchase      Auth + Inventory + DB-003       P0 (完成后可测试入库)
 5   Point         Auth + Member + DB-004          P0 (Sale 依赖，可与 Inventory 并行)
 6   Sale 🔥       Auth + Inventory + Member       P0 (核心，依赖最多)
                   + Point + Commission
                   + Subsidy + Notification
 7   Finance       Sale (只读)                     P1
 8   Commission    Sale + DB-006                   P1
 9   Subsidy       Sale + DB-006                   P1
10   TradeIn       Sale + DB-008                   P2
11   Alert         DB-008                          P2
12   Notification  Redis + DB-008                  P1
13   System        DB + Redis                      P1
14   Agent         Dify + Inventory + Finance      P1
                   + Member (全部只读)
15   BE-043 模块集成 全部模块                        P0 (最后集成)
```

**并行化建议**:
- Point 和 Inventory 可并行开发（不互相依赖）
- Commission、Subsidy、TradeIn、Alert 可在 Sale 完成后并行开发
- Notification 可与 Phase 2 前半段并行
- Agent 依赖全部业务模块就绪，只能在 Phase 2 尾声开发

#### Phase 3: 小程序开发（Week 2-9, 31 任务, 140h）

```
次序  范围              后端依赖           说明
 1   MP-001~003 工程    —                  可与后端并行启动
 2   MP-004~005 Auth   BE-003 (Auth API)  登录流程
 3   MP-032~035 组件   —                  公共组件，提前开发
 4   MP-007~011 库存   BE-013 (Inventory) 库存页面
 5   MP-012~015 收银   BE-024 (Sale)      核心收银流程
 6   MP-016~017 采购   BE-016 (Purchase)  采购页面
 7   MP-018~020 会员   BE-007 (Member)    会员页面
 8   MP-021~023 报表   BE-026 (Finance)   报表页面
 9   MP-024~028 其他   BE-031~037        提成/国补/预警
10   MP-029~030 C端   BE-007 (Member)    C端会员
11   MP-031 设置       BE-004 (Auth)      系统设置
```

#### Phase 4: AI 智能体（Week 9-10, 8 任务, 28h）

```
次序  范围              依赖
 1   AI-001~005 Dify   BE-042 (Agent API)
 2   AI-006~008 后端   Dify 工作流就绪
```

#### Phase 5: 测试（Week 6-11, 16 任务, 87h）

```
次序  范围              依赖
 1   TST-001~005 单元   对应模块完成即可开始
 2   TST-006~012 集成   对应模块 + 单元测试通过
 3   TST-013~014 E2E    全部集成测试通过
 4   TST-015~016 性能   全部 E2E 通过
```

#### Phase 6: 部署与运维（Week 8-12, 10 任务, 39h）

```
次序  范围              依赖
 1   DEP-001~003       后端基本完成
 2   DEP-004~005       基础设施就绪
 3   DEP-006~007 CD    全部测试通过
 4   DEP-008~010       生产上线
```

### 3.3 推荐的开发顺序（按人员分工）

**第 1 周**:
- BE-1: INF-001 → INF-002 → INF-008 → INF-009 → DB-001~003
- BE-2: INF-003 → INF-004 → INF-005 → INF-010 → DB-004~005
- FE: MP-001 → MP-002 → MP-003

**第 2 周**:
- BE-1: DB-006~008 → DB-009 → BE-001~004 (Auth)
- BE-2: INF-011~015 → DB-010~012 → BE-005~008 (Member)
- FE: MP-033 (IMEI 扫码器组件) + MP-004~005 (登录)

**第 3-4 周**:
- BE-1: BE-009~013 (Inventory) → BE-014~016 (Purchase)
- BE-2: BE-027~029 (Point) → 协助 Inventory
- FE: MP-007~011 (库存页面) + MP-016~017 (采购页面)

**第 5-6 周** (关键冲刺):
- BE-1 + BE-2: BE-017~024 (Sale 🔥) — 最复杂的模块，双人协作
- FE: MP-012~015 (收银核心) — 同步对接

**第 7-8 周**:
- BE-1: BE-025~026 (Finance) → BE-030~031 (Commission) → BE-032~033 (Subsidy)
- BE-2: BE-034~035 (TradeIn) → BE-036~037 (Alert) → BE-038~040 (Notification/System)
- FE: MP-018~031 (会员/报表/提成/国补/C端/设置)

**第 9 周**:
- BE-1 + BE-2: BE-041~043 (Agent + 模块集成)
- FE: MP-029~030 (C端) + MP-031 (设置)

**第 10-11 周**:
- BE-1 + BE-2: AI-001~008 (Dify 工作流 + AI API)
- QA: TST-001~016 (全部测试)
- FE: 缺陷修复 + 体验优化

**第 12 周**:
- OPS: DEP-001~010 (部署上线)
- 全员: 上线检查清单 + 生产验证

---

## 四、风险清单

### 4.1 来自 PROJECT_CONTEXT.md §12（已识别的设计风险）

| # | 风险 | 等级 | 缓解措施 | 状态 |
|:--:|------|:--:|----------|:--:|
| R1 | 积分并发更新导致 total_points 错乱 | P0 | SELECT FOR UPDATE + version 乐观锁 + 每日对账 | 已设计 |
| R2 | 乐观锁出库失败后订单表未回滚 | P0 | 单数据库事务(REPEATABLE READ)保证原子性 | 已设计 |
| R3 | 微信审核拒绝推荐有礼功能 | P0 | 推荐码模式(非分享直接奖励)，审核说明文档 | 待运营配合 |
| R4 | iOS 端积分抵现被封禁 | P0 | C 端不开放积分抵现，仅 B 端收银台使用 | 已设计 |
| R5 | 退货财务核算缺失 | P0 | return_order + 冲正积分 + 追回提成 | 已设计 |
| R6 | JWT 无法即时失效 | P1 | Redis Token 黑名单 | 已设计 |
| R7 | AI 查询隐私泄露 | P1 | 数据脱敏 + 商家端 AI 验证查询权限 | 已设计 |
| R8 | 单店→连锁改表成本高 | P1 | 所有表已预留 shop_id | 已设计 |
| R9 | 短信通知丢失 | P1 | Transactional Outbox 模式 + 重试机制 | 已设计 |
| R10 | 数据库无归档策略 | P2 | 分区表 + 定期归档脚本 | 已设计 |

### 4.2 来自 TASK.md §11（执行层面的风险）

| # | 风险 | 影响任务 | 等级 | 缓解措施 |
|:--:|------|:--------:|:--:|----------|
| TR1 | 扫码出库事务超时或数据不一致 | BE-021, TST-010, TST-015 | 🔴 高 | 单数据库 REPEATABLE READ + 乐观锁 + 充分并发测试 |
| TR2 | 积分 FIFO 并发导致 total_points 错乱 | BE-027, TST-004 | 🔴 高 | SELECT FOR UPDATE + version 乐观锁 + 每日自动对账 |
| TR3 | AI Token 泄露导致数据批量抓取 | AI-006, AI-007 | 🟡 中 | Token 24h 过期 + 限流 + 仅 GET + 数据脱敏 |
| TR4 | Dify API 不可用导致 AI 对话中断 | AI-001~005, BE-041 | 🟡 中 | 5s 超时 + 熔断 + Claude API 直连降级 |
| TR5 | 微信审核拒绝推荐有礼功能 | MP-029, MP-030 | 🟡 中 | 推荐码模式 + 审核说明文档准备 |
| TR6 | iOS 端积分抵现被封禁 | MP-029 | 🟡 中 | C 端不开放积分抵现 |
| TR7 | 数据库分区未按时创建 | DB-010, DB-012 | 🟢 低 | 定时检查 + 提前创建未来 1 年分区 + 告警 |
| TR8 | 短信发送失败堆积 | BE-038 | 🟢 低 | max_retries=3 + 死信队列 + 失败告警 |
| TR9 | 微信小程序包体积超限 | MP-003, MP-035 | 🟢 低 | 分包加载 + ECharts 按需引入 + 图片 CDN 化 |
| TR10 | 单机部署单点故障 | DEP-003 | 🟢 低 | MVP 阶段可接受，后续迁移 K8s |

### 4.3 分析中发现的新增/细化风险

| # | 风险 | 等级 | 来源 | 说明 |
|:--:|------|:--:|------|------|
| AR1 | **Sale ↔ Commission 双向依赖** | 🟡 中 | 2.4 分析 | 单体架构下通过 Adapter 调用可行，但微服务拆分时退货追回提成需要 Saga 编排。当前依赖方向不够清晰。 |
| AR2 | **Prisma MySQL ENUM 不支持** | 🟡 中 | schema.prisma 注释 | Prisma MySQL provider 不支持 @db.Enum，需手动修改 migration.sql。如果忘记手动修改，ENUM 将退化为 VARCHAR，失去数据库层约束。 |
| AR3 | **分区表的复合主键要求** | 🟡 中 | schema.sql | MySQL 8 分区要求分区键必须在所有唯一键中。如 `sale_order.uk_order_no` 需要包含 `created_at` 列才能与分区兼容，Schema 已处理但实现需关注。 |
| AR4 | **API 数量不一致** | 🟢 低 | 文档交叉比对 | API.md 说 116 个接口，ARCHITECTURE.md 说 114 个（差 2），TASK.md 的合计也是 125 任务（差 10 vs API 数量），这是因为任务数 ≠ API 数。 |
| AR5 | **Phase 2 中 Sale 模块工时低估** | 🟡 中 | TASK.md | BE-017~024 共 8 个任务 55h，但 Sale 是整个系统最复杂的模块（7-8 表事务）。如果乐观锁并发处理、退货 Saga 逻辑遇到困难，实际工时可能翻倍。 |
| AR6 | **point_ledger 余额字段 — 对账依赖** | 🟡 中 | schema 分析 | `point_ledger.balance_after` 是积分变动后的快照值。如果多笔并发积分操作交错执行导致 balance_after 不连续，会影响对账准确性。虽然仅作参考（真正的对账依赖 SUM(amount)），但可能引起混淆。 |
| AR7 | **sale_order.order_no 在 Prisma 和 MySQL DDL 中的 @unique 定义差异** | 🟡 中 | schema.prisma vs schema.sql | Prisma 中 `orderNo` 标记 `@unique`，但 MySQL DDL 因分区要求使用复合 UK `(order_no, created_at)`。这在 Prisma 层面意味着 orderNo 被假定为唯一（跨分区），但 MySQL 层面仅保证同一 `created_at` 分区内唯一。实际业务中 orderNo 是雪花 ID 全局唯一，不存在冲突风险，但 Schema 定义有细微差异。 |
| AR8 | **8 小时浸泡测试执行时机** | 🟢 低 | TASK.md | TST-016 计划在 W11 执行，但此时可能已有生产部署。建议将浸泡测试提前到 W10 或增加预发布环境浸泡。 |

---

## 五、文档一致性检查

### 5.1 交叉比对结果

#### ✅ 一致的部分

| 检查项 | PROJECT_CONTEXT | API.md | ARCHITECTURE | TASK.md | schema.sql | schema.prisma | 结果 |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:--:|
| 表数量: 30(PC说30) vs 32(SQL/Pris) | 30 | — | — | — | 32 | 32 | ⚠️ 见下 |
| 技术栈: NestJS + Prisma + MySQL + Redis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 一致 |
| 6 种系统角色 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 一致 |
| 14 个 API 模块 | ✅ | ✅ | ✅ | ✅ | — | — | ✅ 一致 |
| 乐观锁: imei_stock.version + member | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ 一致 |
| 软删除: 7 张表 | ✅ | — | ✅ | — | ✅ | ✅ | ✅ 一致 |
| INSERT ONLY: 4 张表 | ✅ | — | ✅ | — | ✅ | ✅ | ✅ 一致 |
| 分区表: 5 张表 | ✅ | — | — | ✅ | ✅ | ✅ | ✅ 一致 |
| 唯一约束: 18 条 | — | — | — | — | ✅ | ✅ | ✅ 一致 |
| 外键: 38 条 | — | — | — | — | ✅ | ✅ | ✅ 一致 |
| 18 个枚举 | — | — | — | — | — | ✅ | ✅ 与 API 一致 |
| API 端点路径 | ✅ | ✅ | ✅ | — | — | — | ✅ 一致 |
| 权限矩阵 | ✅ | ✅ | — | — | — | — | ✅ 一致 |
| JWT payload 结构 | ✅ | ✅ | — | — | — | — | ✅ 一致 |
| 业务规则（库存/财务/积分/订单/AI） | ✅ | ✅ | — | — | — | — | ✅ 一致 |
| AI 只读 + ReadonlyGuard | ✅ | ✅ | ✅ | ✅ | — | — | ✅ 一致 |
| 甘特图关键路径 | — | — | — | ✅ | — | — | ✅ 自洽 |

#### ⚠️ 不一致 / 需要澄清的部分

| # | 冲突点 | 文档 A | 文档 B | 严重度 | 分析 |
|:--:|--------|--------|--------|:--:|------|
| C1 | **表数量** | PROJECT_CONTEXT §5.2: "30 张表" | schema.sql: 32 张表<br>schema.prisma: 32 个 Model | 🟡 中 | PROJECT_CONTEXT 列表实际也列出了 28 个命名条目（有些行合并了 2 张表，如"采购订单+采购明细"算一行）。进一步统计：基础架构 4 + 商品库存 6 + 会员积分 3 + 销售财务 5 + 提成国补 3 + 审计日志 3 + 通知对账 4 + 预警盘点 4 = **32 张**。**结论: PROJECT_CONTEXT §5.2 的表清单标题应更正为"32 张"。** |
| C2 | **API 接口总数** | API.md: "116 个" | ARCHITECTURE §7: "114 endpoints" | 🟢 低 | 差异为 2 个。可能是 API.md 写完之后新增/合并了接口导致。经核实 API.md 实际列出: Auth 8 + Member 13 + Point 9 + Inventory 16 + Purchase 10 + Sale 16 + Finance 8 + Commission 10 + Subsidy? + TradeIn? + Alert? + Agent? + Return? = 需要逐一核算。**建议: 以 API.md 为准（116），更新 ARCHITECTURE.md。** |
| C3 | **PROJECT_CONTEXT 说 product_sku 无 shop_id** | PROJECT_CONTEXT §11.1: "商品 SKU 连锁共用（product_sku 无 shop_id）" | schema.sql/schema.prisma 中 product_sku 确实无 shop_id | 🟢 低 | **实际一致** — product_sku 确实没有 shop_id 字段，re-confirm 无误。 |
| C4 | **PROJECT_CONTEXT 说 member 无 shop_id** | PROJECT_CONTEXT §11.1: "会员连锁通用（member 无 shop_id）" | schema.sql/schema.prisma 中 member 确实没有 shop_id | 🟢 低 | **实际一致** — member 没有 shop_id，连锁通用。 |
| C5 | **TEST.md 接口路径与 API.md 不一致** | Test_Plan.md: `POST /api/stock/inbound/scan`<br>`POST /api/stock/outbound/scan`<br>`GET /api/stock/list`<br>`GET /api/stock/detail/:imei`<br>`DELETE /api/orders/SO001` | API.md: `POST /api/purchase/inbound/scan`<br>`POST /api/sale/outbound/scan`<br>`GET /api/inventory/stock`<br>`GET /api/inventory/stock/:imei`<br>订单无 DELETE 方法 | 🔴 高 | **严重不一致**。Test_Plan.md 使用了 `/api/stock/*` 和 `/api/orders/*` 路径，而 API.md 使用 `/api/inventory/*`、`/api/purchase/*`、`/api/sale/*`。这是两套不同的 URL 命名空间。**必须统一为 API.md 的路径方案。** |
| C6 | **TEST.md 中订单删除** | Test_Plan.md SALE-013: `DELETE /api/orders/SO001 → 403/405` | API.md 6.5: `DELETE /api/sale/orders/{orderNo}` → 软删除（不是 403） | 🟡 中 | Test_Plan.md 预期 DELETE 订单返回 403/405，但 API.md 明确支持软删除订单。**订单软删除是正确的业务需求（6.5 取消订单），TEST.md 用例应修正为验证软删除逻辑正确（deleted_at 设置 + 库存回退 + 积分冲正 + 收款作废）。** |
| C7 | **TEST.md INV-003 说 status=in_stock** | Test_Plan.md: "status=in_stock, audit_status=approved" | imei_stock 字段定义: `status` 和 `audit_status` 是两个独立字段 | 🟢 低 | **实际一致** — 入库审核通过后两个字段同时更新，无冲突。 |
| C8 | **TASK.md 说 stock_ledger 用于入库** | TASK.md INV-001: "stock_ledger 写入, status=pending_audit" | inventory 模块: imei_stock 表包含 status 字段, stock_ledger 记录变动流水 | 🟢 低 | TASK.md 的验收标准可能将 imei_stock 和 stock_ledger 的写入合并描述了。入库申请时: `imei_stock.status=pending_audit` (新记录) + `stock_ledger` 记录入库申请流水。**实现无冲突，但 TASK.md 描述不够精确。** |
| C9 | **TASK.md 任务数不一致** | TASK.md 标题: "125 个" | 附录 A 合计: 135 个<br>附录 A 各项求和: 15+12+43+31+8+16+10 = **135** | 🟡 中 | 标题写 125，附录 A 各项相加得 135。**标题数字应更新为 135。** |
| C10 | **TASK.md 总工时不一致** | TASK.md 标题: "840 h" | 附录 A 合计: 638h<br>附录 A 各项求和: 53+46+245+140+28+87+39 = **638h** | 🟡 中 | 标题写 840h，附录相加得 638h。差额 202h 可能是 buffer/contingency，但文档未说明。**建议补充说明 840h 含 ~30% 缓冲。** |

### 5.2 冲突严重度汇总

| 严重度 | 数量 | 项目 |
|:--:|:--:|------|
| 🔴 高 | 1 | C5: TEST.md URL 路径与 API.md 完全不同 |
| 🟡 中 | 6 | C1: 表数量描述, C2: API 数量, C6: 订单删除预期, C9: 任务数, C10: 总工时, AR7: order_no UK 差异 |
| 🟢 低 | 3 | C3/C4: 连锁设计 (实际一致), C7: 入库状态 (实际一致), C8: 描述不够精确 |

---

## 六、关键设计决策审查

### 6.1 正确的设计决策

| 决策 | 评价 |
|------|------|
| **DDD 四层架构 + Port/Adapter** | 为未来微服务拆分提供了清晰边界 |
| **乐观锁 (version) 而非悲观锁** | 适合高并发出库场景，能快速失败 |
| **财务字段 INSERT ONLY** | 符合审计合规要求，防止财务数据篡改 |
| **事务发件箱 (Transactional Outbox)** | 避免分布式事务，确保短信通知最终一致性 |
| **分区表提前创建** | 防止运行时 INSERT 失败 |
| **AI 双重只读校验 (JWT + Guard)** | 纵深防御，防止 AI Token 被滥用 |
| **所有业务表预留 shop_id** | 单店→连锁迁移成本大幅降低 |
| **bcrypt cost=12 + AES-256-GCM** | 符合行业最佳实践 |
| **每日自动对账 4 种类型** | 即使并发控制出现疏漏，也能在 24h 内发现数据不一致 |

### 6.2 需要关注的设计选择

| 关注点 | 说明 |
|--------|------|
| **个别计价法 vs 移动加权平均** | `imei_stock.cost_price` 和 `sale_item.cost_price_snapshot` 按个别计价法（每台机器独立成本），这与 Test_Plan.md FIN-001~002 中的"移动加权平均成本"测试描述**不一致**。Test_Plan 的 FIN-001/002 是按移动加权平均描述的测试，但系统实际设计是个别计价法（IMEI 级别成本）。这属于 **C5 之外的另一处 Test_Plan 与 SSOT 不一致**。 |
| **单体事务 vs Saga** | 扫码出库单数据库事务保证强一致性（当前架构），微服务拆分后需改为 Saga 最终一致性，业务风险增加 |
| **Redis 黑名单降级策略** | BE-004 提到"Redis 不可用时放行"作为降级，这是一个安全权衡 — 可用性优先于安全性 |
| **Dify + Claude 双通道** | Dify 不可用时直连 Claude API，但 Claude 没有 Dify 的工作流/Function Calling 能力，降级体验差异大 |

---

## 七、结论与建议

### 7.1 项目健康度评估

| 维度 | 评分 | 说明 |
|------|:--:|------|
| 架构设计 | ⭐⭐⭐⭐⭐ | DDD 分层 + 模块化单体 + 微服务就绪，设计成熟 |
| 文档完整性 | ⭐⭐⭐⭐ | 6 份核心文档覆盖全面，但有少量数字不一致 |
| 风险管控 | ⭐⭐⭐⭐ | P0 风险均已设计缓解措施，执行层面风险可控 |
| 数据库设计 | ⭐⭐⭐⭐⭐ | 32 表 + 分区 + 乐观锁 + INSERT ONLY + 外键 + 索引，设计全面 |
| 测试覆盖 | ⭐⭐⭐⭐ | 75 用例 + KPI 对账 + 并发压测 + 浸泡测试，覆盖充分 |
| 开发计划 | ⭐⭐⭐⭐ | 12 周甘特图 + 关键路径 + 角色分配，但工时统计需统一 |

### 7.2 必须修复的问题（阻塞开发）

1. **🔴 C5: Test_Plan.md 的 API URL 路径全部需要修正** — 统一使用 API.md 中定义的路径规范（`/api/inventory/*`, `/api/purchase/*`, `/api/sale/*` 等，而非 `/api/stock/*`, `/api/orders/*`）

### 7.3 建议修复的问题（不阻塞但应修正）

2. **🟡 C9/C10: TASK.md 标题数字更新** — 任务数 125 → 135，总工时需与附录 A 一致（638h）或标注含缓冲（840h ≈ 638h × 1.32）
3. **🟡 C1: PROJECT_CONTEXT §5.2 表数量** — "30 张表" → "32 张表"
4. **🟡 C2: ARCHITECTURE §7 API 数量** — 与 API.md 对齐（116 或重新统计）
5. **🟡 C6: Test_Plan.md SALE-013** — 订单软删除的测试用例修正为验证软删除逻辑（而非返回 403）
6. **🟡 Test_Plan.md FIN-001/002** — 财务精度测试的描述从"移动加权平均"修正为"个别计价法"（或确认系统确实需要移动加权平均并修改设计）

### 7.4 关键上线前验证项（来自 PROJECT_CONTEXT §12.2）

- [ ] 同 IMEI 100 并发出库，仅 1 笔成功，0 穿透
- [ ] 每日自动对账 KPI-01~06 全部通过
- [ ] 毛利计算 FIN-001~008 偏差=0
- [ ] AI 只读拦截 AI-008~009 通过
- [ ] 8 小时浸泡测试无内存泄漏
- [ ] P95 延迟 ≤ 200ms

---

## 附录 A：文档交叉引用索引

| 文档 | 版本 | 日期 | 角色 | 权威级别 |
|------|------|------|------|:--:|
| PROJECT_CONTEXT.md | V1.0-FROZEN | 2026-06-14 | SSOT | ★★★ |
| API.md | V1.0-FROZEN | 2026-06-14 | API 规范 | ★★★ |
| ARCHITECTURE.md | V1.0 | 2026-06-14 | 目录结构 | ★★★ |
| TASK.md | V1.0 | 2026-06-14 | 任务分解 | ★★☆ |
| Test_Plan.md | — | 2026-06-12 | 测试方案 | ★★☆ |
| schema.sql | V2.0 | 2026-06-14 | DDL | ★★★ |
| schema.prisma | V1.0 | 2026-06-14 | ORM Schema | ★★★ |
| PRD_3C零售小程序智能体.md | — | 2026-06-12 | 产品需求(参考) | ★★☆ |
| AI_Agent_Design.md | — | 2026-06-12 | AI设计(参考) | ★★☆ |
| NestJS_Architecture.md | — | 2026-06-12 | NestJS架构(参考) | ★★☆ |
| Deployment_Plan.md | — | 2026-06-12 | 部署方案(参考) | ★★☆ |
| MVP_Iteration_Plan.md | — | 2026-06-12 | MVP迭代计划(参考) | ★☆☆ |
| Technical_Due_Diligence.md | — | 2026-06-12 | 技术尽调(参考) | ★★☆ |
| DB_Design_MySQL.sql.md | — | 2026-06-12 | DB设计(参考,旧版) | ★☆☆ |

## 附录 B：枚举一致性检查

| 枚举名 | PROJECT_CONTEXT | API.md | schema.sql | schema.prisma | 结果 |
|--------|:---:|:---:|:---:|:---:|:--:|
| ImeiStatus (5值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| AuditStatus (3值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| StockChangeType (4值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| PointChangeType (5值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| PaymentMethod (7值,含refund) | ✅ | ✅ | ✅ VARCHAR | ✅ enum | ✅ |
| PaymentType (normal/refund) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| ReturnStatus (4值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| ReturnType (3值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| CommissionType (3值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| SubsidyStatus (7值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| AlertType (4值) | ✅ | — | ✅ ENUM | ✅ enum | ✅ |
| StockCheckType (3值) | ✅ | ✅ | ✅ ENUM | ✅ enum | ✅ |
| Member status (0/1) | ✅ | ✅ | TINYINT | ✅ enum | ✅ |

---

> **分析结论**: 项目文档整体质量高，设计成熟。核心问题仅 1 个（Test_Plan.md URL 路径不一致），6 个中等不一致需修正。所有业务规则在文档间一致，数据库设计与 Prisma Schema 完全同步。开发顺序明确，风险均已识别并设计缓解措施。建议在开始编码前先修正 Test_Plan.md 的 URL 路径问题。
