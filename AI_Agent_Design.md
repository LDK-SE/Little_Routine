# AI 智能体设计方案

## 小程序 + 智能体（3C 数码零售）系统

---

## 一、整体架构

```
┌─────────────────┐     HTTPS      ┌──────────────┐     Function Calling     ┌──────────────────┐
│  小程序前端       │ ────────────→ │   NestJS      │ ←────────────────────── │   Dify 平台       │
│  (商家端/会员端)   │ ←──────────── │   API Gateway │                         │   (工作流引擎)     │
└─────────────────┘               └──────┬───────┘                         └────────┬─────────┘
                                         │                                          │
                                   read-only JWT                                 LLM API
                                   guard 拦截                                      │
                                         │                                   ┌──────┴──────┐
                                  ┌──────┴───────┐                         │  DeepSeek   │
                                  │  只读 API 集合 │                         │  / Qwen3     │
                                  │  (GET only)   │                         └─────────────┘
                                  └──────────────┘
```

---

## 二、API 接口定义（Function Calling 注册表）

### 2.1 Function 清单

| 函数名 | 说明 | 适用角色 | 对应 API |
|--------|------|----------|----------|
| `query_inventory` | 按机型名称查当前库存 | 商家 | `GET /api/ai/inventory/query` |
| `query_gross_profit` | 查今日/本周/本月毛利 | 商家 | `GET /api/ai/finance/gross-profit` |
| `query_member_points` | 按手机号查积分余额 | 商家/会员 | `GET /api/ai/member/points` |
| `query_salesperson_performance` | 查某员工提成/业绩 | 商家 | `GET /api/ai/finance/performance` |
| `query_member_orders` | 按手机号查购买记录 | 会员 | `GET /api/ai/member/orders` |
| `transfer_to_human` | 转人工客服 | — | `POST /api/ai/transfer-human` |

### 2.2 接口详细定义

#### query_inventory

```
GET /api/ai/inventory/query?keyword={model}&location={location}
Authorization: Bearer <ai-readonly-token>

Response 200:
{
  "function": "query_inventory",
  "result": [
    {
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "in_stock_count": 12,
      "locations": ["A-03", "B-07", "C-01"]
    },
    {
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "512GB",
      "in_stock_count": 5,
      "locations": ["A-03"]
    }
  ],
  "searched_at": "2026-06-12T10:30:00+08:00"
}
```

#### query_gross_profit

```
GET /api/ai/finance/gross-profit?period=today|this_week|this_month
Authorization: Bearer <ai-readonly-token>

Response 200:
{
  "function": "query_gross_profit",
  "result": {
    "period": "today",
    "date_range": "2026-06-12",
    "total_revenue": 186500.00,
    "total_cost": 152300.00,
    "total_subsidy": 8500.00,
    "total_commission": 9325.00,
    "gross_profit": 33375.00,
    "order_count": 14
  }
}
```

#### query_member_points

```
GET /api/ai/member/points?phone=13812345678
Authorization: Bearer <ai-readonly-token>

Response 200:
{
  "function": "query_member_points",
  "result": {
    "phone": "138****5678",
    "name": "张先生",
    "total_points": 3680,
    "recent_earn": [
      { "type": "消费得积分", "amount": 5699, "time": "2026-06-10", "model": "iPhone 16 Pro" }
    ],
    "recent_redeem": []
  }
}
```

#### query_salesperson_performance

```
GET /api/ai/finance/performance?name={name}&period=today|this_month
Authorization: Bearer <ai-readonly-token>

Response 200:
{
  "function": "query_salesperson_performance",
  "result": {
    "name": "李明",
    "period": "this_month",
    "order_count": 42,
    "total_sales": 523600.00,
    "total_commission": 12680.00
  }
}
```

#### query_member_orders

```
GET /api/ai/member/orders?phone=13812345678
Authorization: Bearer <ai-readonly-token>

Response 200:
{
  "function": "query_member_orders",
  "result": {
    "phone": "138****5678",
    "orders": [
      {
        "order_no": "SO2026061000123",
        "model": "iPhone 16 Pro",
        "color": "原色钛金属",
        "spec": "256GB",
        "price": 8999.00,
        "time": "2026-06-10 15:30:00",
        "imei_snapshot": "356789****12345"
      }
    ]
  }
}
```

#### transfer_to_human

```
POST /api/ai/transfer-human
Authorization: Bearer <ai-readonly-token>
Content-Type: application/json

Request:
{
  "user_phone": "13812345678",
  "last_query": "我的手机屏幕怎么有黑点",
  "confidence": 0.62,
  "conversation_summary": "用户咨询售后问题，AI 未能匹配到知识库答案"
}

Response 200:
{
  "ticket_id": "TK20260612001",
  "status": "queued",
  "message": "已为您转接人工客服，预计等待 2 分钟"
}
```

---

## 三、RAG 数据检索方案

### 3.1 知识库构建

| 知识库类别 | 内容来源 | 向量化方式 | 更新频率 |
|-----------|----------|-----------|----------|
| **商品知识库** | product_sku 表（品牌/型号/颜色/配置/零售价） | 结构化字段直接索引，不进向量库 | 实时 |
| **库存知识库** | stock_ledger 表（IMEI/货位/状态/成本） | 走 Function Calling 实时查询 | 实时 |
| **会员知识库** | member 表 + point_ledger 表 | 走 Function Calling 实时查询 | 实时 |
| **售后政策 FAQ** | 门店退换货规则、保修政策、国补说明 | 文本分块→Embedding→Milvus | 手动更新 |
| **操作手册** | 小程序使用指南、入库/出库流程说明 | 文本分块→Embedding→Milvus | 手动更新 |
| **对话历史** | 已解决的人工客服对话（脱敏后） | 定期批量导入 | 每周 |

### 3.2 RAG 检索流程

```
用户输入
    │
    ▼
┌────────────────┐
│ 意图分类        │ ← LLM 判断属于 Function Calling 还是 FAQ 检索
└───────┬────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌──────┐  ┌──────────┐
│Function│  │ 语义检索  │
│Calling │  │ (Milvus) │
└──┬───┘  └────┬─────┘
   │           │
   │     ┌─────┴─────┐
   │     │ Top-K 召回  │ ← k=5, score ≥ 0.7
   │     │ + Rerank   │
   │     └─────┬─────┘
   │           │
   ▼           ▼
┌──────────────────────┐
│ 拼接 Context + Prompt │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ LLM 生成最终回复      │
│ + 置信度评分          │
└──────────┬───────────┘
           │
      ┌────┴────┐
      │         │
   ≥85%      <85%
      │         │
      ▼         ▼
  返回用户    转人工客服
```

### 3.3 知识库文档分块策略

```yaml
chunk_size: 500 tokens
chunk_overlap: 50 tokens
embedding_model: text-embedding-3-small  # 或 bge-large-zh
top_k: 5
similarity_threshold: 0.7
rerank_model: bge-reranker-v2-m3
```

---

## 四、Dify 工作流配置

### 4.1 工作流节点图

```
┌─────────┐
│  Start  │ ← 接收用户消息 + 角色（商家/会员） + 手机号
└────┬────┘
     │
     ▼
┌──────────────┐
│ 意图分类 LLM  │ ← System Prompt: 判断意图类型
└──┬──┬───┬───┘
   │  │   │
   ▼  │   │
┌──────┐│   │  ┌─────────────┐
│库存查询│   │  │ 售后/政策类    │
│毛利查询│   │  │ 操作问题      │
│积分查询│   │  │ 模糊闲聊      │
│业绩查询│   │  │              │
└──┬───┘│   │  └──────┬──────┘
   │    │   │         │
   ▼    │   │         ▼
┌────┐  │   │  ┌──────────┐
│Function│   │  │知识库检索 │
│Calling │   │  │(RAG)     │
└──┬───┘  │   │  └────┬─────┘
   │      │   │       │
   └──────┴───┘       │
        │              │
        ▼              ▼
  ┌────────────────────────┐
  │ 置信度判断节点           │
  │ (规则: confidence < 0.85 │
  │  则走转人工分支)         │
  └──────┬────────┬────────┘
         │        │
    ≥0.85│        │<0.85
         ▼        ▼
   ┌────────┐ ┌──────────┐
   │ 回复输出│ │转人工节点 │
   └────────┘ └──────────┘
```

### 4.2 意图分类 System Prompt

```
你是3C数码零售门店的AI客服助手。请将用户的问题分类为以下意图之一，只返回意图标签：

可用意图：
- query_inventory      （询问某型号有没有货、库存数量）
- query_gross_profit   （询问今天/本周/本月赚了多少、毛利）
- query_member_points  （询问我的积分、积分余额）
- query_salesperson_performance （询问某员工提成、业绩）
- query_member_orders  （询问我买了什么、购买记录）
- faq_policy           （退换货规则、保修、国补政策）
- faq_operation        （怎么入库、怎么出库、系统使用）
- chat_greeting        （打招呼、感谢、闲聊）

用户角色：{{role}}
用户消息：{{query}}

意图：
```

### 4.3 置信度评估 Prompt

```
请根据以下信息，评估你的回答的置信度（0到1之间的小数）。

用户问题：{{query}}
检索到的知识：{{context}}
API 查询结果：{{function_result}}

评估标准：
- 1.0：知识库或API返回了完全匹配的答案
- 0.85-0.99：有部分匹配信息，可以推断回答
- 0.7-0.84：相关信息较少，回答可能不准确
- <0.7：无法基于现有信息给出可靠回答

只返回数字，不要返回其他内容。
```

---

## 五、安全机制

### 5.1 API Gateway 层拦截

```typescript
// NestJS Guard — ReadonlyGuard
@Injectable()
export class ReadonlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;

    // 解析 token 中的 access_level 字段
    const payload = this.jwtService.decode(token.replace('Bearer ', ''));

    if (payload.access_level === 'ai_readonly') {
      // AI token 仅允许 GET 请求
      if (request.method !== 'GET') {
        this.logger.warn(`AI token 尝试执行 ${request.method} 请求，已拦截`);
        throw new ForbiddenException('AI 无权执行此操作');
      }
    }

    return true;
  }
}
```

### 5.2 AI 专用 JWT Token

```json
{
  "sub": "ai_agent",
  "role": "ai",
  "access_level": "ai_readonly",
  "permissions": ["read:inventory", "read:finance", "read:member"],
  "iat": 1718179200,
  "exp": 1718265600
}
```

### 5.3 价格/手机号脱敏规则

| 数据 | 处理后 |
|------|--------|
| 手机号 | `138****5678`（中间4位隐藏） |
| 进货成本 | **不返回**，仅返回售价和毛利汇总 |
| IMEI 完整串码 | `356789****12345`（中间4位隐藏） |
| 会员姓名 | 首次对话返回完整姓名，后续对话脱敏为"张先生" |

---

## 六、前端调用示例

### 6.1 初始化 AI 对话

```javascript
// pages/ai-chat/ai-chat.js
Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
  },

  onLoad() {
    // 首次进入，加入系统消息
    this.setData({
      messages: [{
        role: 'assistant',
        content: '你好！我是门店AI助手，可以帮你查库存、查毛利、查积分。请问有什么需要？',
        timestamp: Date.now(),
        isSystem: true,
      }],
    });
  },

  async sendMessage() {
    const { inputValue, messages } = this.data;
    if (!inputValue.trim() || this.data.loading) return;

    const userMsg = { role: 'user', content: inputValue, timestamp: Date.now() };
    this.setData({
      messages: [...messages, userMsg],
      inputValue: '',
      loading: true,
    });

    try {
      const res = await this.requestAI(inputValue);

      if (res.confidence < 0.85) {
        // 转人工
        this.setData({
          messages: [...this.data.messages, {
            role: 'assistant',
            content: res.reply || '您的问题我需要转接人工客服为您处理，请稍候...',
            isTransfer: true,
            ticketId: res.ticket_id,
            timestamp: Date.now(),
          }],
        });
      } else {
        this.setData({
          messages: [...this.data.messages, {
            role: 'assistant',
            content: res.reply,
            functionCalled: res.function,
            timestamp: Date.now(),
          }],
        });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  requestAI(query) {
    return new Promise((resolve, reject) => {
      const app = getApp();
      wx.request({
        url: `${app.globalData.apiBase}/ai/chat`,
        method: 'GET',
        data: {
          query,
          role: app.globalData.userRole, // 'owner' | 'salesperson' | 'member'
          phone: app.globalData.userPhone,
          history: this.data.messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
        header: {
          'Authorization': `Bearer ${app.globalData.token}`,
        },
        success: (res) => {
          if (res.statusCode === 200) resolve(res.data);
          else reject(res.data);
        },
        fail: reject,
      });
    });
  },
});
```

### 6.2 WXML 模板片段

```xml
<!-- 对话气泡 -->
<view class="chat-body">
  <block wx:for="{{messages}}" wx:key="timestamp">
    <!-- AI 消息 -->
    <view class="bubble-row ai" wx:if="{{item.role === 'assistant'}}">
      <image class="avatar" src="/images/ai-avatar.png" />
      <view class="bubble ai-bubble">
        <text>{{item.content}}</text>
        <!-- Function 调用标记 -->
        <view class="function-tag" wx:if="{{item.functionCalled}}">
          数据来源: {{item.functionCalled}}
        </view>
        <!-- 转人工入口 -->
        <view class="transfer-btn" wx:if="{{item.isTransfer}}" bindtap="onTransferHuman">
          查看工单 {{item.ticketId}}
        </view>
      </view>
    </view>

    <!-- 用户消息 -->
    <view class="bubble-row user" wx:if="{{item.role === 'user'}}">
      <view class="bubble user-bubble">
        <text>{{item.content}}</text>
      </view>
    </view>
  </block>

  <!-- 加载动画 -->
  <view class="typing-indicator" wx:if="{{loading}}">
    <text>AI 正在思考...</text>
  </view>
</view>

<!-- 输入栏 -->
<view class="input-bar">
  <input
    class="chat-input"
    value="{{inputValue}}"
    bindinput="onInput"
    bindconfirm="sendMessage"
    placeholder="输入问题，如：iPhone 16 Pro 还有货吗？"
    disabled="{{loading}}"
  />
  <button class="send-btn" bindtap="sendMessage" disabled="{{loading}}">发送</button>
</view>
```

---

## 七、示例对话及 API 调用 JSON

### 场景一：老板询问库存

```
用户:  iPhone 16 Pro 现在的库存情况？

Dify 工作流执行:
  Step 1 意图分类 → query_inventory
  Step 2 Function Calling → GET /api/ai/inventory/query?keyword=iPhone 16 Pro
  Step 3 LLM 组织回复

API 返回 JSON:
{
  "function": "query_inventory",
  "confidence": 0.98,
  "reply": "iPhone 16 Pro 目前库存情况如下：\n\n"
         + "• 原色钛金属 256GB：12 台（货位 A-03、B-07、C-01）\n"
         + "• 原色钛金属 512GB：5 台（货位 A-03）\n"
         + "• 黑色钛金属 256GB：8 台（货位 A-05、B-02）\n"
         + "• 黑色钛金属 1TB：2 台（货位 A-05）\n\n"
         + "共 4 个 SKU 有现货，总计 27 台。需要我帮你查其他机型吗？",
  "result": [ ... ],
  "metadata": { "latency_ms": 320 }
}
```

### 场景二：老板查今日毛利

```
用户:  今天赚了多少？

Dify 工作流执行:
  Step 1 意图分类 → query_gross_profit
  Step 2 Function Calling → GET /api/ai/finance/gross-profit?period=today
  Step 3 参数补全（未指定时间范围，默认 today）

API 返回 JSON:
{
  "function": "query_gross_profit",
  "confidence": 0.99,
  "reply": "截至今天（6月12日），门店经营数据如下：\n\n"
         + "• 销售额：186,500 元\n"
         + "• 国补收入：8,500 元\n"
         + "• 销售成本：152,300 元\n"
         + "• 员工提成：9,325 元\n"
         + "• 毛利：33,375 元\n"
         + "• 成交 14 单\n\n"
         + "毛利表现正常，继续保持。",
  "result": {
    "period": "today",
    "total_revenue": 186500,
    "total_cost": 152300,
    "total_subsidy": 8500,
    "total_commission": 9325,
    "gross_profit": 33375,
    "order_count": 14
  }
}
```

### 场景三：会员查积分

```
用户:  我还有多少积分？

Dify 工作流执行:
  Step 1 意图分类 → query_member_points
  Step 2 从 token 中提取用户手机号 → phone=13812345678
  Step 3 Function Calling → GET /api/ai/member/points?phone=13812345678

API 返回 JSON:
{
  "function": "query_member_points",
  "confidence": 0.96,
  "reply": "张先生您好，您当前可用积分为 3,680 分。\n\n"
         + "最近一笔积分来自 6月10日 购买 iPhone 16 Pro（+5,699分）。\n"
         + "您目前积分已超过 3,000 分，可以进入换购专区兑换礼品哦！",
  "result": {
    "phone": "138****5678",
    "total_points": 3680
  }
}
```

### 场景四：售前咨询（转人工）

```
用户:  这个手机跟华为那个比哪个好？

Dify 工作流执行:
  Step 1 意图分类 → faq_policy / chat（模糊判定）
  Step 2 知识库检索 → 无匹配（对比类问题不在知识库）
  Step 3 置信度计算 → 0.52

API 返回 JSON:
{
  "function": null,
  "confidence": 0.52,
  "reply": "您的问题比较专业，我暂时无法给出准确建议。正在为您转接人工客服，请稍候...",
  "transfer": {
    "ticket_id": "TK20260612003",
    "reason": "confidence_below_threshold"
  }
}
```

### 场景五：员工查自己提成

```
用户:  我这个月提成多少？

Dify 工作流执行:
  Step 1 意图分类 → query_salesperson_performance
  Step 2 从 token 提取当前用户姓名 → name=李明
  Step 3 Function Calling → GET /api/ai/finance/performance?name=李明&period=this_month

API 返回 JSON:
{
  "function": "query_salesperson_performance",
  "confidence": 0.97,
  "reply": "李明，您本月（6月）业绩如下：\n\n"
         + "• 成交 42 单\n"
         + "• 销售额：523,600 元\n"
         + "• 提成金额：12,680 元\n\n"
         + "继续加油，争取月底冲 60 单！",
  "result": {
    "name": "李明",
    "period": "this_month",
    "order_count": 42,
    "total_sales": 523600,
    "total_commission": 12680
  }
}
```

---

## 八、对话场景覆盖矩阵

| 场景 | 意图分类 | Function | 置信度 | 转人工 |
|------|---------|----------|--------|:--:|
| "iPhone 16 Pro 还有货吗" | query_inventory | GET /inventory/query | 0.98 | ❌ |
| "今天赚了多少钱" | query_gross_profit | GET /gross-profit?period=today | 0.99 | ❌ |
| "我还有多少积分" | query_member_points | GET /member/points | 0.96 | ❌ |
| "李明这个月卖了多少" | query_salesperson_performance | GET /finance/performance | 0.97 | ❌ |
| "最近买了什么" | query_member_orders | GET /member/orders | 0.95 | ❌ |
| "怎么退货" | faq_policy | 知识库检索 | 0.91 | ❌ |
| "这个和华为哪个好" | chat | 知识库无匹配 | 0.52 | ✅ |
| "屏幕有黑点能保修吗" | faq_policy | 知识库部分匹配 | 0.78 | ✅ |
| "你好" | chat_greeting | — | 1.0 | ❌ |
