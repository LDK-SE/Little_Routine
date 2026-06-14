# 技术尽调审查报告

## 3C 数码零售系统

| 审查维度 | 发现问题数 | P0 | P1 | P2 |
|---------|:--:|:--:|:--:|:--:|
| 一、架构风险 | 4 | 1 | 2 | 1 |
| 二、数据库风险 | 5 | 2 | 1 | 2 |
| 三、并发风险 | 3 | 1 | 1 | 1 |
| 四、财务风险 | 6 | 3 | 2 | 1 |
| 五、权限风险 | 4 | 2 | 1 | 1 |
| 六、数据一致性风险 | 3 | 1 | 2 | 0 |
| 七、小程序审核风险 | 4 | 1 | 2 | 1 |
| 八、后期扩展风险 | 4 | 0 | 2 | 2 |
| **合计** | **33** | **11** | **13** | **9** |

---

## 一、架构风险

### P0-01 出库核心事务缺少补偿机制

**问题：** 出库事务流程为 `乐观锁出库 → 订单固化 → 积分写入 → 短信异步通知`。PRD 和架构设计中，前三个操作通过 TypeORM QueryRunner 单事务保证原子性。但隐患在于：如果事务提交成功后短信队列投递失败，或 BullMQ 消费者处理失败，**用户收不到消费通知**，且没有显式的重试/补偿设计。PRD 中异常场景（E-06 "付款成功但订单失败"）已识别，但缺少对应的补偿 Job 代码设计。

**整改：**
```
1. sms_log 记录每条通知的状态（已有）和重试次数（缺）
2. 增加 Cron Job：每 5 分钟扫描 sms_log WHERE status='failed' AND retries<3
3. 超过 3 次重试仍失败 → 企微告警 → 人工介入
```

### P0-02 NestJS replicas=2 但无分布式 Session/Cache 方案

**问题：** docker-compose.yml 中 NestJS 配置 `replicas: 2`，但 JWT 策略默认是无状态的，Redis 仅作为消息队列使用。当前设计没有说明两副本间的 Session 如何处理。如果使用内存缓存（如 Node.js 的 Map），两个 Pod 数据不同步。

**影响范围：** 库存热点缓存（架构中提到了 `cache.service.ts`）、API 限流计数器、验证码存储。

**整改：**
```
1. 所有缓存操作统一走 Redis，禁止 Node 内存缓存（除非是请求级生命周期）
2. JWT Token 保持无状态（不存 Redis），但 refresh token 必须存 Redis
3. 新增 Redis 集群或 Sentinel 配置副本（当前只有单节点 Redis）
```

### P1-01 Dify 平台单点故障

**问题：** AI 对话链路强依赖 Dify 平台。如果 Dify 实例宕机或 API 限流，小程序 AI 入口直接不可用。当前架构没有 Dify 的降级开关。

**整改：**
```
1. 前端增加 AI 入口的状态检测：启动时 GET /api/ai/health（新增接口，探测 Dify 连通性）
2. Dify 不可用时前端展示"AI 暂时不可用，请使用手动查询"
3. 后端 setTimeout(5000) 超时后直接返回兜底文案，不走 Dify
```

### P1-02 缺少 API 版本化策略

**问题：** 所有 API 路径为 `/api/xxx`，没有版本前缀（如 `/api/v1/xxx`）。后续小程序审核周期长（1-7天），一旦后端接口 breaking change，老版本小程序直接不可用。

**整改：**
```
1. 立刻将 API 路径改为 /api/v1/xxx（对现有影响可控）
2. 后续 breaking change 时新增 /api/v2/xxx，逐步废弃 v1
3. GET /api/health 返回 supported_versions: ["v1", "v2"]
```

### P2-01 NestJS 模块间循环依赖未显式声明

**问题：** 架构图中 Sale 模块依赖 Inventory（查库存）、Member（查会员）、Point（写入积分）。如果 Inventory 的某个查询反过来依赖 Sale 的统计接口（如"某 SKU 累计销量"），会形成循环依赖。NestJS 虽然支持 `forwardRef()` 解决，但架构文档中没有明确标注。

**整改：** 在架构文档中增加模块依赖方向声明文件 `DEPENDENCY.md`，标注"只允许单向依赖"。

---

## 二、数据库风险

### P0-03 手机号明文存储

**问题：** `member.phone`、`sys_user.phone`、`sms_log.phone` 均以明文 VARCHAR(11) 存储。这违反：
- 《个人信息保护法》第 51 条：个人信息处理者应当采取加密等安全措施
- 《数据安全法》第 27 条
- 微信小程序《服务端接口调用凭证》安全要求

一旦数据库泄露，所有会员手机号裸奔。

**整改：**
```
1. phone 字段存储 AES-256-CBC 加密后的值
2. 查询时使用 HASH(phone) 做索引匹配：新增 phone_hash CHAR(64) 列，建立 UNIQUE INDEX
3. 注册/登录流程：前端传明文 → 后端立即 HASH → 查 phone_hash → 匹配后解密显示
4. sms_log.phone 保留加密存储（发送短信时解密）
5. 导出 Excel 时 phone 列自动脱敏为 138****5678
```

### P0-04 payment_flow 的 order_no 使用 VARCHAR 无外键约束

**问题：** `payment_flow.order_no` 设计为 `VARCHAR(30)`，没有对 `sales_order.order_no` 的外键约束。设计文档理由可能是"先有收款后有订单"（异常场景 E-06），但这导致：收款流水可以写入不存在的订单号而不报错，日终对账才能发现差异。

**整改（二选一）：**
```
方案A（推荐）：payment_flow.order_no 添加外键，允许先收款时 order_no 为 NULL
  → 新增 payment_flow.status='pending' + order_no=NULL
  → 订单生成后 UPDATE payment_flow SET order_no=xxx WHERE payment_no=xxx

方案B（兼容当前）：保留无外键，但在 payment_flow 插入时加应用层校验
  → 若 order_no 不为空，必须先 SELECT 确认 sales_order 存在
```

### P1-03 sales_order.cost_price_snapshot 无校验和字段

**问题：** 设计文档提到"定时任务对 cost_price_snapshot 做 hash 校验，发现变更即告警"，但 sales_order 表中没有 `cost_checksum` 或 `data_hash` 字段存储生成时的快照 hash。依赖定时任务全表扫描计算 hash 效率极低。

**整改：**
```
ALTER TABLE sales_order ADD COLUMN data_hash CHAR(64) NOT NULL COMMENT
  'SHA256(imei|sale_price|cost_price_snapshot|gross_profit|commission|created_at)';

-- 写入时计算
INSERT INTO sales_order (..., data_hash) VALUES (..., SHA256(CONCAT(imei,'|',sale_price,'|',...)));

-- 校验时直接比对
SELECT * FROM sales_order WHERE data_hash != SHA256(CONCAT(...));
```

### P2-02 库存对账缺乏对账锁

**问题：** `daily_reconcile` 表用了 `uk_date_type` 唯一约束保证同类型每天只对一次，但没有考虑对账执行中的**重复触发**场景（如手动触发 + 定时任务同时运行）。唯一约束只能保证不重复写入，不能保证不重复执行。

**整改：** 在对账逻辑开始时获取分布式锁（Redis SETNX `reconcile:stock:2026-06-12` 1800s），获取失败则跳过。

### P2-03 DECIMAL(10,2) 对总金额汇总可能溢出

**问题：** 所有金额字段使用 `DECIMAL(10,2)`，最大值 99,999,999.99。单笔销售足够，但如果按年汇总（10000 笔销售 × 均价 8000 = 8000 万），或加上国补收入按门店汇总仍在范围内。**真正的风险在于**：`SELECT SUM(gross_profit)` 的结果在 MySQL 驱动（Node.js TypeORM）中可能返回超出 JavaScript `Number.MAX_SAFE_INTEGER`（9,007,199,254,740,991）的字符串，如果不处理会精度丢失。

**整改：** 汇总查询接口使用 `SELECT CAST(SUM(gross_profit) AS CHAR)` 返回字符串，应用层使用 `BigDecimal.js` 或直接以 string 传递到前端展示。

---

## 三、并发风险

### P0-05 乐观锁 ABA 问题

**问题：** 出库乐观锁使用 `WHERE version = currentVersion` + `SET version = version + 1`。这是标准的 CAS 实现，**不会出现 ABA**（因为 version 只增不减）。但如果出现退货回库场景（M3 迭代中），`status` 从 `sold → returned → in_stock` 时，version 需要重置还是继续递增？当前设计文档未明确。

**真正风险：** 退货回库时如果 `version` 重置为 0，同一 IMEI 两次出库（第一次售出→退货→第二次售出）实际上会存在两个 sales_order 记录，但 version 机制无法识别这个差异。

**整改：**
```
1. version 字段永不重置，只递增（包括退货回库）
2. 退货回库时，生成新的 stock_ledger 行（imei 解除 UNIQUE 约束，改为 UNIQUE(imei, status) 或仅应用层保证不重复）
3. 或者：保持一行，version 持续递增，增加 lifecycle_version 标记当前生命周期代数
```

### P1-04 雪花算法时钟回拨

**问题：** 设计文档中订单号使用雪花算法。NestJS 部署在两台容器上，如果宿主机时钟不同步，可能产生相同的 workerId + 时间戳 → 重复订单号。虽然 `uk_order_no` 唯一约束兜底，但会导致事务失败。

**整改：**
```
1. 使用 npm 包 @nutso/tsid（用随机数替代 WorkerID，消除时钟依赖）
2. 或者：order_no 生成失败时自动重试 1 次（递增 sequence）
3. Docker Compose 增加宿主机 NTP 同步检查：timedatectl show --property=NTPSynchronized
```

### P2-04 Redis 单节点无高可用

**问题：** Redis 当前为单节点部署。Redis 宕机将导致：BullMQ 队列停滞（短信无法发送）、验证码缓存丢失（用户需重新获取）。系统核心写链路（出库）不依赖 Redis 所以主业务不受影响，但运营体验降级。

**整改：** 后续迭代部署 Redis Sentinel（至少 3 节点），或使用云服务商 Redis 托管版。

---

## 四、财务风险

### P0-06 销售员可自己修改售价——严重舞弊风险

**问题：** 权限矩阵中，销售员同时拥有"扫码出库"和"售价修改"权限。这意味着销售人员可以：
- 将售价改为成本价甚至更低 → 门店亏本
- 与顾客串通 → 低于正常价格出售后拿回扣
- 先出库后再以"录入错误"为借口请求老板修改（虽然设计说不允许改，但操作上可以重出一单）

PRD 异常场景 E-09 已识别"售价低于成本"，但仅做了"前端警告二次确认"，后端没有硬阻止。

**整改：**
```
1. 售价修改权和出库权必须分离：销售员只能填售价，不能低于系统建议零售价的 XX%，低于部分需老板扫码/密码审批
2. 增加 min_sale_price 字段：在 product_sku 表中，后端出库时如果 sale_price < min_sale_price → 返回 422
3. 增加 price_override_log 表：记录每次售价低于建议价的审批链
```

### P0-07 国补核销无合规审计链

**问题：** 国补（政府补贴）是中国政府专项资金，依法需要：
- 国补申领凭证（补贴批次号、政策文件编号）
- 消费者身份核验记录（身份证号、签名）
- 串码与补贴金额的一一对应台账
- 审计日志不可删除

当前设计中 `sales_order.subsidy_income` 就是一个普通 DECIMAL 字段，没有任何合规附属信息。

**整改：**
```
CREATE TABLE subsidy_record (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(30) NOT NULL,
  policy_batch_no VARCHAR(50) NOT NULL COMMENT '补贴政策批次号',
  subsidy_type ENUM('national','provincial','municipal','trade_in') NOT NULL,
  subsidy_rate DECIMAL(5,4) COMMENT '补贴比例',
  subsidy_amount DECIMAL(10,2) NOT NULL,
  consumer_id_card_hash CHAR(64) COMMENT '消费者身份证号哈希',
  consumer_signature_url VARCHAR(200) COMMENT '消费者签名图片URL',
  audit_status ENUM('pending','submitted','approved','rejected') NOT NULL,
  audit_by BIGINT COMMENT '审核人',
  audit_at DATETIME,
  created_at DATETIME
);
```

### P0-08 积分余额可兑换现金 = 可能触发支付牌照

**问题：** PRD 明确"100 积分 = 1 元"在收银台直接抵扣。根据中国人民银行《非银行支付机构条例》，如果积分可以兑换人民币并在收银环节直接扣减金额，可能被认定为"预付卡"或"支付业务"。虽然单店零售体量小，但这是法律红线。

**整改（立即咨询法务）：**
```
1. 积分抵现必须有明确的上限限制（如单笔最多抵扣订单金额的 10%）
2. 积分不可提现、不可转让（在用户协议中明确）
3. 积分称为"会员权益回馈"而非"等值现金"
4. 建议：积分兑换改为"满减优惠券"形式（如 1000 分兑换 10 元优惠券），规避预付卡监管
```

### P1-05 花呗/微信支付手续费未计入毛利

**问题：** 花呗收款费率 0.8%，微信商业收款费率 0.38%-0.6%。当前系统毛利公式为 `售价+国补-成本-提成`，**没有扣减支付手续费**。如果全店花呗收款占比高，实际到账金额与系统毛利会有显著偏差。

**整改：**
```
1. payment_flow 增加 fee_rate、fee_amount 字段
2. 毛利公式修正为：sale_price + subsidy_income - cost_price_snapshot - commission - SUM(payment_flow.fee_amount)
3. 或者单独出 "净利率报表" 而不修改现有毛利字段
```

### P1-06 提成计算无异议处理流程

**问题：** 提成在销售单生成瞬间固化。但如果出现退货（M3 迭代），已固化的提成如何扣回？如果两个销售员同时参与一笔销售（一人介绍、一人开单），提成如何分配？当前架构完全没有这些场景。

**整改：**
```
1. sales_order 增加 commission_status 字段：pending / confirmed / clawed_back
2. 退货时，如果是当月的，直接扣减 cash_flow；跨月的，从下月提成中扣回
3. 提成分配支持双人模式：sales_order 增加 assistant_salesperson_id + assistant_commission
```

### P2-05 移动加权平均成本没有结转批次隔离

**问题：** 当前移动加权平均成本对所有同 SKU 的在库机器统一计算。但如果不同批次进货价差异巨大（如提前囤货 5000 vs 行情上涨后 5500），所有同 SKU 的 cost 被混合平均，无法做批次级别的毛利分析。

**整改：** 这属于精细化运营需求（P2），但在 M3 迭代方案中已提出"批次成本分析视图"可部分解决。

---

## 五、权限风险

### P0-09 仓管主管可同时入库+审核——职权未分离

**问题：** 权限矩阵中仓管主管同时拥有"入库申请"和"入库审核"权限。这意味着同一个人可以自己创建入库单自己审核通过，如果与供应商串通，可以入库虚假串码或虚高进货价。

**整改：**
```
1. 入库审核必须由 owner 角色执行（去掉 warehouse_supervisor 的审核权）
2. 或者：增加"审核人 ≠ 入库申请人"的后端校验
3. audit_log 已记录了 operator_id，增加 SQL 检测：
   SELECT * FROM audit_log al
   JOIN stock_ledger sl ON al.imei = sl.imei
   WHERE al.action = 'inbound_approve' AND al.operator_id = (
     SELECT operator_id FROM audit_log WHERE imei = sl.imei AND action = 'inbound_apply'
   )
```

### P0-10 AI 只读依赖 JWT Token 的 access_level 字段——可以被伪造

**问题：** AI 只读机制依赖 JWT payload 中的 `access_level: "ai_readonly"` 字段，通过 `ReadonlyGuard` 解析后拦截非 GET 请求。但：
1. `access_level` 不是 JWT 标准字段，NestJS Guard 靠读取 payload 做判断
2. 假设攻击者拿到了正常的 owner JWT Token（通过 XSS 或社工），他可以用 owner token 直接调 AI 接口，而 **ReadonlyGuard 在非 AI token 时不拦截任何请求**
3. AI 对话接口本身不产生写操作，所以威胁不大——真正的风险是如果有人通过 AI 对话间接获取敏感数据（如查出竞争对手的销售数据）

**整改：**
```
1. AI 接口的后端 Service 层强制只使用 ai_readonly_token 访问数据库
2. AI 接口返回的数据在 Service 层做脱敏再输出（手机号/IMEI 脱敏、成本不返回）
3. 当前设计中 Agent 模块有独立的 agent-query.repository，确保这个仓储只有 SELECT 权限的数据库连接
```

### P1-07 会员端无身份校验——可越权查看他人数据

**问题：** `GET /api/members/:id` 权限标注为"会员本人/老板/销售员"。在会员端小程序中，如果会员 A 登录后手动将 URL 改为 `/api/members/999`（会员 B 的 ID），后端如何判断当前 token 的会员是否有权查看？权限矩阵中说"仅自己"，但 Controller 代码中没有看到会员维度的数据权限检查。

**整改：**
```
1. 在 Guard 层或 Service 层增加数据权限校验：
   if (token.role === 'member' && token.sub !== id) {
     throw new ForbiddenException('无权查看其他会员信息');
   }
2. 或者：会员端不暴露 /api/members/:id 接口，统一用 /api/members/me（从 token 中获取 memberId）
```

### P2-06 前端不做权限判断

**问题：** PRD 权限原则明确"网页端不做权限判断，仅做 UI 显隐控制"。这在技术层面是正确的。但微信小程序的代码包可以被反编译，攻击者可以轻松看到所有 API 路径和参数结构，绕过前端 UI 限制直接调后端接口。虽然后端 Guard 会拦截，但这意味着：**恶意用户会不断试错 API 路径，增加后端告警噪音**。

**整改：** 后端对所有 403 响应做 rate limit + 异常检测（同一 IP/Token 在 1 分钟内超过 10 次 403 → 临时封禁 15 分钟）。

---

## 六、数据一致性风险

### P0-11 member.total_points 与 SUM(point_ledger.amount) 在无事务隔离时不一致

**问题：** 设计文档提到每日对账检查差异。但如果在高并发下，一个会员同时：
- 消费得积分（A 请求）
- 使用积分抵现（B 请求）
两个请求都先 `SELECT total_points` 再去 `UPDATE`，会导致**更新丢失**。member.total_points 的更新需要加悲观锁（`SELECT ... FOR UPDATE`）或改为 `UPDATE member SET total_points = total_points + ? WHERE id = ?` 原子更新。

**整改：**
```
1. 积分变动操作必须在一个事务内执行：
   BEGIN;
   SELECT total_points FROM member WHERE id = ? FOR UPDATE;  -- 悲观锁
   INSERT INTO point_ledger ...;
   UPDATE member SET total_points = total_points + ? WHERE id = ?;
   COMMIT;
2. 或者使用原子 UPDATE：UPDATE member SET total_points = total_points + amount WHERE id = ? AND total_points + amount >= 0
   （第二个条件防止扣成负数）
```

### P1-08 短信异步通知与事务提交不一致

**问题：** 出库流程中，"事务提交 → 短信异步通知"之间存在间隙。如果事务提交但系统在发送短信前崩溃，用户收不到通知。但数据和积分已写入——这属于日志告警可接受的场景，但需要有检测机制。

**整改：** 增加 Cron Job：每分钟扫描 sales_order WHERE created_at > NOW() - INTERVAL 5 MINUTE AND sms_log 无对应记录 → 补发短信。

### P1-09 stock_ledger 与 sales_order 的 imei 外键有 ON DELETE RESTRICT

**问题：** `sales_order` 的 `fk_order_imei` 外键使用了 `ON DELETE RESTRICT`。这意味着如果错误地尝试从 stock_ledger 中 DELETE 一行已售出的记录，会因为 sales_order 引用而失败——这是好事。**但这也意味着**：如果需要清理测试数据，必须按 `sales_order → payment_flow → stock_ledger` 的顺序删除。如果在生产环境误操作执行了 `DELETE FROM stock_ledger WHERE status='in_stock'`（删除了在库但未售出的记录），没有外键保护。

**整改：** 生产环境应用账号撤销 DELETE 权限，所有"删除"操作走软删除（status 字段设为 deleted）。

---

## 七、微信小程序审核风险

### P0-12 缺少用户服务协议与隐私政策

**问题：** 微信小程序审核要求：收集用户手机号、地址等个人信息时，必须有弹窗展示《用户服务协议》和《隐私政策》并获得用户明示同意。当前设计文档没有任何关于合规文案的规划。

此外，会员注册时收集"车号"（license_plate），审核员可能会质疑：**3C 零售为什么要收集车号？** 如果无法给出合理的业务原因，审核会被拒。

**整改：**
```
1. 小程序增加"用户协议与隐私政策"页面
2. 注册页增加 checkbox：'我已阅读并同意《用户服务协议》和《隐私政策》'
3. license_plate 字段改为选填，并在业务说明中备注用途（如"方便到店顾客停车指引/上门配送"）
4. 所有个人信息收集点增加用途说明文案
```

### P1-10 AI 对话内容无审核——可能被暂停"社交/社区"类目

**问题：** 微信小程序审核会对包含"用户生成内容（UGC）"功能的小程序要求增加"社交-社区"类目。AI 对话属于 UGC（用户输入内容），如果被判定为社交功能，需要额外资质（《增值电信业务经营许可证》）。3C 零售门店通常没有这个资质。

**整改：**
```
1. AI 对话页面增加固定开场白和快捷指令（减少自由输入场景）
2. 后端/小程序对用户输入做敏感词过滤（政治、色情、暴力）
3. AI 对话页面底部增加"本对话由 AI 自动生成，仅供参考"
4. 如果审核被拒，准备 Plan B：移除自由输入，改为"点击快捷问题"方式
```

### P1-11 换购专区的商品展示需《电信业务经营许可证》

**问题：** 积分换购专区本质是"在线兑换实物商品"，如果换购的商品需要快递配送，则属于"电商"范畴。可能需要增值电信业务经营许可证（ICP 证）或 EDI 证。

**整改：**
```
1. 换购商品限定为"到店领取"，不在线发货
2. 或者：跳转到微信小店/视频号小店完成换购流程（借壳合规）
```

### P2-07 小程序类目选择策略缺失

**问题：** 设计文档完全没有提到小程序应该选择哪个"服务类目"。3C 数码零售可选类目："商家自营 > 3C 数码"（需要营业执照 + 品牌授权书），或者"IT科技 > 软件服务提供商"（需要软著）。错误的类目选择会导致审核直接被拒。

**整改：** 注册小程序时选择"商家自营 > 3C 数码"，并提前准备：
- 营业执照（含 3C 数码经营范围）
- 至少一个品牌的授权书或进货合同
- 门店门头照 + 店内照片

---

## 八、后期扩展风险

### P1-12 多门店扩展时 sys_user 无门店归属

**问题：** 当前 sys_user 设计为单门店员工。如果未来扩展到多门店（连锁），需要大量改动：库存需要分门店、销售单需要分门店、员工权限需要分门店。当前没有 `store_id` 字段。

**整改（不需要现在加，但需要预留）：**
```
1. sys_user 增加 store_id BIGINT DEFAULT NULL（NULL=总部/未分配）
2. stock_ledger 增加 store_id BIGINT（当前默认=1）
3. 所有查询接口增加 store_id 过滤
4. 这个改造量约 3-5 个工作日，建议 M2 阶段预先植入 store_id 字段
```

### P1-13 国补政策变更时系统缺乏配置化能力

**问题：** 国补政策随时可能变化（补贴比例、适用范围、结算周期）。当前 subsidy_income 是手动录入的数字，如果下个月补贴政策调整，历史数据不能追溯某个订单用的是哪个政策的补贴。

**整改：** 参考 P0-07 的 subsidy_record 表设计，补贴政策变更时新增 policy_batch_no 即可。

### P2-08 IMEI 字段长度 20 位不够

**问题：** 标准 IMEI 是 15 位，但 IMEI SV（带软件版本号）是 16 位。部分物联网设备使用 IMEI 扩展格式 20 位。并且，未来如果扩展到 3C 全品类（平板、笔记本、手表），部分设备使用 MEID（14 位）或 SN（序列号，可能超过 20 位）。

**整改：** ALTER TABLE stock_ledger MODIFY imei VARCHAR(50); 为未来留空间。

### P2-09 短信成本未做预算控制

**问题：** 设计文档中，消费通知、积分到期提醒、推荐奖励通知都走短信。按每条 0.045 元计算：1 万会员 × 12 条/年 = 12 万条 = 5400 元/年。但这只是在册会员，如果加上消费通知（每笔销售 1 条），成本可预估但未在设计文档中出现。

**整改：** 在 M2 迭代中增加 SMS 发送量月限额配置（超出限额后降级为小程序订阅消息）。

---

## 整改优先级总表

| 编号 | 问题 | 类别 | 优先级 | 整改投入 |
|------|------|------|:--:|:--:|
| P0-01 | 出库事务补偿机制缺失 | 架构 | P0 | 2d |
| P0-02 | 分布式 Session/Cache 方案缺失 | 架构 | P0 | 1d |
| P0-03 | 手机号明文存储 | 数据库 | P0 | 3d |
| P0-04 | payment_flow 无外键约束 | 数据库 | P0 | 1d |
| P0-05 | 乐观锁退货回库场景未定义 | 并发 | P0 | 2d |
| P0-06 | 销售员可自行改价——舞弊风险 | 财务 | P0 | 3d |
| P0-07 | 国补核销无审计链 | 财务 | P0 | 3d |
| P0-08 | 积分抵现可能触发支付牌照 | 财务 | P0 | 法务咨询 |
| P0-09 | 仓管主管可自审自入——职权未分离 | 权限 | P0 | 1d |
| P0-10 | AI 只读机制可被绕过 | 权限 | P0 | 1d |
| P0-11 | 积分余额并发扣减可能不一致 | 一致性 | P0 | 1d |
| P0-12 | 缺少用户协议与隐私政策 | 审核 | P0 | 1d |
| | | | | |
| P1-01 | Dify 单点故障 | 架构 | P1 | 1d |
| P1-02 | 缺少 API 版本化 | 架构 | P1 | 2d |
| P1-03 | 销售单无 checksum | 数据库 | P1 | 1d |
| P1-04 | 雪花算法时钟回拨 | 并发 | P1 | 0.5d |
| P1-05 | 支付手续费未计入毛利 | 财务 | P1 | 1d |
| P1-06 | 提成退换货处理缺失 | 财务 | P1 | 2d |
| P1-07 | 会员可越权查看他人数据 | 权限 | P1 | 0.5d |
| P1-08 | 短信通知与事务不一致 | 一致性 | P1 | 1d |
| P1-09 | stock_ledger 无软删除保护 | 一致性 | P1 | 0.5d |
| P1-10 | AI 对话可能导致 UGC 类目要求 | 审核 | P1 | 0.5d |
| P1-11 | 换购专区可能需增值电信许可 | 审核 | P1 | 法务咨询 |
| P1-12 | 多门店扩展预留 store_id | 扩展 | P1 | 1d |
| P1-13 | 国补政策配置化缺失 | 扩展 | P1 | 1d |
| | | | | |
| P2-01 | 模块循环依赖未声明 | 架构 | P2 | 文档 |
| P2-02 | 对账任务缺分布式锁 | 数据库 | P2 | 0.5d |
| P2-03 | DECIMAL 汇总 JS 精度丢失 | 数据库 | P2 | 0.5d |
| P2-04 | Redis 单节点 | 并发 | P2 | — |
| P2-05 | 移动加权无法做批次分析 | 财务 | P2 | M3 |
| P2-06 | 403 频次无防护 | 权限 | P2 | 0.5d |
| P2-07 | 小程序类目选择策略缺失 | 审核 | P2 | 文档 |
| P2-08 | IMEI 字段长度不足 | 扩展 | P2 | 0.5d |
| P2-09 | 短信成本无预算控制 | 扩展 | P2 | 0.5d |

---

## 总结

11 个 P0 问题中，**P0-06（销售员改价）、P0-07（国补审计链）、P0-08（积分=支付牌照）** 是法律合规红线，不解决不能上线。其余 P0 问题可在 2 周内集中修复。

**不建议在 P0 全部解决前进入正式生产环境。**
