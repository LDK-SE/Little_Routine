# 3C 零售小程序 MVP 迭代优化方案

---

## 一、迭代总览

| 迭代 | 周期 | 主题 | 核心交付 |
|:--:|------|------|---------|
| **M1** | 第 1–6 周 | 核心闭环（已完成） | 扫码入出库、IMEI 台账、销售单固化、库存导出 |
| **M2** | 第 7–12 周 | 运营增强 | 积分体系、多收款方式、AI 基础查询、短信触达 |
| **M3** | 第 13–16 周 | 智能升级 | 自动预警、积分过期、AI 多轮对话、滞销分析 |
| **M4** | 第 17–20 周 | 数据驱动 | 销量预测、智能补货、经营诊断、多维报表 |

**当前基线：M1 已交付。本文档聚焦 M2→M3→M4。**

---

## 二、迭代一：库存管理优化（M2 增强）

### 2.1 现状问题

| 问题 | 影响 | 场景 |
|------|------|------|
| 盘点需全量手工核对 | 效率低，月盘耗时半天 | 仓管员逐台扫串码比对系统 |
| 串码状态不可回退 | 售出后无法处理退货 | 7 天无理由退货时无法入库 |
| 缺乏批次维度分析 | 同型号不同批次成本混算 | 进货价波动时毛利失真 |
| 库存列表无排序定制 | 找到目标串码慢 | 导出 Excel 后手工排序 |

### 2.2 优化方案

#### 2.2.1 扫码盘点（P0）

```
流程：仓管员选择盘点模式 → 逐台扫码 IMEI → 系统自动比对 stock_ledger
→ 生成差异报告：盘盈 / 盘亏 / 状态不符
→ 老板确认差异 → 批量更新库存
```

**新增接口：**
| 接口 | 说明 |
|------|------|
| `POST /api/stock/check/start` | 创建盘点任务（类型：全盘/抽盘） |
| `POST /api/stock/check/scan` | 扫码记录（收集 IMEI + 货位） |
| `POST /api/stock/check/commit` | 提交盘点结果 |
| `GET /api/stock/check/diff` | 查看差异报告 |

**新增表：**
```sql
CREATE TABLE stock_check (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  check_no VARCHAR(30) UNIQUE NOT NULL COMMENT '盘点单号',
  type ENUM('full','partial') NOT NULL COMMENT '全盘/抽盘',
  operator_id BIGINT NOT NULL COMMENT '盘点人',
  status ENUM('in_progress','committed','confirmed') NOT NULL DEFAULT 'in_progress',
  expected_count INT DEFAULT 0,       -- 系统账面数
  actual_count INT DEFAULT 0,         -- 实盘数
  surplus_count INT DEFAULT 0,        -- 盘盈
  deficit_count INT DEFAULT 0,        -- 盘亏
  confirmed_by BIGINT,                -- 确认人
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE stock_check_item (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  check_id BIGINT NOT NULL,
  imei VARCHAR(20) NOT NULL,
  system_status ENUM('in_stock','sold','returned') COMMENT '系统记录状态',
  actual_status ENUM('found','missing','extra','wrong_location') COMMENT '实盘结果',
  system_location VARCHAR(50),
  actual_location VARCHAR(50),
  remark VARCHAR(200)
);
```

#### 2.2.2 退货回库流程（P0）

```
顾客退货 → 销售员小程序提交退货申请（原订单号 + 退货原因）
→ 老板审核通过 → 事务执行：
  ① stock_ledger 状态 sold → returned → in_stock（二次审核回库）
  ② sales_order 标记 returned=1
  ③ point_ledger 冲正（原积分扣回）
  ④ payment_flow 写入退款流水（负数）
→ 审核驳回 → 原单不变
```

**stock_ledger 状态机扩展：**
```
pending_audit → in_stock → sold → returned → in_stock（回库）
                            ↘ 不可逆（最终状态）
```

#### 2.2.3 库存标签与快速定位（P1）

```
前端增强：
- 库存列表增加排序控件：按入库时间↑↓、成本↑↓、IMEI↑↓
- 扫码结果页显示"货位导航"提示（A-03 第三排）
- 出库扫码时显示"同型号其他货位库存"
- 库存卡片增加色标：绿色(>10台) / 黄色(3-10台) / 红色(<3台)
```

#### 2.2.4 批次成本分析（P1）

```
新增视图：批次利润分析
- 按 batch_no 分组统计：该批次进货数 / 已售数 / 剩余数
- 该批次平均成本 vs 实际售价均价
- 批次周转天数 = 最后售出日期 - 入库日期
```

---

## 三、迭代二：自动预警系统（M3 核心）

### 3.1 低库存预警（P0）

```
预警规则：
┌────────────┬──────────────┬──────────────────────┐
│ 预警级别    │ 触发条件      │ 通知方式              │
├────────────┼──────────────┼──────────────────────┤
│ 🔴 紧急    │ SKU 库存 ≤ 2  │ 企微 + 短信 + 首页飘红 │
│ 🟡 预警    │ SKU 库存 ≤ 5  │ 企微 + 首页顶部条      │
│ 🔵 提示    │ SKU 库存 ≤ 10 │ 首页看板小标记         │
└────────────┴──────────────┴──────────────────────┘
```

**数据表：**
```sql
CREATE TABLE alert_rule (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sku_id BIGINT COMMENT 'NULL=全局规则',
  alert_type ENUM('low_stock','slow_moving','price_anomaly') NOT NULL,
  threshold_json JSON NOT NULL COMMENT '阈值配置',
  enabled TINYINT DEFAULT 1,
  notify_channels JSON COMMENT '["wecom","sms"]',
  created_at DATETIME,
  updated_at DATETIME
);

-- 示例
INSERT INTO alert_rule (sku_id, alert_type, threshold_json) VALUES
(NULL, 'low_stock', '{"urgent": 2, "warning": 5, "info": 10}');

CREATE TABLE alert_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  rule_id BIGINT,
  alert_type VARCHAR(30),
  level ENUM('urgent','warning','info'),
  message VARCHAR(500),
  sku_id BIGINT,
  current_stock INT COMMENT '触发时的库存数',
  is_resolved TINYINT DEFAULT 0,
  resolved_at DATETIME,
  created_at DATETIME
);
```

**定时任务：**
```
Cron: 每小时执行一次
逻辑:
  1. 查询所有 alert_rule WHERE enabled=1
  2. 对每个 SKU 执行阈值判断
  3. 若触发 && 最近 4 小时内未发过同级别告警 → 写入 alert_log + 推送
  4. 若库存恢复 → 自动标记 is_resolved=1
```

### 3.2 滞销款预警（P0）

```
定义：
- 滞销：入库超过 90 天仍未售出
- 严重滞销：入库超过 180 天仍未售出

前端展示：
- 滞销看板：机型 | 颜色 | 配置 | 货位 | 库龄 | 成本 | 建议行动
- 建议行动：降价促销 / 调货到热销门店 / 捆绑销售 / 退货给渠道

数据查询：
SELECT sl.imei, ps.model, ps.color, ps.spec, sl.location,
       sl.cost_price, sl.created_at,
       DATEDIFF(NOW(), sl.created_at) AS days_in_stock
FROM stock_ledger sl
JOIN product_sku ps ON sl.sku_id = ps.id
WHERE sl.status = 'in_stock'
  AND DATEDIFF(NOW(), sl.created_at) > 90
ORDER BY days_in_stock DESC;
```

### 3.3 售价/毛利异常预警（P1）

```
- 单笔毛利 < 0（售价 < 成本）：实时告警
- 单笔毛利 > 30%：标记为高利润单，老板关注
- 某个 SKU 近期售价持续走低：提醒可能需调整定价
- 某个员工提成占比异常高：提醒核查是否有套路
```

---

## 四、迭代三：积分滚动过期（M3 核心）

### 4.1 过期规则设计

```
┌─────────────────────────────────────────────────────────┐
│ 积分过期规则（年度滚动）：                                 │
│                                                         │
│ - 积分自获取之日起，有效期至次年 12 月 31 日               │
│ - 例：2026 年 3 月获取的积分 → 2027 年 12 月 31 日过期    │
│ - 例：2026 年 8 月获取的积分 → 2027 年 12 月 31 日过期    │
│                                                         │
│ - 消耗积分时，优先扣除最早获得的积分（FIFO）               │
│ - 过期前 30 天 / 7 天 / 1 天发送提醒                     │
│ - 过期日凌晨 2:00 执行过期任务                            │
│ - 过期后积分不可恢复                                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 数据表改造

```sql
-- point_ledger 增加过期相关字段
ALTER TABLE point_ledger ADD COLUMN expires_at DATE COMMENT '过期日期(次年12月31日)';
ALTER TABLE point_ledger ADD COLUMN expired_amount INT DEFAULT 0 COMMENT '已过期积分';
ALTER TABLE point_ledger ADD COLUMN remaining_amount INT COMMENT '剩余有效积分(amount - expired_amount)';

-- 积分过期执行日志
CREATE TABLE points_expire_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  total_expired INT NOT NULL COMMENT '本次过期总积分',
  affected_rows INT NOT NULL COMMENT '涉及流水条数',
  executed_at DATETIME NOT NULL,
  status ENUM('success','partial','failed') NOT NULL,
  error_msg VARCHAR(500)
);
```

### 4.3 过期执行流程

```
每年 1 月 1 日凌晨 2:00 执行:

Step 1: 扫描所有 member.total_points > 0 的会员
Step 2: 对每个会员，按 FIFO 顺序列出 point_ledger (change_type=earn)
Step 3: 找出 expires_at <= CURDATE() 的积分记录
Step 4: 计算应过期积分 = SUM(该记录的 remaining_amount)
Step 5: 事务执行:
  UPDATE point_ledger SET expired_amount=remaining_amount, remaining_amount=0
    WHERE 记录中的积分已到期
  INSERT point_ledger(change_type='expire', amount=-应过期积分, balance_after=新余额)
  UPDATE member SET total_points = total_points - 应过期积分
Step 6: 短信通知: "您的 XXXX 积分已过期，当前可用积分 XXXX"

FIFO 消耗逻辑（积分抵现/换购时）:
  找到该会员 point_ledger 中剩余积分 > 0 且 expires_at > NOW() 的记录
  按 created_at ASC 排列
  从最早的记录开始扣除 remaining_amount
```

### 4.4 积分临期提醒

```
Cron: 每日上午 10:00

Step 1: 查询积分将在 30/7/1 天后过期的会员
Step 2: 去重（同一会员只通知一次）
Step 3: 写入 sms_log，异步发送

短信模板:
"【3C数码管家】您的 XXXX 积分将于 YYYY年MM月DD日 到期，请及时使用。
  您可以到店抵现（100分=1元）或进入小程序换购专区兑换礼品。"
```

---

## 五、迭代四：AI 智能化功能增强（M3–M4）

### 5.1 AI 多轮对话能力（M3-P0）

**现状**：单轮问答，每轮独立处理，无法结合上下文。

**目标**：支持多轮连续对话，AI 记住对话上下文。

```
示例多轮对话:

用户: "iPhone 16 Pro 库存怎么样？"
AI:   "目前 4 个 SKU 共 27 台..."          ← 第一轮

用户: "黑色的呢？"
AI:   "黑色钛金属版本：256GB 8台、1TB 2台"  ← AI 结合上文理解"黑色"=iPhone 16 Pro 黑色钛金属

用户: "256GB 那款卖多少钱？"
AI:   "iPhone 16 Pro 黑色钛金属 256GB 零售价 8999 元"  ← 结合前两轮上下文

用户: "帮我算一下如果卖掉 3 台利润多少？"
AI:   "按当前移动加权成本，3 台毛利约为..."  ← 结合上下文+Function Calling
```

**实现：**
- Dify 工作流增加 `conversation_id` 参数
- 前端传递最近 6 轮对话历史
- LLM System Prompt 追加"请结合对话历史理解用户意图"
- 上下文窗口限制：6 轮历史 + 1 轮当前 = 约 2000 tokens

### 5.2 经营诊断 Agent（M4-P0）

```
场景：老板问"最近生意怎么样？"

AI 自动执行多步 Function Calling:

Step 1: 查本周毛利 → query_gross_profit(period=this_week)
Step 2: 查本月毛利 → query_gross_profit(period=this_month)
Step 3: 查库存预警 → 每日对账数据 + 低库存SKU数
Step 4: 查滞销款 → 库龄>90天的SKU
Step 5: 查畅销款 → 本月销量TOP5

综合回复:
"您本周经营情况总结:
✅ 毛利：本周 12.3 万，环比上周 +8.2%
✅ 热销：iPhone 16 Pro 256GB（售出 28 台）
⚠️ 预警：iPhone 15 128GB 库存仅剩 2 台，建议补货
🔴 滞销：XX 型号已积压 120 天，库存占用资金 3.6 万
📊 本月预计毛利可达 52 万，超过上月 48 万"
```

### 5.3 智能补货建议（M4-P1）

```
输入：
- 过去 12 周各 SKU 周销量
- 当前库存 + 在途库存
- 供应商交货周期（lead_time）
- 安全库存天数（默认 7 天）

输出：
┌──────────────┬──────┬──────┬──────┬───────────┐
│ SKU          │ 库存 │ 周均 │ 建议 │ 紧急程度  │
│              │      │ 销量 │ 补货 │           │
├──────────────┼──────┼──────┼──────┼───────────┤
│ iPhone 16P   │   2  │  12  │  10  │ 🔴 立即   │
│ 黑 256GB     │      │      │      │           │
│ iPhone 16P   │  18  │   8  │   0  │ 🟢 充足   │
│ 原色 512GB   │      │      │      │           │
└──────────────┴──────┴──────┴──────┴───────────┘

计算公式:
  建议补货量 = MAX(0, (周均销量 × lead_time_周) + 安全库存 - 当前库存 - 在途库存)
```

**数据集成前提：**
- 历史销量 ≥ 12 周数据
- 供应商 lead_time 已配置
- 安全库存天数可配置（不同 SKU 可不同）

### 5.4 AI 知识库自动扩充（M4-P1）

```
流程：
1. 人工客服解决一个问题后，系统自动记录对话
2. 每周自动筛选"已解决且评分高"的对话
3. 脱敏（去掉用户手机号、IMEI）
4. 自动分块→Embedding→追加到 Milvus FAQ 知识库
5. 下次 AI 遇到类似问题时命中率提升

效果：FAQ 知识库从手动维护升级为半自动增长
```

---

## 六、完整迭代清单与优先级

### M2 — 运营增强（第 7–12 周）

| 编号 | 功能 | 优先级 | 工作量 | 依赖 |
|------|------|:--:|:--:|------|
| M2-01 | 积分获取（消费得积分 1元1分） | P0 | 3d | SALE-001 出库流程 |
| M2-02 | 积分抵现（100:1 抵扣） | P0 | 3d | M2-01 |
| M2-03 | 积分换购（3000 分门槛） | P0 | 3d | M2-01 |
| M2-04 | 老带新推荐（注册绑定 + 首单双向 200 分奖励） | P0 | 4d | M2-01 |
| M2-05 | 消费短信通知（BullMQ 异步） | P0 | 2d | 短信网关 |
| M2-06 | 多收款方式适配（wechat/huabei/trade_in） | P0 | 3d | — |
| M2-07 | 销售员业绩报表 + 国补汇总 | P0 | 3d | — |
| M2-08 | AI 基本查询上线（库存/毛利/积分/业绩 4 个 Function） | P0 | 5d | Dify 部署 |
| M2-09 | 扫码盘点 V1（全盘模式） | P1 | 3d | — |
| M2-10 | 退货回库流程 | P1 | 4d | SALE-001 |
| M2-11 | 积分流水对账 Job | P1 | 2d | M2-01 |
| M2-12 | 库存列表排序增强 | P2 | 1d | — |
| M2-13 | 批次成本分析视图 | P2 | 2d | — |

### M3 — 智能升级（第 13–16 周）

| 编号 | 功能 | 优先级 | 工作量 | 依赖 |
|------|------|:--:|:--:|------|
| M3-01 | 低库存预警（3 级阈值 + 企微/短信推送） | P0 | 4d | — |
| M3-02 | **积分滚动过期**（FIFO + 年度到期 + 临期提醒） | P0 | 5d | M2-02 |
| M3-03 | 滞销款分析看板（>90 天库龄标记） | P0 | 3d | — |
| M3-04 | AI 经营诊断 Agent（多步 Function Calling） | P0 | 5d | M2-08 |
| M3-05 | AI 多轮对话支持 | P0 | 3d | M2-08 |
| M3-06 | 售价异常告警（毛利<0 / >30%） | P1 | 2d | — |
| M3-07 | 库存色标卡片（绿/黄/红） | P1 | 2d | — |
| M3-08 | 扫码盘点 V2（抽盘 + 差异自动标记） | P1 | 3d | M2-09 |
| M3-09 | 积分临期短信提醒 | P1 | 2d | M3-02 |
| M3-10 | 订单日结对账（payment vs order） | P1 | 3d | — |
| M3-11 | 会员消费行为标签（高价值/沉睡/流失） | P2 | 2d | — |

### M4 — 数据驱动（第 17–20 周）

| 编号 | 功能 | 优先级 | 工作量 | 依赖 |
|------|------|:--:|:--:|------|
| M4-01 | 智能补货建议（Prophet 销量预测 + 安全库存公式） | P0 | 8d | 12 周历史数据 |
| M4-02 | AI FAQ 知识库自动扩充 | P0 | 4d | M3-05 |
| M4-03 | 多维经营报表（同比/环比/趋势曲线） | P1 | 5d | — |
| M4-04 | 会员画像（购机偏好/消费能力/换机周期） | P1 | 4d | — |
| M4-05 | 会员定向营销（基于机型的配件推荐） | P1 | 3d | M4-04 |
| M4-06 | 门店看板大屏（实时销量/库存/毛利滚动） | P2 | 5d | — |
| M4-07 | 移动端经营日报推送（企微/微信） | P2 | 3d | — |

---

## 七、优先级决策矩阵

```
                    高业务价值
                        │
         M3-01 低库存预警  │  M2-01 积分获取
         M3-02 积分过期    │  M2-02 积分抵现
         M3-03 滞销分析    │  M2-08 AI上线
         M3-04 经营诊断    │  M4-01 智能补货
                        │
  低复杂性 ──────────────┼────────────── 高复杂性
                        │
         M2-12 库存排序   │  M4-04 会员画像
         M2-13 批次分析   │  M4-06 看板大屏
         M3-06 售价告警   │  M4-05 定向营销
                        │
                    低业务价值
```

**执行策略：**
1. **优先做左上角**（高价值 + 低复杂）：M3-01 低库存预警、M3-03 滞销分析、M2-08 AI 上线
2. **重点投入右上角**（高价值 + 高复杂）：M2-01/02 积分体系、M3-02 积分过期、M4-01 智能补货
3. **碎片时间做左下角**（低价值 + 低复杂）：M2-12 排序、M3-06 售价告警
4. **最后做右下角**（低价值 + 高复杂）：M4-04 会员画像、M4-06 大屏

---

## 八、迭代里程碑

```
M1 第 6 周末  ████████████████  ✅ 核心闭环验收
              能入库、能出库、能卖、能算利润、能导出

M2 第 12 周末 ████████████████  🎯 运营版验收
              积分闭环、AI 基础查询、短信触达、全收款方式

M3 第 16 周末 ████████████████  🚀 智能版验收
              自动预警、积分过期、AI 多轮+诊断、滞销分析

M4 第 20 周末 ████████████████  📊 数据驱动版验收
              智能补货、AI 知识库自增长、多维报表
```
