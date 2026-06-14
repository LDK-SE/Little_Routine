# 3C 零售小程序测试方案

---

## 一、功能测试用例

### 1.1 会员管理

| 编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|------|---------|---------|---------|---------|:--:|
| MEM-001 | 注册新会员 | 手机号未注册 | POST /api/members/register, phone=13900000001, name=张三 | 返回 201, total_points=0 | P0 |
| MEM-002 | 重复手机号注册 | 13900000001 已存在 | POST /api/members/register, 同手机号 | 返回 409, "该手机号已注册" | P0 |
| MEM-003 | 带推荐人注册 | 推荐人 13900000002 已注册 | POST phone=13900000003, referrerPhone=13900000002 | 返回 201, referrerId=推荐人ID | P0 |
| MEM-004 | 自己推荐自己 | — | phone=13900000001, referrerPhone=13900000001 | 返回 400, "不能推荐自己" | P0 |
| MEM-005 | 推荐人不存在 | — | referrerPhone=19999999999（不存在） | 返回 400, "推荐人手机号不存在或已禁用" | P1 |
| MEM-006 | 查询会员列表 | 数据库有 50 条会员 | GET /api/members?page=1&pageSize=20 | 返回 items[20], total=50, totalPages=3 | P1 |
| MEM-007 | 会员列表分页+排序 | — | GET ?page=2&pageSize=10&sortBy=totalPoints&sortOrder=DESC | items 按积分降序, 页面数据正确 | P1 |
| MEM-008 | 关键词搜索 | 存在"张三" | GET ?keyword=张三 | 返回匹配 phone 或 name 含"张三"的记录 | P1 |
| MEM-009 | 查看会员详情 | 会员 ID=1 存在 | GET /api/members/1 | 返回完整字段含 referrer 关联, address/licensePlate/lastPurchaseModel | P1 |
| MEM-010 | 查看不存在会员 | ID=99999 | GET /api/members/99999 | 返回 404 | P2 |
| MEM-011 | 编辑会员信息 | 会员 ID=1 | PUT /api/members/1, address="广东省广州市" | 返回 updated, address 已更新 | P1 |
| MEM-012 | 尝试修改推荐人 | 会员已有 referrerId | PUT /api/members/1, referrerId=999 | referrerId 未被修改（接口层拒绝） | P0 |
| MEM-013 | 会员状态筛选 | — | GET ?status=1 | 仅返回正常会员 | P2 |
| MEM-014 | 手机号格式校验 | — | POST phone=12345 | 返回 400, validation error | P2 |
| MEM-015 | 车牌号格式校验 | — | PUT licensePlate="ABC123" | 返回 400, "车牌号格式不正确" | P2 |

### 1.2 积分流水

| 编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|------|---------|---------|---------|---------|:--:|
| PT-001 | 消费获取积分 | 会员 ID=1, 购买金额 5699 元 | 销售完成→触发积分写入 | point_ledger 写入一条 earn, amount=5699, balance_after=旧余额+5699, member.total_points 同步更新 | P0 |
| PT-002 | 查看积分余额 | 会员 ID=1, total_points=3680 | GET /api/members/1/points | totalPoints=3680, 流水列表对应 | P0 |
| PT-003 | 积分流水列表 | 会员有 20 条流水 | GET /api/members/1/points?page=1&pageSize=10 | items[10], 含 change_type/amount/order_no/product_model/created_at | P1 |
| PT-004 | 积分抵现 | 会员积分=5000, 需抵扣 1000 分=10 元 | 收银台勾选积分抵扣 1000 分 | point_ledger 写入 redeem, amount=-1000, 订单 actual_paid 减少 10 元 | P0 |
| PT-005 | 积分不足 100 抵现 | 会员积分=50 | 尝试积分抵现 | 返回 400, "积分不足，至少 100 积分方可抵现" | P0 |
| PT-006 | 积分换购门槛 | 会员积分=2000 | 访问换购专区 | 返回 400, "积分未达 3000 分换购门槛" | P0 |
| PT-007 | 积分换购成功 | 会员积分=3500 | 兑换 3000 积分的商品 | point_ledger 写入 redeem, amount=-3000, balance_after=500 | P0 |
| PT-008 | 推荐奖励发放 | 新会员注册+首单消费 | 双方各 +200 分 | 2 条 point_ledger(changetype=referral), 推荐人和被推荐人各+200 | P0 |
| PT-009 | 积分过期 | 会员有 500 分到期 | 定时任务执行 | point_ledger 写入 expire, amount=-500, 短信通知已发送 | P1 |
| PT-010 | 积分流水不可修改 | point_ledger 已有记录 | UPDATE point_ledger SET amount=999 WHERE id=1 | 权限拒绝, "app_user 无 UPDATE 权限" | P0 |
| PT-011 | 积分冲正(manual_adjust) | 误加了 100 分 | INSERT point_ledger(change_type=manual_adjust, amount=-100) | 记录写入, balance_after 正确 | P1 |
| PT-012 | 每日积分对账 | 模拟 1 条差异 | 对账任务执行 | daily_reconcile 写入 status=fail, 企微/短信告警 | P0 |

### 1.3 库存与入库流程

| 编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|------|---------|---------|---------|---------|:--:|
| INV-001 | 扫码入库 | IMEI=356789012345678, SKU 存在 | POST /api/stock/inbound/scan, imei+sku_id+color+spec+cost_price+channel+location | stock_ledger 写入, status=pending_audit, audit_status=pending | P0 |
| INV-002 | 重复扫码入库 | IMEI 已存在 | POST 同 IMEI | 返回 409, "该串码已入库" | P0 |
| INV-003 | 入库审核通过 | stock_ledger id=1 pending_audit | POST /api/stock/inbound/audit/1, action=approved | status=in_stock, audit_status=approved, audit_log 写入 | P0 |
| INV-004 | 入库审核驳回 | stock_ledger id=2 pending_audit | POST audit/2, action=rejected, remark="渠道来源不明" | status=pending_audit, audit_status=rejected, 不入库 | P0 |
| INV-005 | 非主管审核 | 销售员角色 | POST audit/1（销售员token） | 返回 403, 角色无权限 | P1 |
| INV-006 | 库存列表筛选 | 数据库有库存 | GET /api/stock/list?status=in_stock&location=A-03 | 返回符合的 in_stock 记录 | P1 |
| INV-007 | 库存详情追溯 | IMEI 已入库+已销售 | GET /api/stock/detail/356789012345678 | 返回全生命周期（入库时间→审核时间→销售时间→关联订单号） | P1 |
| INV-008 | 库存 Excel 导出 | 1000 条库存 | GET /api/stock/export | 下载 Excel, 列:IMEI/型号/颜色/规格/成本/货位/状态/入库时间, 导出耗时≤2秒 | P1 |
| INV-009 | IMEI 格式校验 | — | POST imei="123" | 返回 400, "IMEI 格式不正确" | P2 |

### 1.4 销售流程

| 编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|------|---------|---------|---------|---------|:--:|
| SALE-001 | 扫码出库 | IMEI 在库, version=0 | POST /api/stock/outbound/scan, imei+sale_price+payment_method+salesperson_id | ① stock_ledger→sold ② sales_order 写入, 毛利固化 ③ member 有积分 → point_ledger 写入 | P0 |
| SALE-002 | 出库时 IMEI 不在库 | IMEI 不存在 | POST outbound/scan | 返回 404, "该串码未入库" | P0 |
| SALE-003 | 出库时 IMEI 已售 | IMEI status=sold | POST outbound/scan | 返回 409, "该商品当前状态不允许出库" | P0 |
| SALE-004 | 并发出库(乐观锁) | 两个销售员同时扫同一 IMEI | 并发 2 请求 | 一个成功(P200), 一个失败(P409 "该商品已被售出"), stock_optimistic_lock_conflict_total +1 | P0 |
| SALE-005 | 销售单成本固化 | 订单已生成 | PUT /api/orders/SO001, cost_price_snapshot=999 | 返回 403, 权限拒绝; 数据库值未变 | P0 |
| SALE-006 | 毛利计算准确性 | 售价=8999, 成本=7500, 国补=500, 提成=5% | 出库提交 | gross_profit=8999+500-7500-(8999*5%)=8999+500-7500-449.95=1549.05 | P0 |
| SALE-007 | 多种收款方式 | cash/wechat/huabei/trade_in/subsidy | 分别出库 | payment_method 正确写入, payment_flow 记录对应 | P1 |
| SALE-008 | 无会员购买 | 散客购买 | POST 不传 member_id | 销售单 member_id=NULL, 不触发积分写入 | P1 |
| SALE-009 | 订单列表筛选 | 数据库有订单 | GET /api/orders/list?salesperson_id=1&created_at=2026-06-12 | 返回匹配订单 | P1 |
| SALE-010 | 订单详情 | 订单 SO2026061000123 | GET /api/orders/SO2026061000123 | 返回含固化毛利, cost_price_snapshot 只读 | P1 |
| SALE-011 | 售价低于成本警告 | 售价=5000, 成本=7500 | POST outbound/scan | 前端弹窗"售价低于成本", 后端记录异常毛利日志, 老板可审批通过 | P1 |
| SALE-012 | 收款流水防重 | payment_no 已存在 | POST 同 payment_no | 返回 409, "流水号已存在" | P0 |
| SALE-013 | 销售单不可删除 | 订单已生成 | DELETE /api/orders/SO001 | 返回 403/405, Method Not Allowed | P0 |
| SALE-014 | 多支付方式组合 | 国补500 + 微信4000 + 花呗4499 | POST 出库 | sale_price=8999, subsidy_income=500, actual_paid=8999, payment_flow 两条记录 | P1 |

### 1.5 AI 查询

| 编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|------|---------|---------|---------|---------|:--:|
| AI-001 | AI 查库存 | Dify 在线, 库存有 iPhone 16 Pro | GET /api/ai/chat?query=iPhone 16 Pro 还有货吗 | function=query_inventory, confidence≥0.85, reply 包含型号/颜色/数量/货位 | P0 |
| AI-002 | AI 查今日毛利 | 今日有销售 | GET ?query=今天赚了多少 | function=query_gross_profit, confidence≥0.95, reply 含销售额/成本/毛利 | P1 |
| AI-003 | AI 查会员积分 | 会员存在 | GET ?query=我还有多少积分（含 token phone） | function=query_member_points, 手机号脱敏, reply 含积分余额 | P1 |
| AI-004 | AI 查员工提成 | 李明有业绩 | GET ?query=李明这个月提成多少 | function=query_salesperson_performance, confidence≥0.95 | P1 |
| AI-005 | AI 查购买记录 | 会员有历史订单 | GET ?query=我最近买了什么 | function=query_member_orders, reply 含订单列表, IMEI 脱敏 | P1 |
| AI-006 | 低置信度转人工 | 问"这个和华为哪个好" | GET ?query=这个手机跟华为那个比哪个好 | confidence<0.85, 自动 POST /api/ai/transfer-human, 生成工单号 | P0 |
| AI-007 | AI 超时处理 | — | 模拟 Dify 超时未响应 | 5 秒后返回"系统繁忙，请稍后重试或转人工" | P1 |
| AI-008 | AI 尝试 POST 写操作 | ai_readonly token | POST /api/stock/inbound/scan | 返回 403, ReadonlyGuard 拦截, "AI 无权执行此操作" | P0 |
| AI-009 | AI 尝试 PUT 修改 | ai_readonly token | PUT /api/members/1 | 返回 403, ReadonlyGuard 拦截 | P0 |
| AI-010 | AI 问答成本不泄露 | 查毛利 | GET ?query=毛利多少 | reply 不含 cost_price 进货成本, costsnapshot 脱敏 | P0 |
| AI-011 | AI 问答手机号脱敏 | 查会员积分 | GET ?query=13812345678 积分多少 | reply 中手机号显示为 138****5678 | P1 |

---

## 二、数据一致性 KPI 验证

| 编号 | KPI | 红线 | 验证 SQL / 方法 | 执行频率 |
|------|-----|------|----------------|----------|
| KPI-01 | 积分总额一致 | 差异 0% | `SELECT m.id, m.total_points, SUM(pl.amount) AS ledger_sum FROM member m LEFT JOIN point_ledger pl ON m.id=pl.member_id GROUP BY m.id HAVING m.total_points != ledger_sum` | 每日自动 |
| KPI-02 | 库存串码匹配率 | 100% | `SELECT imei FROM stock_ledger WHERE status='sold' AND imei NOT IN (SELECT imei FROM sales_order)` | 每日自动 |
| KPI-03 | 在库串码无重复 | 0 | `SELECT imei, COUNT(*) FROM stock_ledger WHERE status='in_stock' GROUP BY imei HAVING COUNT(*)>1` | 每次入库 |
| KPI-04 | 销售单串码唯一 | 100% | `SELECT imei, COUNT(*) FROM sales_order GROUP BY imei HAVING COUNT(*)>1` | 每日自动 |
| KPI-05 | 成本不可更改 | 100% | 抽样 100 笔订单, 对 cost_price_snapshot 做 hash, 对比前后值 | 每周 |
| KPI-06 | 收款与订单金额一致 | 100% | `SELECT so.order_no, so.actual_paid, SUM(pf.amount) FROM sales_order so LEFT JOIN payment_flow pf ON so.order_no=pf.order_no GROUP BY so.order_no HAVING so.actual_paid != SUM(pf.amount)` | 每日自动 |

---

## 三、财务精度验证

| 编号 | 测试场景 | 输入 | 期望结果 | 验证方式 |
|------|---------|------|---------|----------|
| FIN-001 | 移动加权平均成本 | 入库 3 批同 SKU: ①10台@5000 ②5台@5200 ③8台@5100 | 出库第 1 台时 cost_price_snapshot=(10×5000)/(10)=5000.00 | 手工计算 vs 系统值 |
| FIN-002 | 移动加权成本（第二批） | 同上, 第一批已售 3 台 | 出库第 4 台时 cost=(7×5000+5×5200)/(7+5)=5083.33 | 手工计算 vs 系统值 |
| FIN-003 | 毛利计算（纯售价） | 售价=8999, 成本=7500, 提成=0, 国补=0 | gross_profit=1499.00 | API 返回比对 |
| FIN-004 | 毛利计算（含国补+提成） | 售价=8999, 成本=7500, 国补=500, 提成率=5% | gross_profit=1549.05 | 手工计算 vs 系统值 |
| FIN-005 | 积分抵扣金额 | 售价=8999, 积分抵扣=3000 分(30元) | actual_paid=8969.00, points_used=3000 | API 返回比对 |
| FIN-006 | 零销售额 | 无销售日 | gross_profit 汇总 = 0, order_count = 0 | 查询 |
| FIN-007 | 超大金额 | 售价=99999.99, 成本=80000.00 | gross_profit 精度保持 2 位小数, 无溢出 | 边界测试 |
| FIN-008 | 1000 笔批量销售后抽样 | 1000 笔 | 随机抽样 20 笔手工复核, 偏差=0 | 人工抽样 |

---

## 四、并发压力测试（JMeter）

### 4.1 测试目标

| 指标 | 目标 | 红线 |
|------|------|------|
| 扫码出库 TPS | ≥ 50/秒 | — |
| 库存查询 QPS | ≥ 200/秒 | — |
| 出库 P95 延迟 | ≤ 200ms | 超过即告警 |
| 库存查询 P95 延迟 | ≤ 200ms | 超过即告警 |
| 并发冲突拦截率 | 100% | 0% 穿透 |
| 出库成功率（无冲突） | ≥ 99.5% | — |
| 5xx 错误率 | 0% | — |

### 4.2 JMeter 测试脚本（出库并发冲突场景）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testname="3C零售-出库并发冲突测试">
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.value">https://api-test.3c-retail.com</stringProp>
          </elementProp>
          <elementProp name="TOKEN" elementType="Argument">
            <stringProp name="Argument.value">Bearer eyJhbGciOiJIUzI1NiIs...</stringProp>
          </elementProp>
          <elementProp name="IMEI" elementType="Argument">
            <stringProp name="Argument.value">356789012345678</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
    </TestPlan>

    <ThreadGroup guiclass="ThreadGroupGui" testname="并发出库-100线程">
      <stringProp name="ThreadGroup.num_threads">100</stringProp>
      <stringProp name="ThreadGroup.ramp_time">2</stringProp>
      <stringProp name="ThreadGroup.duration">60</stringProp>
    </ThreadGroup>

    <!-- HTTP Header -->
    <HeaderManager guiclass="HeaderPanel" testname="HTTP Header">
      <collectionProp name="HeaderManager.headers">
        <elementProp name="" elementType="Header">
          <stringProp name="Header.name">Authorization</stringProp>
          <stringProp name="Header.value">${TOKEN}</stringProp>
        </elementProp>
        <elementProp name="" elementType="Header">
          <stringProp name="Header.name">Content-Type</stringProp>
          <stringProp name="Header.value">application/json</stringProp>
        </elementProp>
      </collectionProp>
    </HeaderManager>

    <!-- 出库请求 -->
    <HTTPSamplerProxy guiclass="HttpTestSampleGui" testname="扫码出库">
      <stringProp name="HTTPSampler.domain">${BASE_URL}</stringProp>
      <stringProp name="HTTPSampler.port">443</stringProp>
      <stringProp name="HTTPSampler.protocol">https</stringProp>
      <stringProp name="HTTPSampler.path">/api/stock/outbound/scan</stringProp>
      <stringProp name="HTTPSampler.method">POST</stringProp>
      <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
      <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="" elementType="HTTPArgument">
            <stringProp name="Argument.value">
{
  "imei": "${IMEI}",
  "salePrice": 8999.00,
  "paymentMethod": "wechat",
  "salespersonId": 1
}
            </stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
    </HTTPSamplerProxy>

    <!-- 断言 -->
    <ResponseAssertion guiclass="AssertionGui" testname="成功-期望200">
      <collectionProp name="Asserion.test_strings">
        <stringProp name="49586">200</stringProp>
      </collectionProp>
      <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
    </ResponseAssertion>

    <ResponseAssertion guiclass="AssertionGui" testname="冲突-期望409">
      <collectionProp name="Asserion.test_strings">
        <stringProp name="49586">409</stringProp>
      </collectionProp>
      <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
    </ResponseAssertion>
  </hashTree>

  <!-- 结果监听 -->
  <ResultCollector guiclass="ViewResultsFullVisualizer" testname="查看结果树"/>
  <ResultCollector guiclass="SummaryReport" testname="聚合报告"/>
  <ResultCollector guiclass="StatVisualizer" testname="响应时间图"/>
</jmeterTestPlan>
```

### 4.3 关键测试场景

#### 场景一：同串码并发出库（100线程）

```
脚本: 上述 JMeter 脚本
参数: 100 线程, ramp-up 2s, 循环 1 次, 同 IMEI
预期:
  - 成功 1 次 (HTTP 200)
  - 冲突拒绝 99 次 (HTTP 409)
  - 数据库 sales_order 仅 1 条记录
  - stock_optimistic_lock_conflict_total = 99
  - 0 笔重复销售穿透
```

#### 场景二：库存列表并发查询（200线程）

```
GET /api/stock/list?page=1&pageSize=20&status=in_stock
参数: 200 线程, ramp-up 5s, 持续 60s
预期:
  - QPS ≥ 200
  - P95 ≤ 200ms
  - 0 次 5xx 错误
```

#### 场景三：混合负载（出库+查询+积分）

```
混合线程组 (300 线程, 持续 5min):
  - 出库: 30 threads, 不同 IMEI
  - 库存查询: 100 threads
  - 订单列表: 80 threads
  - 积分查询: 60 threads
  - 会员列表: 30 threads
预期:
  - 出库成功率 ≥ 99.5%
  - 所有查询 P95 ≤ 200ms
  - 5xx 错误率 = 0%
```

#### 场景四：长时间浸泡（Soak Test）

```
参数: 200 线程混合负载, 持续 8 小时
监控:
  - 数据库连接池无泄漏 (db_connections_active 稳定)
  - 内存无持续增长
  - P95 不随时间退化
  - 对账无异常
```

### 4.4 JMeter 命令行执行

```bash
# 安装 JMeter
wget https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar xzf apache-jmeter-5.6.3.tgz

# 运行出库并发测试
jmeter -n -t 3c-retail-outbound-test.jmx \
  -l results/outbound-result.jtl \
  -e -o results/outbound-report/ \
  -Jthreads=100 -Jduration=60

# 运行混合负载测试
jmeter -n -t 3c-retail-mixed-test.jmx \
  -l results/mixed-result.jtl \
  -e -o results/mixed-report/ \
  -Jthreads=300 -Jduration=300

# 查看聚合报告
cat results/outbound-report/statistics.json | jq '.Total'
```

---

## 五、核心接口性能基线

| 接口 | 方法 | P50 | P95 | P99 | 超时阈值 |
|------|------|-----|-----|-----|---------|
| /api/health | GET | 5ms | 10ms | 20ms | 1s |
| /api/auth/login | POST | 50ms | 150ms | 300ms | 3s |
| /api/members | GET | 30ms | 100ms | 200ms | 3s |
| /api/members/:id | GET | 20ms | 80ms | 150ms | 2s |
| /api/stock/list | GET | 40ms | **150ms** | 300ms | 3s |
| /api/stock/detail/:imei | GET | 15ms | 50ms | 100ms | 2s |
| /api/stock/inbound/scan | POST | 60ms | 150ms | 300ms | 5s |
| /api/stock/outbound/scan | POST | 80ms | **200ms** | 400ms | 5s |
| /api/stock/export | GET | 500ms | 2000ms | 5000ms | 10s |
| /api/orders/list | GET | 30ms | 120ms | 250ms | 3s |
| /api/finance/gross-profit | GET | 40ms | 150ms | 300ms | 3s |
| /api/members/:id/points | GET | 20ms | 80ms | 150ms | 2s |
| /api/ai/chat | GET | 200ms | 800ms | 3000ms | 5s |
| /api/ai/inventory/query | GET | 50ms | **200ms** | 400ms | 3s |

---

## 六、测试环境配置

| 环境 | 用途 | 配置 |
|------|------|------|
| 本地开发 | 开发自测 | 1 核 2G, Docker |
| 测试环境 | 功能测试 + 集成测试 + 压测 | 4 核 8G, Docker Compose |
| 预发环境 | 灰度验证 | 同生产配置, 只读生产 DB 副本 |
| 生产环境 | 线上监控 | 8 核 16G, 独立物理机/云服务器 |

### 测试数据准备

```sql
-- 初始化测试数据
-- 1. 创建测试用户
INSERT INTO sys_user (phone, name, role) VALUES
('13800000001', '老板', 'owner'),
('13800000002', '销售员A', 'salesperson'),
('13800000003', '仓管员', 'warehouse');

-- 2. 创建测试 SKU
INSERT INTO product_sku (brand, model, color, spec, barcode, retail_price) VALUES
('Apple', 'iPhone 16 Pro', '原色钛金属', '256GB', 'BAR001', 8999.00),
('Apple', 'iPhone 16 Pro', '黑色钛金属', '512GB', 'BAR002', 10999.00);

-- 3. 批量导入 1000 条 IMEI 库存（用于压测）
-- 脚本生成 IMEI 序列
```

---

## 七、测试执行检查清单

### 功能测试

- [ ] MEM-001~015 会员管理全用例通过
- [ ] PT-001~012 积分流水全用例通过
- [ ] INV-001~009 库存入库全用例通过
- [ ] SALE-001~014 销售流程全用例通过
- [ ] AI-001~011 AI 查询全用例通过
- [ ] KPI-01~06 数据一致性验证通过
- [ ] FIN-001~008 财务精度验证通过

### 并发压测

- [ ] 场景一：同串码 100 并发，仅 1 笔成功，0 穿透
- [ ] 场景二：库存查询 200QPS，P95 ≤ 200ms
- [ ] 场景三：300 线程混合负载 5min，5xx=0%
- [ ] 场景四：8 小时浸泡，无内存泄漏
- [ ] stock_optimistic_lock_conflict_total 增量 = 压测期间并发冲突数（一致）
- [ ] 压测后数据一致性校验通过（KPI-01~06 全部 0 差异）

### 上线前

- [ ] 所有 P0 用例通过
- [ ] 所有 P1 用例通过
- [ ] 压测报告签名确认
- [ ] 性能基线达标（P95 ≤ 200ms）
- [ ] 对账脚本就绪
- [ ] 监控告警规则就绪
- [ ] 备份策略就绪
