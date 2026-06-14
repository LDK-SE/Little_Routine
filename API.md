# 3C数码零售系统 — 生产环境 API 规范

> **OpenAPI 3.0 | RESTful | NestJS + Prisma | Swagger 自动生成**
>
> 版本：V1.0-FROZEN | 冻结日期：2026-06-14
> 接口总数：**116 个**
> Base URL：`https://api.3c-retail.com`

---

## 通用约定

### 请求头

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Request-Id: <UUID_v4>            # 全链路追踪
X-Shop-Id: <shop_id>               # 多门店上下文（商家端必传）
```

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "uuid",
  "timestamp": "2026-06-14T10:30:00.000Z"
}
```

### 分页格式

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [],
    "total": 1500,
    "page": 1,
    "pageSize": 20,
    "totalPages": 75
  }
}
```

### 通用错误码

| HTTP | code | 说明 |
|------|------|------|
| 400 | 40001 | 参数校验失败 |
| 401 | 40101 | Token无效或已过期 |
| 401 | 40102 | Token已被加入黑名单 |
| 403 | 40301 | 角色无权限 |
| 403 | 40302 | AI只读Token不可执行写操作 |
| 404 | 40401 | 资源不存在 |
| 409 | 40901 | 数据冲突（并发/唯一约束） |
| 422 | 42201 | 业务规则校验失败 |
| 429 | 42901 | 请求频率超限 |
| 500 | 50001 | 服务器内部错误 |
| 503 | 50301 | AI服务不可用 |

### 标记说明

| 标记 | 含义 |
|:--:|------|
| 🔒 | 需JWT鉴权 |
| 📝 | 写入审计日志 |
| 🔄 | 数据库事务 |
| ⚡ | 幂等接口 |
| 👁 | AI只读Token可访问 |

---

## 1. Auth — 认证模块（8个接口）

### 1.1 发送短信验证码

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/send-sms-code` |
| Method | POST |
| 权限 | 公开 |

**请求参数：**
```json
{
  "phone": "13812345678",
  "scene": "login"
}
```
- `phone`: String, 必填, 11位手机号
- `scene`: String, 必填, `login` / `register` / `reset_password`

**响应参数：**
```json
{
  "expireIn": 300,
  "rateLimit": 60
}
```

**错误码：** 40001(手机号格式错误) | 42901(发送频率超限)

**事务：** 否 | **审计：** 否 | **幂等：** 否

---

### 1.2 手机号+验证码登录

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/login` |
| Method | POST |
| 权限 | 公开 |

**请求参数：**
```json
{
  "phone": "13812345678",
  "smsCode": "123456"
}
```

**响应参数：**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "expiresIn": 7200,
  "user": {
    "id": 1,
    "phone": "138****5678",
    "name": "张三",
    "role": "owner",
    "shopId": 1,
    "shopName": "旗舰店",
    "permissions": ["read:inventory", "write:sale", "..."]
  }
}
```

**错误码：** 40001(验证码错误) | 40401(用户不存在)

**事务：** 否 | **审计：** 📝(system_log: login) | **幂等：** 否

---

### 1.3 微信一键登录

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/wechat-login` |
| Method | POST |
| 权限 | 公开 |

**请求参数：**
```json
{
  "code": "wx_auth_code_from_wx_login",
  "encryptedData": "...",
  "iv": "..."
}
```

**响应参数：** 同 1.2

**错误码：** 40001(code无效) | 40401(微信用户未绑定)

**事务：** 否 | **审计：** 📝 | **幂等：** 否

---

### 1.4 刷新Token

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/refresh` |
| Method | POST |
| 权限 | 🔒 |

**请求参数：**
```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

**响应参数：**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "expiresIn": 7200
}
```

**错误码：** 40101(refreshToken过期)

**事务：** 否 | **审计：** 否 | **幂等：** 否

---

### 1.5 登出

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/logout` |
| Method | POST |
| 权限 | 🔒 |

**请求参数：** 无（从JWT中提取jti）

**响应参数：**
```json
{
  "message": "已登出"
}
```

**事务：** 否 | **审计：** 📝(system_log: logout) | **幂等：** ⚡(Redis黑名单已存在时仍返回成功)

---

### 1.6 获取当前用户信息

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/me` |
| Method | GET |
| 权限 | 🔒 |

**响应参数：**
```json
{
  "id": 1,
  "phone": "138****5678",
  "name": "张三",
  "role": "owner",
  "shopId": 1,
  "shopName": "旗舰店",
  "permissions": ["read:inventory", "write:sale", "..."],
  "lastLoginAt": "2026-06-14T09:00:00.000Z"
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是(纯查询)

---

### 1.7 获取当前用户权限列表

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/me/permissions` |
| Method | GET |
| 权限 | 🔒 |

**响应参数：**
```json
{
  "role": "salesperson",
  "permissions": [
    {"module": "inventory", "actions": ["read"]},
    {"module": "sale", "actions": ["read", "create"]},
    {"module": "member", "actions": ["read"]}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 1.8 修改密码

| 属性 | 值 |
|------|-----|
| URL | `/api/auth/me/password` |
| Method | PUT |
| 权限 | 🔒 |

**请求参数：**
```json
{
  "oldPassword": "old_hash",
  "newPassword": "new_hash"
}
```

**响应参数：**
```json
{
  "message": "密码修改成功"
}
```

**错误码：** 42201(原密码错误)

**事务：** 否 | **审计：** 📝(system_log: password_change) | **幂等：** 否

---

## 2. Member — 会员模块（13个接口）

### 2.1 会员注册

| 属性 | 值 |
|------|-----|
| URL | `/api/members/register` |
| Method | POST |
| 权限 | 公开(C端) |

**请求参数：**
```json
{
  "phone": "13900000001",
  "smsCode": "123456",
  "name": "张先生",
  "referrerPhone": "13812345678"
}
```
- `referrerPhone`: String, 可选, 推荐人手机号

**响应参数：**
```json
{
  "id": 1,
  "phone": "139****0001",
  "name": "张先生",
  "totalPoints": 0,
  "referrerId": 5,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40901(手机号已注册) | 42201(自己推荐自己) | 40401(推荐人不存在) | 42201(已有推荐关系)

**事务：** 🔄(member INSERT + member_referral INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡(phone唯一约束)

---

### 2.2 会员列表（商家端）

| 属性 | 值 |
|------|-----|
| URL | `/api/members` |
| Method | GET |
| 权限 | 🔒 owner/salesperson |

**请求参数：**
```
?keyword=张三&status=1&sortBy=totalPoints&sortOrder=DESC&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "phone": "139****0001",
      "name": "张先生",
      "totalPoints": 3680,
      "lastPurchaseModel": "iPhone 16 Pro",
      "status": 1,
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 20,
  "totalPages": 8
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.3 会员详情

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}` |
| Method | GET |
| 权限 | 🔒 owner/salesperson/会员本人 |

**响应参数：**
```json
{
  "id": 1,
  "phone": "139****0001",
  "name": "张先生",
  "address": "广东省广州市天河区",
  "licensePlate": "粤A12345",
  "backupPhone": "139****0002",
  "lastPurchaseModel": "iPhone 16 Pro",
  "totalPoints": 3680,
  "referrer": {
    "id": 5,
    "phone": "138****5678",
    "name": "李女士"
  },
  "referralCount": 3,
  "status": 1,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(会员不存在)

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.4 编辑会员信息

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}` |
| Method | PUT |
| 权限 | 🔒 会员本人/owner |

**请求参数：**
```json
{
  "name": "张先生",
  "address": "广东省广州市天河区",
  "licensePlate": "粤A12345",
  "backupPhone": "13900000002"
}
```
- 不可修改字段：`phone`, `referrerId`, `totalPoints`

**响应参数：** 同 2.3

**错误码：** 40401 | 42201(尝试修改不可变字段) | 40001(车牌号格式错误)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 2.5 注销会员（软删除）

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}` |
| Method | DELETE |
| 权限 | 🔒 会员本人/owner |

**请求参数：**
```json
{
  "reason": "用户主动注销"
}
```

**响应参数：**
```json
{
  "message": "会员已注销",
  "deletedAt": "2026-06-14T11:00:00.000Z"
}
```

**错误码：** 40401 | 42201(有未完成订单)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(已注销仍返回成功)

---

### 2.6 启用/禁用会员

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}/status` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "status": 0,
  "reason": "违规操作"
}
```

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(同状态重复操作仍返回成功)

---

### 2.7 会员积分余额+流水

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}/points` |
| Method | GET |
| 权限 | 🔒 owner/salesperson/会员本人 |

**请求参数：**
```
?page=1&pageSize=20&changeType=earn&startDate=2026-01-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "totalPoints": 3680,
  "ledger": {
    "items": [
      {
        "id": 1001,
        "changeType": "earn",
        "amount": 5699,
        "balanceAfter": 9380,
        "orderNo": "SO2026061000123",
        "orderTime": "2026-06-10T15:30:00.000Z",
        "productModel": "iPhone 16 Pro",
        "unitPrice": 8999.00,
        "expiresAt": "2027-12-31",
        "remainingAmount": 5699,
        "remark": "消费得积分",
        "createdAt": "2026-06-10T15:30:00.000Z"
      }
    ],
    "total": 45,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.8 会员购买记录

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}/orders` |
| Method | GET |
| 权限 | 🔒 会员本人/salesperson/owner |

**请求参数：**
```
?page=1&pageSize=20&startDate=2026-01-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "items": [
    {
      "orderNo": "SO2026061000123",
      "imei": "356789****12345",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "salePrice": 8999.00,
      "actualPaid": 8969.00,
      "pointsUsed": 30,
      "returnStatus": "normal",
      "createdAt": "2026-06-10T15:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.9 会员推荐列表

| 属性 | 值 |
|------|-----|
| URL | `/api/members/{id}/referrals` |
| Method | GET |
| 权限 | 🔒 会员本人/owner |

**响应参数：**
```json
{
  "items": [
    {
      "id": 20,
      "phone": "139****0003",
      "name": "王先生",
      "registeredAt": "2026-05-20T10:00:00.000Z",
      "rewardGranted": true,
      "rewardGrantedAt": "2026-05-22T14:00:00.000Z"
    }
  ],
  "totalReferrals": 3,
  "totalRewardsEarned": 600
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.10 推荐奖励发放（系统内部）

| 属性 | 值 |
|------|-----|
| URL | `/api/members/referral-reward` |
| Method | POST |
| 权限 | 🔒 系统内部调用 |

**请求参数：**
```json
{
  "refereeId": 20,
  "orderNo": "SO2026052200123"
}
```

**响应参数：**
```json
{
  "referrerReward": {"memberId": 5, "amount": 200, "ledgerId": 2001},
  "refereeReward": {"memberId": 20, "amount": 200, "ledgerId": 2002}
}
```

**错误码：** 40901(奖励已发放) | 42201(非首单)

**事务：** 🔄(member_referral UPDATE + 2条point_ledger INSERT + 2条member UPDATE) | **审计：** 📝(system_log) | **幂等：** ⚡(order_no唯一校验)

---

### 2.11 会员列表导出

| 属性 | 值 |
|------|-----|
| URL | `/api/members/export` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?keyword=张&status=1&sortBy=createdAt&sortOrder=DESC
```

**响应：** Excel文件流下载

**事务：** 否 | **审计：** 📝(system_log: export) | **幂等：** 是

---

### 2.12 C端会员查询自己的积分

| 属性 | 值 |
|------|-----|
| URL | `/api/members/me/points` |
| Method | GET |
| 权限 | 🔒 会员端JWT |

**响应参数：** 同 2.7（仅返回本人的积分）

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 2.13 C端会员查询自己的订单

| 属性 | 值 |
|------|-----|
| URL | `/api/members/me/orders` |
| Method | GET |
| 权限 | 🔒 会员端JWT |

**请求参数：**
```
?page=1&pageSize=20
```

**响应参数：** 同 2.8

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 3. Point — 积分模块（9个接口）

### 3.1 积分流水分页查询

| 属性 | 值 |
|------|-----|
| URL | `/api/points/ledger` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?memberId=1&changeType=earn&startDate=2026-01-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1001,
      "memberId": 1,
      "memberPhone": "139****0001",
      "changeType": "earn",
      "amount": 5699,
      "balanceAfter": 9380,
      "orderNo": "SO2026061000123",
      "productModel": "iPhone 16 Pro",
      "expiresAt": "2027-12-31",
      "remainingAmount": 5699,
      "createdAt": "2026-06-10T15:30:00.000Z"
    }
  ],
  "total": 5000,
  "page": 1,
  "pageSize": 20,
  "totalPages": 250
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 3.2 积分抵现（收银台内部调用）

| 属性 | 值 |
|------|-----|
| URL | `/api/points/redeem` |
| Method | POST |
| 权限 | 🔒 系统内部调用 |

**请求参数：**
```json
{
  "memberId": 1,
  "points": 3000,
  "orderNo": "SO2026061400124"
}
```
- `points`: 至少100，最多不超过会员可用积分

**响应参数：**
```json
{
  "redeemedPoints": 3000,
  "redeemedAmount": 30.00,
  "balanceAfter": 680,
  "ledgerId": 2003
}
```

**错误码：** 42201(积分不足100) | 42201(积分余额不足) | 40901(重复抵现)

**事务：** 🔄(point_ledger INSERT + member SELECT FOR UPDATE + member UPDATE) | **审计：** 📝(system_log) | **幂等：** ⚡(order_no唯一校验)

---

### 3.3 积分换购

| 属性 | 值 |
|------|-----|
| URL | `/api/points/exchange` |
| Method | POST |
| 权限 | 🔒 系统内部调用 |

**请求参数：**
```json
{
  "memberId": 1,
  "points": 3000,
  "productName": "蓝牙耳机",
  "orderNo": "EX202606140001"
}
```

**响应参数：**
```json
{
  "exchangedPoints": 3000,
  "balanceAfter": 680,
  "ledgerId": 2004
}
```

**错误码：** 42201(积分未达3000换购门槛) | 42201(积分余额不足)

**事务：** 🔄(point_ledger INSERT + member SELECT FOR UPDATE + member UPDATE) | **审计：** 📝(system_log) | **幂等：** ⚡(order_no唯一校验)

---

### 3.4 手动积分调整（冲正）

| 属性 | 值 |
|------|-----|
| URL | `/api/points/manual-adjust` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "memberId": 1,
  "amount": -100,
  "reason": "误加100积分，冲正"
}
```

**响应参数：**
```json
{
  "ledgerId": 2005,
  "balanceAfter": 580,
  "adjustType": "manual_adjust"
}
```

**错误码：** 40401(会员不存在) | 42201(冲正后余额为负)

**事务：** 🔄(point_ledger INSERT + member UPDATE) | **审计：** 📝(system_log, 记录操作人+原因) | **幂等：** 否

---

### 3.5 即将过期积分查询

| 属性 | 值 |
|------|-----|
| URL | `/api/points/expiring` |
| Method | GET |
| 权限 | 🔒 系统定时任务/owner |

**请求参数：**
```
?daysBeforeExpire=30&page=1&pageSize=100
```

**响应参数：**
```json
{
  "items": [
    {
      "memberId": 1,
      "memberPhone": "139****0001",
      "expiringPoints": 2000,
      "expiresAt": "2026-12-31",
      "daysRemaining": 200
    }
  ],
  "totalExpiringMembers": 150,
  "totalExpiringPoints": 350000
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 3.6 执行积分过期（定时任务）

| 属性 | 值 |
|------|-----|
| URL | `/api/points/execute-expire` |
| Method | POST |
| 权限 | 🔒 系统定时任务 |

**请求参数：**
```json
{
  "executeDate": "2027-01-01",
  "batchSize": 100
}
```

**响应参数：**
```json
{
  "totalExpired": 500000,
  "affectedMembers": 300,
  "batchesProcessed": 50,
  "status": "success",
  "expireLogId": 10
}
```

**事务：** 🔄(分批，每批内事务) | **审计：** 📝(points_expire_log + system_log) | **幂等：** ⚡(按日期去重)

---

### 3.7 积分对账结果查询

| 属性 | 值 |
|------|-----|
| URL | `/api/points/reconcile` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?date=2026-06-14
```

**响应参数：**
```json
{
  "reconcileDate": "2026-06-14",
  "status": "pass",
  "expectedCount": 10000,
  "actualCount": 10000,
  "diffCount": 0,
  "diffDetail": null
}
```
当 `status: "fail"` 时：
```json
{
  "reconcileDate": "2026-06-14",
  "status": "fail",
  "expectedCount": 10000,
  "actualCount": 9998,
  "diffCount": 2,
  "diffDetail": [
    {"memberId": 5, "expectedPoints": 1500, "actualPoints": 1400, "diff": -100},
    {"memberId": 18, "expectedPoints": 3000, "actualPoints": 3200, "diff": 200}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 3.8 积分汇总统计

| 属性 | 值 |
|------|-----|
| URL | `/api/points/summary` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "totalIssued": 1250000,
  "totalRedeemed": 350000,
  "totalExpired": 50000,
  "totalReferralAwarded": 80000,
  "currentCirculation": 930000,
  "topEarners": [
    {"memberId": 10, "phone": "139****0010", "points": 50000}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 3.9 积分规则查询

| 属性 | 值 |
|------|-----|
| URL | `/api/points/rules` |
| Method | GET |
| 权限 | 公开 |

**响应参数：**
```json
{
  "earnRate": "1元=1积分",
  "redeemRate": "100积分=1元",
  "minRedeemPoints": 100,
  "exchangeThreshold": 3000,
  "referralReward": 200,
  "expireRule": "次年12月31日",
  "expireRemindDays": [30, 7, 1]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 4. Inventory — 库存模块（16个接口）

### 4.1 SKU列表

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/products` |
| Method | GET |
| 权限 | 🔒 商家 |

**请求参数：**
```
?brand=Apple&model=iPhone 16 Pro&color=原色钛金属&status=1&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "brand": "Apple",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "barcode": "BAR001",
      "retailPrice": 8999.00,
      "minSalePrice": 8500.00,
      "stockCount": 12,
      "status": 1,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 250,
  "page": 1,
  "pageSize": 20,
  "totalPages": 13
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.2 新建SKU

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/products` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "brand": "Apple",
  "model": "iPhone 16 Pro",
  "color": "原色钛金属",
  "spec": "256GB",
  "barcode": "BAR001",
  "retailPrice": 8999.00,
  "minSalePrice": 8500.00
}
```

**响应参数：**
```json
{
  "id": 1,
  "brand": "Apple",
  "model": "iPhone 16 Pro",
  "color": "原色钛金属",
  "spec": "256GB",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40901(SKU四字段联合唯一冲突)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(联合唯一约束)

---

### 4.3 SKU详情

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/products/{id}` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：** 同 4.2 创建返回 + `updatedAt`

**错误码：** 40401

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.4 编辑SKU

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/products/{id}` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "retailPrice": 9299.00,
  "minSalePrice": 8800.00,
  "status": 1
}
```

**响应参数：** 更新后的SKU详情

**错误码：** 40401

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 4.5 停售SKU（软删除）

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/products/{id}` |
| Method | DELETE |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "message": "SKU已停售",
  "deletedAt": "2026-06-14T11:00:00.000Z"
}
```

**错误码：** 40401 | 42201(该SKU有在库库存)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡

---

### 4.6 库存列表（多维筛选）

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock` |
| Method | GET |
| 权限 | 🔒 商家 |

**请求参数：**
```
?skuId=1&status=in_stock&location=A-03&batchNo=B2026001&keyword=iPhone&page=1&pageSize=20&sortBy=createdAt&sortOrder=DESC
```

**响应参数：**
```json
{
  "items": [
    {
      "imei": "356789012345678",
      "skuId": 1,
      "brand": "Apple",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "batchNo": "B2026001",
      "location": "A-03",
      "costPrice": 7500.00,
      "channel": "官方渠道",
      "status": "in_stock",
      "daysInStock": 30,
      "createdAt": "2026-05-15T10:00:00.000Z"
    }
  ],
  "total": 5000,
  "page": 1,
  "pageSize": 20,
  "totalPages": 250
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.7 串码生命周期追溯

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock/{imei}` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：**
```json
{
  "imei": "356789012345678",
  "currentStatus": "sold",
  "skuInfo": {
    "brand": "Apple",
    "model": "iPhone 16 Pro",
    "color": "原色钛金属",
    "spec": "256GB"
  },
  "timeline": [
    {"action": "入库申请", "operator": "仓管员A", "time": "2026-05-15T10:00:00.000Z", "remark": "官方渠道采购"},
    {"action": "入库审核通过", "operator": "老板", "time": "2026-05-15T14:00:00.000Z", "remark": "审核通过"},
    {"action": "扫码出库", "operator": "销售员B", "time": "2026-06-10T15:30:00.000Z", "remark": "销售单SO2026061000123"}
  ],
  "orderInfo": {
    "orderNo": "SO2026061000123",
    "salePrice": 8999.00,
    "costPriceSnapshot": 7500.00,
    "grossProfit": 1499.00,
    "salespersonName": "销售员B",
    "createdAt": "2026-06-10T15:30:00.000Z"
  }
}
```

**错误码：** 40401(IMEI不存在)

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.8 导出库存Excel

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock/export` |
| Method | GET |
| 权限 | 🔒 owner/warehouse_supervisor |

**请求参数：** 同 4.6（不含分页）

**响应：** Excel文件流（列：IMEI/品牌/型号/颜色/配置/成本/货位/批次/状态/入库时间）

**事务：** 否 | **审计：** 📝(system_log: export) | **幂等：** 是

---

### 4.9 库存汇总统计

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock/summary` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：**
```json
{
  "totalInStock": 5000,
  "totalValue": 37500000.00,
  "byBrand": [
    {"brand": "Apple", "count": 2000, "value": 18000000.00},
    {"brand": "Huawei", "count": 1500, "value": 10500000.00}
  ],
  "byStatus": {
    "in_stock": 5000,
    "pending_audit": 50,
    "sold": 30000,
    "returned": 20,
    "frozen": 5
  },
  "lowStockAlerts": 3,
  "slowMovingCount": 12
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.10 低库存预警列表

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock/low-stock` |
| Method | GET |
| 权限 | 🔒 owner/warehouse_supervisor |

**响应参数：**
```json
{
  "items": [
    {
      "skuId": 25,
      "brand": "Apple",
      "model": "iPhone 16 Pro Max",
      "color": "黑色钛金属",
      "spec": "1TB",
      "currentStock": 2,
      "alertLevel": "urgent",
      "lastSaleAt": "2026-06-13T18:00:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.11 滞销库存列表

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock/slow-moving` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?daysThreshold=90
```

**响应参数：**
```json
{
  "items": [
    {
      "imei": "356789010000000",
      "skuId": 50,
      "brand": "Samsung",
      "model": "Galaxy S24",
      "color": "灰色",
      "spec": "128GB",
      "location": "C-05",
      "costPrice": 6500.00,
      "daysInStock": 120,
      "suggestedAction": "降价促销"
    }
  ],
  "totalSlowMoving": 12,
  "totalFrozenCapital": 78000.00
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.12 产品分类列表

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/categories` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：**
```json
{
  "items": [
    {"id": 1, "name": "手机", "productCount": 150, "status": 1},
    {"id": 2, "name": "平板", "productCount": 50, "status": 1},
    {"id": 3, "name": "笔记本", "productCount": 30, "status": 1}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 4.13 新建产品分类

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/categories` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "name": "智能穿戴",
  "parentId": null
}
```

**事务：** 否 | **审计：** 📝 | **幂等：** 否

---

### 4.14 库存盘点 — 创建任务

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock-check` |
| Method | POST |
| 权限 | 🔒 warehouse/warehouse_supervisor/owner |

**请求参数：**
```json
{
  "type": "full",
  "location": null
}
```

**响应参数：**
```json
{
  "id": 1,
  "checkNo": "CK20260614001",
  "type": "full",
  "status": "in_progress",
  "expectedCount": 5000,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 4.15 盘点 — 扫码记录

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock-check/{id}/scan` |
| Method | POST |
| 权限 | 🔒 warehouse/warehouse_supervisor/owner |

**请求参数：**
```json
{
  "imei": "356789012345678",
  "actualLocation": "A-03"
}
```

**响应参数：**
```json
{
  "scanned": 150,
  "remaining": 4850,
  "lastScan": {
    "imei": "356789012345678",
    "systemStatus": "in_stock",
    "actualStatus": "found",
    "systemLocation": "A-03",
    "actualLocation": "A-03",
    "isMatch": true
  }
}
```

**错误码：** 40901(IMEI已在此次盘点中扫描)

**事务：** 🔄(stock_check_item INSERT + stock_check UPDATE count) | **审计：** 📝 | **幂等：** ⚡(check_id + imei唯一)

---

### 4.16 盘点 — 提交结果 + 差异报告

| 属性 | 值 |
|------|-----|
| URL | `/api/inventory/stock-check/{id}/commit` |
| Method | POST |
| 权限 | 🔒 warehouse_supervisor/owner |

**响应参数：**
```json
{
  "checkNo": "CK20260614001",
  "status": "committed",
  "expectedCount": 5000,
  "actualCount": 4998,
  "surplusCount": 0,
  "deficitCount": 2,
  "diffDetail": [
    {"imei": "356789010000001", "systemStatus": "in_stock", "actualStatus": "missing", "systemLocation": "B-03"},
    {"imei": "356789010000002", "systemStatus": "in_stock", "actualStatus": "missing", "systemLocation": "C-07"}
  ]
}
```

**事务：** 🔄(stock_check UPDATE status + stock_check_item批量INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡

---

## 5. Purchase — 采购/入库模块（10个接口）

### 5.1 扫码入库申请

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/inbound/scan` |
| Method | POST |
| 权限 | 🔒 warehouse/owner |

**请求参数：**
```json
{
  "imei": "356789012345678",
  "skuId": 1,
  "batchNo": "B2026001",
  "location": "A-03",
  "costPrice": 7500.00,
  "channel": "官方渠道"
}
```

**响应参数：**
```json
{
  "id": 1001,
  "imei": "356789012345678",
  "status": "pending_audit",
  "auditStatus": "pending",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40901(IMEI已入库) | 40001(IMEI格式错误) | 40401(SKU不存在)

**事务：** 否 | **审计：** 📝(audit_log: inbound_apply) | **幂等：** ⚡(IMEI唯一约束)

---

### 5.2 待审核入库列表

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/inbound/audit-list` |
| Method | GET |
| 权限 | 🔒 owner/warehouse_supervisor |

**请求参数：**
```
?status=pending&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1001,
      "imei": "356789012345678",
      "brand": "Apple",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "batchNo": "B2026001",
      "location": "A-03",
      "costPrice": 7500.00,
      "channel": "官方渠道",
      "applicantName": "仓管员A",
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 5.3 入库审核

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/inbound/audit/{id}` |
| Method | POST |
| 权限 | 🔒 owner/warehouse_supervisor |

**请求参数：**
```json
{
  "action": "approved",
  "remark": "审核通过"
}
```
- `action`: `approved` / `rejected`

**响应参数：**
```json
{
  "id": 1001,
  "imei": "356789012345678",
  "auditStatus": "approved",
  "status": "in_stock",
  "auditedAt": "2026-06-14T14:00:00.000Z"
}
```

**错误码：** 40401 | 42201(非待审核状态不可操作)

**事务：** 🔄(imei_stock UPDATE status+audit_status + audit_log INSERT) | **审计：** 📝(audit_log) | **幂等：** ⚡(audit_status检查防重复审核)

---

### 5.4 入库记录列表

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/inbound/list` |
| Method | GET |
| 权限 | 🔒 商家 |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14&channel=官方渠道&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "imei": "356789012345678",
      "skuBrand": "Apple",
      "skuModel": "iPhone 16 Pro",
      "skuColor": "原色钛金属",
      "skuSpec": "256GB",
      "batchNo": "B2026001",
      "costPrice": 7500.00,
      "channel": "官方渠道",
      "auditStatus": "approved",
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 5.5 入库单详情

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/inbound/{id}` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：**
```json
{
  "id": 1001,
  "imei": "356789012345678",
  "skuInfo": {"brand": "Apple", "model": "iPhone 16 Pro", "color": "原色钛金属", "spec": "256GB"},
  "batchNo": "B2026001",
  "location": "A-03",
  "costPrice": 7500.00,
  "channel": "官方渠道",
  "status": "in_stock",
  "auditTrail": [
    {"action": "inbound_apply", "operator": "仓管员A", "time": "2026-06-14T10:30:00.000Z"},
    {"action": "inbound_approve", "operator": "老板", "time": "2026-06-14T14:00:00.000Z"}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 5.6 创建采购订单

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/orders` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "supplierName": "官方授权经销商",
  "supplierContact": "13800000000",
  "items": [
    {"skuId": 1, "imei": "356789012345678", "unitCost": 7500.00},
    {"skuId": 1, "imei": "356789012345679", "unitCost": 7500.00}
  ],
  "remark": "补货iPhone 16 Pro 256GB"
}
```

**响应参数：**
```json
{
  "id": 1,
  "orderNo": "PO202606140001",
  "totalAmount": 15000.00,
  "itemCount": 2,
  "status": "pending",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 🔄(purchase_order INSERT + purchase_item批量INSERT) | **审计：** 📝(system_log) | **幂等：** 否

---

### 5.7 采购订单列表

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/orders` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?status=approved&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "orderNo": "PO202606140001",
      "supplierName": "官方授权经销商",
      "totalAmount": 15000.00,
      "itemCount": 2,
      "status": "approved",
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 5.8 采购订单详情

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/orders/{id}` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "id": 1,
  "orderNo": "PO202606140001",
  "supplierName": "官方授权经销商",
  "supplierContact": "13800000000",
  "totalAmount": 15000.00,
  "status": "approved",
  "approvedBy": "老板",
  "approvedAt": "2026-06-14T11:00:00.000Z",
  "items": [
    {"skuId": 1, "imei": "356789012345678", "brand": "Apple", "model": "iPhone 16 Pro", "unitCost": 7500.00, "subtotal": 7500.00},
    {"skuId": 1, "imei": "356789012345679", "brand": "Apple", "model": "iPhone 16 Pro", "unitCost": 7500.00, "subtotal": 7500.00}
  ],
  "remark": "补货iPhone 16 Pro 256GB",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 5.9 编辑采购订单

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/orders/{id}` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "supplierName": "更新后的供应商",
  "remark": "更新备注"
}
```
- 仅 `pending` 状态可编辑

**错误码：** 42201(非pending状态不可编辑)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 5.10 采购收货确认

| 属性 | 值 |
|------|-----|
| URL | `/api/purchase/orders/{id}/receive` |
| Method | POST |
| 权限 | 🔒 warehouse/owner |

**请求参数：**
```json
{
  "receivedItems": [
    {"imei": "356789012345678", "location": "A-03", "actualCost": 7500.00},
    {"imei": "356789012345679", "location": "A-03", "actualCost": 7550.00}
  ]
}
```

**响应参数：**
```json
{
  "orderNo": "PO202606140001",
  "status": "received",
  "receivedCount": 2,
  "stockLedgerEntries": 2,
  "receivedAt": "2026-06-14T16:00:00.000Z"
}
```

**事务：** 🔄(purchase_order UPDATE + imei_stock批量INSERT + stock_ledger批量INSERT) | **审计：** 📝(audit_log批量) | **幂等：** ⚡(IMEI唯一约束)

---

## 6. Sale — 销售模块（16个接口）

### 6.1 扫码出库（核心事务）⚡

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/outbound/scan` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "imei": "356789012345678",
  "salePrice": 8999.00,
  "paymentMethod": "wechat",
  "salespersonId": 2,
  "memberPhone": "13900000001",
  "subsidyAmount": 500.00,
  "pointsToUse": 0,
  "payments": [
    {"method": "wechat", "amount": 4000.00},
    {"method": "subsidy", "amount": 500.00},
    {"method": "huabei", "amount": 4499.00}
  ],
  "tradeIn": {
    "oldImei": "123456789012345",
    "oldBrand": "Apple",
    "oldModel": "iPhone 14",
    "oldCondition": "良好",
    "appraisedValue": 2000.00,
    "actualDeduction": 2000.00
  }
}
```

**响应参数：**
```json
{
  "orderNo": "SO2026061400124",
  "imei": "356789012345678",
  "skuInfo": {"brand": "Apple", "model": "iPhone 16 Pro", "color": "原色钛金属", "spec": "256GB"},
  "salePrice": 8999.00,
  "costPriceSnapshot": 7500.00,
  "subsidyIncome": 500.00,
  "commission": 449.95,
  "grossProfit": 1549.05,
  "actualPaid": 8969.00,
  "pointsUsed": 0,
  "pointsEarned": 5699,
  "payments": [
    {"paymentNo": "PF20260614001", "method": "wechat", "amount": 4000.00},
    {"paymentNo": "PF20260614002", "method": "subsidy", "amount": 500.00},
    {"paymentNo": "PF20260614003", "method": "huabei", "amount": 4499.00}
  ],
  "tradeInOrderId": 1,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(IMEI不存在) | 40901(IMEI已售出/并发冲突) | 42201(售价低于最低限价) | 42201(售价低于成本需审批) | 42201(积分不足) | 40001(收款金额合计不等于售价)

**事务：** 🔄(imei_stock乐观锁UPDATE + sale_order INSERT + sale_item INSERT + point_ledger INSERT(积分获取+积分抵扣) + member UPDATE + payment_flow批量INSERT + trade_in_order INSERT(可选) + notification_outbox INSERT + stock_ledger INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡(乐观锁version保证唯一出库)

**单笔最复杂事务（涉及7~8张表），所有操作在同一REPEATABLE READ事务内。**

---

### 6.2 售价校验（出库前检查）

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/price-check` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "imei": "356789012345678",
  "salePrice": 5000.00
}
```

**响应参数：**
```json
{
  "costPrice": 7500.00,
  "minSalePrice": 8500.00,
  "suggestedRetailPrice": 8999.00,
  "warnings": [
    {"level": "critical", "message": "售价5000.00低于成本7500.00，需要老板审批"},
    {"level": "warning", "message": "售价低于最低限价8500.00"}
  ],
  "requiresApproval": true
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.3 销售订单列表

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/orders` |
| Method | GET |
| 权限 | 🔒 商家 |

**请求参数：**
```
?salespersonId=2&paymentMethod=wechat&startDate=2026-06-01&endDate=2026-06-14&returnStatus=normal&keyword=iPhone&page=1&pageSize=20&sortBy=createdAt&sortOrder=DESC
```

**响应参数：**
```json
{
  "items": [
    {
      "orderNo": "SO2026061400124",
      "imei": "356789****12345",
      "brand": "Apple",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "salePrice": 8999.00,
      "costPriceSnapshot": 7500.00,
      "grossProfit": 1549.05,
      "actualPaid": 8969.00,
      "paymentMethod": "wechat+subsidy+huabei",
      "salespersonName": "销售员B",
      "memberPhone": "139****0001",
      "returnStatus": "normal",
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ],
  "summary": {
    "totalOrders": 14,
    "totalSales": 186500.00,
    "totalProfit": 33375.00
  },
  "total": 2500,
  "page": 1,
  "pageSize": 20,
  "totalPages": 125
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.4 订单详情

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/orders/{orderNo}` |
| Method | GET |
| 权限 | 🔒 商家 |

**响应参数：**
```json
{
  "orderNo": "SO2026061400124",
  "shopName": "旗舰店",
  "items": [
    {
      "imei": "356789****12345",
      "brand": "Apple",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "salePrice": 8999.00,
      "costPriceSnapshot": 7500.00,
      "subsidyIncome": 500.00,
      "commission": 449.95,
      "grossProfit": 1549.05
    }
  ],
  "totalAmount": 8999.00,
  "totalCostSnapshot": 7500.00,
  "totalSubsidy": 500.00,
  "totalCommission": 449.95,
  "grossProfit": 1549.05,
  "actualPaid": 8969.00,
  "pointsUsedTotal": 0,
  "paymentMethod": "wechat+subsidy+huabei",
  "salespersonName": "销售员B",
  "memberInfo": {"id": 1, "phone": "139****0001", "name": "张先生"},
  "returnStatus": "normal",
  "payments": [
    {"paymentNo": "PF20260614001", "method": "wechat", "amount": 4000.00, "status": 1},
    {"paymentNo": "PF20260614002", "method": "subsidy", "amount": 500.00, "status": 1},
    {"paymentNo": "PF20260614003", "method": "huabei", "amount": 4499.00, "status": 1}
  ],
  "tradeIn": {"oldBrand": "Apple", "oldModel": "iPhone 14", "appraisedValue": 2000.00},
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(订单不存在或已删除)

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.5 取消订单（软删除）

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/orders/{orderNo}` |
| Method | DELETE |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "reason": "录入错误"
}
```

**响应参数：**
```json
{
  "orderNo": "SO2026061400124",
  "message": "订单已取消",
  "deletedAt": "2026-06-14T11:00:00.000Z"
}
```
- 财务字段不可修改，仅设置 `deleted_at`
- 需同步将库存回退（IMEI status 从 sold 回退到 in_stock）
- 需同步冲正积分
- 需同步作废收款流水

**错误码：** 40401 | 42201(订单已完成退货不可取消)

**事务：** 🔄(sale_order软删除 + imei_stock状态回退 + point_ledger冲正 + payment_flow作废 + stock_ledger INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡

---

### 6.6 记录收款

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/payment` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "orderNo": "SO2026061400124",
  "method": "wechat",
  "amount": 4000.00,
  "externalTransactionId": "WX20260614103000001"
}
```

**响应参数：**
```json
{
  "paymentNo": "PF20260614004",
  "status": 1,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(订单不存在) | 40901(payment_no重复) | 42201(收款金额超出订单总额)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(payment_no唯一约束)

---

### 6.7 收款流水列表

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/payments` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?paymentType=normal&method=wechat&reconcileStatus=pending&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "paymentNo": "PF20260614001",
      "orderNo": "SO2026061400124",
      "method": "wechat",
      "amount": 4000.00,
      "paymentType": "normal",
      "externalTransactionId": "WX20260614103000001",
      "reconcileStatus": "matched",
      "status": 1,
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.8 收款流水详情

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/payments/{paymentNo}` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：** 同 6.7 单条详情

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.9 每日销售汇总

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/orders/daily-summary` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?date=2026-06-14
```

**响应参数：**
```json
{
  "date": "2026-06-14",
  "totalOrders": 14,
  "totalSales": 186500.00,
  "totalCost": 152300.00,
  "totalSubsidy": 8500.00,
  "totalCommission": 9325.00,
  "grossProfit": 33375.00,
  "byPaymentMethod": {
    "wechat": 85000.00,
    "cash": 25000.00,
    "huabei": 50000.00,
    "subsidy": 8500.00,
    "trade_in": 18000.00
  },
  "bySalesperson": [
    {"salespersonId": 2, "name": "销售员B", "orders": 8, "sales": 105000.00, "commission": 5250.00},
    {"salespersonId": 3, "name": "销售员C", "orders": 6, "sales": 81500.00, "commission": 4075.00}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.10 导出销售订单

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/orders/export` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：** 同 6.3（不含分页）

**响应：** Excel文件流下载

**事务：** 否 | **审计：** 📝(system_log: export) | **幂等：** 是

---

### 6.11 提交退货申请

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/return` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "originalOrderNo": "SO2026061000123",
  "imei": "356789012345678",
  "returnReason": "7天无理由退货",
  "returnType": "full_return"
}
```

**响应参数：**
```json
{
  "returnNo": "RT202606140001",
  "originalOrderNo": "SO2026061000123",
  "refundAmount": 8999.00,
  "pointsToRecall": 5699,
  "commissionToRecall": 449.95,
  "subsidyToRecall": 500.00,
  "auditStatus": "pending",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(订单不存在) | 42201(订单已退货) | 42201(超15天不可退货)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 6.12 退货单列表

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/returns` |
| Method | GET |
| 权限 | 🔒 owner/warehouse_supervisor |

**请求参数：**
```
?auditStatus=pending&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "returnNo": "RT202606140001",
      "originalOrderNo": "SO2026061000123",
      "imei": "356789****12345",
      "returnReason": "7天无理由退货",
      "returnType": "full_return",
      "refundAmount": 8999.00,
      "auditStatus": "pending",
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.13 退货单详情

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/returns/{returnNo}` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "returnNo": "RT202606140001",
  "originalOrderNo": "SO2026061000123",
  "originalOrderDetail": {
    "imei": "356789****12345",
    "model": "iPhone 16 Pro",
    "salePrice": 8999.00,
    "saleDate": "2026-06-10T15:30:00.000Z"
  },
  "returnReason": "7天无理由退货",
  "returnType": "full_return",
  "refundAmount": 8999.00,
  "pointsRecalled": 5699,
  "commissionRecalled": 449.95,
  "subsidyRecalled": 500.00,
  "auditStatus": "approved",
  "auditedBy": "老板",
  "auditedAt": "2026-06-14T14:00:00.000Z",
  "completedAt": "2026-06-14T16:00:00.000Z",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.14 退货审核

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/returns/{returnNo}/audit` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "action": "approved",
  "remark": "符合退货条件"
}
```

**响应参数：**
```json
{
  "returnNo": "RT202606140001",
  "auditStatus": "approved",
  "completedSteps": [
    "imei_stock状态: sold→returned→in_stock",
    "point_ledger冲正: -5699分",
    "commission_ledger追回: -449.95",
    "subsidy_record追回: -500.00",
    "payment_flow退款: -8999.00",
    "notification_outbox: 退款短信通知"
  ],
  "completedAt": "2026-06-14T16:00:00.000Z"
}
```

**错误码：** 40401 | 42201(非pending状态)

**事务：** 🔄(return_order UPDATE + sale_order UPDATE return_status + imei_stock UPDATE + point_ledger INSERT冲正 + payment_flow INSERT退款 + national_subsidy UPDATE + commission_ledger INSERT调整 + notification_outbox INSERT + stock_ledger INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡(audit_status检查)

---

### 6.15 C端会员查询自己的订单

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/my-orders` |
| Method | GET |
| 权限 | 🔒 会员端JWT |

**请求参数：**
```
?page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "orderNo": "SO2026061000123",
      "imei": "356789****12345",
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "salePrice": 8999.00,
      "actualPaid": 8969.00,
      "createdAt": "2026-06-10T15:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 6.16 退货单撤销（软删除）

| 属性 | 值 |
|------|-----|
| URL | `/api/sale/returns/{returnNo}` |
| Method | DELETE |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "reason": "误操作撤销"
}
```
- 仅 `pending` 状态可撤销

**响应参数：**
```json
{
  "returnNo": "RT202606140001",
  "message": "退货单已撤销",
  "deletedAt": "2026-06-14T17:00:00.000Z"
}
```

**错误码：** 42201(已审核不可撤销)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡

---

## 7. Finance — 财务模块（8个接口）

### 7.1 毛利汇总

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/gross-profit` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?period=today
```
- `period`: `today` / `this_week` / `this_month` / `custom`
- `startDate`, `endDate`: period=custom时必填

**响应参数：**
```json
{
  "period": "today",
  "dateRange": "2026-06-14",
  "totalRevenue": 186500.00,
  "totalCostSnapshot": 152300.00,
  "totalSubsidy": 8500.00,
  "totalCommission": 9325.00,
  "grossProfit": 33375.00,
  "profitMargin": "17.90%",
  "orderCount": 14,
  "avgOrderValue": 13321.43,
  "refundAmount": 0,
  "netProfit": 33375.00
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.2 毛利日报

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/gross-profit/daily` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?month=2026-06
```

**响应参数：**
```json
{
  "month": "2026-06",
  "daily": [
    {"date": "2026-06-14", "revenue": 186500.00, "cost": 152300.00, "subsidy": 8500.00, "commission": 9325.00, "profit": 33375.00, "orders": 14},
    {"date": "2026-06-13", "revenue": 165000.00, "cost": 134000.00, "subsidy": 7000.00, "commission": 8250.00, "profit": 29750.00, "orders": 12}
  ],
  "monthTotal": {"revenue": 500000.00, "profit": 92000.00, "orders": 45}
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.3 毛利月报

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/gross-profit/monthly` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?year=2026
```

**响应参数：**
```json
{
  "year": "2026",
  "monthly": [
    {"month": "2026-06", "revenue": 1500000.00, "profit": 276000.00, "orders": 170},
    {"month": "2026-05", "revenue": 1420000.00, "profit": 260000.00, "orders": 160}
  ],
  "yearTotal": {"revenue": 8500000.00, "profit": 1560000.00, "orders": 950}
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.4 收款流水列表（财务视角）

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/payment-flow` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?method=wechat&reconcileStatus=mismatched&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：** 同 6.7

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.5 收款对账

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/payment-flow/reconcile` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?date=2026-06-14
```

**响应参数：**
```json
{
  "date": "2026-06-14",
  "totalPayments": 28,
  "totalAmount": 186500.00,
  "matched": 26,
  "mismatched": 1,
  "pending": 1,
  "mismatchDetails": [
    {"paymentNo": "PF20260614005", "orderAmount": 8999.00, "paymentAmount": 9000.00, "diff": 1.00}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.6 日终对账结果

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/daily-reconcile` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?date=2026-06-14&checkType=stock_vs_order
```

**响应参数：**
```json
{
  "items": [
    {
      "reconcileDate": "2026-06-14",
      "checkType": "stock_vs_order",
      "expectedCount": 5000,
      "actualCount": 5000,
      "diffCount": 0,
      "status": "pass",
      "createdAt": "2026-06-15T02:00:00.000Z"
    },
    {
      "reconcileDate": "2026-06-14",
      "checkType": "points_vs_ledger",
      "expectedCount": 10000,
      "actualCount": 10000,
      "diffCount": 0,
      "status": "pass",
      "createdAt": "2026-06-15T02:00:01.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 7.7 执行日终对账（定时任务）

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/daily-reconcile/execute` |
| Method | POST |
| 权限 | 🔒 系统定时任务 |

**请求参数：**
```json
{
  "date": "2026-06-14"
}
```

**响应参数：**
```json
{
  "date": "2026-06-14",
  "results": [
    {"checkType": "stock_vs_order", "status": "pass", "diffCount": 0},
    {"checkType": "points_vs_ledger", "status": "fail", "diffCount": 2},
    {"checkType": "payment_vs_order", "status": "pass", "diffCount": 0},
    {"checkType": "subsidy_vs_sales", "status": "pass", "diffCount": 0}
  ],
  "overallStatus": "fail",
  "alertSent": true,
  "completedAt": "2026-06-15T02:00:05.000Z"
}
```

**事务：** 🔄(daily_reconcile批量INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡(UK shop_id+date+check_type)

---

### 7.8 资金流水汇总

| 属性 | 值 |
|------|-----|
| URL | `/api/finance/cash-flow` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "cashIn": {
    "totalSales": 186500.00,
    "subsidyIncome": 8500.00,
    "total": 195000.00
  },
  "cashOut": {
    "refunds": 0,
    "commissionPaid": 0,
    "total": 0
  },
  "netCashFlow": 195000.00,
  "byDay": [
    {"date": "2026-06-14", "inflow": 195000.00, "outflow": 0, "net": 195000.00}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 8. Commission — 提成模块（10个接口）

### 8.1 提成规则列表

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/rules` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "brand": "Apple",
      "model": null,
      "minPrice": 0,
      "maxPrice": null,
      "commissionType": "percentage",
      "commissionValue": 5.00,
      "priority": 10,
      "status": 1,
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "brand": null,
      "model": null,
      "minPrice": null,
      "maxPrice": null,
      "commissionType": "fixed",
      "commissionValue": 50.00,
      "priority": 0,
      "status": 1,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 8.2 新建提成规则

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/rules` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "brand": "Apple",
  "model": "iPhone 16 Pro",
  "minPrice": 8000,
  "maxPrice": 12000,
  "commissionType": "tiered",
  "commissionValue": 3.00,
  "priority": 20
}
```

**响应参数：** 创建后的规则详情

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 8.3 编辑提成规则

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/rules/{id}` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：** 同 8.2

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 8.4 停用提成规则

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/rules/{id}` |
| Method | DELETE |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "message": "规则已停用",
  "status": 0
}
```

**事务：** 否 | **审计：** 📝 | **幂等：** ⚡

---

### 8.5 销售员业绩查询

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/performance` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?period=this_month&sortBy=totalSales&sortOrder=DESC
```

**响应参数：**
```json
{
  "period": "2026-06",
  "items": [
    {
      "salespersonId": 2,
      "name": "销售员B",
      "orderCount": 42,
      "totalSales": 523600.00,
      "estimatedCommission": 26180.00,
      "actualCommission": 26180.00,
      "returnCount": 0,
      "returnAdjustment": 0
    },
    {
      "salespersonId": 3,
      "name": "销售员C",
      "orderCount": 35,
      "totalSales": 420000.00,
      "estimatedCommission": 21000.00,
      "actualCommission": 20000.00,
      "returnCount": 1,
      "returnAdjustment": -1000.00
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 8.6 单人业绩详情

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/performance/{salespersonId}` |
| Method | GET |
| 权限 | 🔒 owner/本人 |

**请求参数：**
```
?period=this_month
```

**响应参数：**
```json
{
  "salespersonId": 2,
  "name": "销售员B",
  "period": "2026-06",
  "orderCount": 42,
  "totalSales": 523600.00,
  "estimatedCommission": 26180.00,
  "actualCommission": 26180.00,
  "dailyPerformance": [
    {"date": "2026-06-14", "orders": 8, "sales": 105000.00, "commission": 5250.00},
    {"date": "2026-06-13", "orders": 6, "sales": 78000.00, "commission": 3900.00}
  ],
  "topSellingModels": [
    {"model": "iPhone 16 Pro", "count": 15, "totalSales": 134985.00},
    {"model": "Huawei Mate 70", "count": 10, "totalSales": 89990.00}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 8.7 提成流水列表

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/ledger` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?salespersonId=2&settlementPeriod=2026-06&status=confirmed&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 100,
      "salespersonId": 2,
      "salespersonName": "销售员B",
      "settlementPeriod": "2026-06",
      "orderNo": "SO2026061400124",
      "estimatedCommission": 449.95,
      "adjustment": 0,
      "actualCommission": 449.95,
      "status": "confirmed",
      "confirmedAt": "2026-07-01T10:00:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 8.8 创建月度结算

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/settlement` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "settlementPeriod": "2026-06",
  "salespersonId": 2
}
```

**响应参数：**
```json
{
  "settlementPeriod": "2026-06",
  "salespersonId": 2,
  "salespersonName": "销售员B",
  "orderCount": 42,
  "estimatedTotal": 26180.00,
  "returnAdjustment": 0,
  "actualTotal": 26180.00,
  "status": "pending",
  "createdAt": "2026-07-01T09:00:00.000Z"
}
```

**事务：** 🔄(commission_ledger批量INSERT) | **审计：** 📝(system_log) | **幂等：** ⚡(UK salesperson_id+settlement_period)

---

### 8.9 结算记录列表

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/settlements` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?settlementPeriod=2026-06&status=confirmed&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "settlementPeriod": "2026-06",
      "salespersonName": "销售员B",
      "orderCount": 42,
      "estimatedTotal": 26180.00,
      "actualTotal": 26180.00,
      "status": "confirmed",
      "confirmedBy": "老板",
      "confirmedAt": "2026-07-01T10:00:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 8.10 确认结算

| 属性 | 值 |
|------|-----|
| URL | `/api/commission/settlements/{id}/confirm` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "adjustment": -1000.00,
  "adjustmentReason": "扣除上月退货影响"
}
```

**响应参数：**
```json
{
  "settlementPeriod": "2026-06",
  "salespersonName": "销售员B",
  "actualTotal": 25180.00,
  "status": "confirmed",
  "confirmedBy": "老板",
  "confirmedAt": "2026-07-01T10:00:00.000Z"
}
```

**事务：** 🔄(commission_ledger UPDATE status + adjustment) | **审计：** 📝(system_log) | **幂等：** ⚡

---

## 9. Subsidy — 国补模块（10个接口）

### 9.1 创建国补申请

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "orderNo": "SO2026061400124",
  "imei": "356789012345678",
  "appliedAmount": 500.00,
  "remark": "2026年数码产品消费补贴"
}
```

**响应参数：**
```json
{
  "id": 1,
  "subsidyNo": "SUB202606140001",
  "orderNo": "SO2026061400124",
  "appliedAmount": 500.00,
  "status": "pending_submit",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40401(订单不存在) | 40901(订单已申请国补) | 42201(订单已退货)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(UK order_no)

---

### 9.2 国补记录列表

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?status=approved&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "subsidyNo": "SUB202606140001",
      "orderNo": "SO2026061400124",
      "imei": "356789****12345",
      "appliedAmount": 500.00,
      "approvedAmount": 500.00,
      "status": "disbursed",
      "disbursedAt": "2026-06-20T10:00:00.000Z"
    }
  ],
  "total": 250,
  "page": 1,
  "pageSize": 20,
  "totalPages": 13
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 9.3 国补详情

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "subsidyNo": "SUB202606140001",
  "orderNo": "SO2026061400124",
  "imei": "356789****12345",
  "appliedAmount": 500.00,
  "approvedAmount": 500.00,
  "status": "disbursed",
  "statusTimeline": [
    {"status": "pending_submit", "time": "2026-06-14T10:30:00.000Z"},
    {"status": "submitted", "time": "2026-06-15T09:00:00.000Z"},
    {"status": "under_review", "time": "2026-06-15T10:00:00.000Z"},
    {"status": "approved", "time": "2026-06-18T14:00:00.000Z"},
    {"status": "disbursed", "time": "2026-06-20T10:00:00.000Z"}
  ],
  "externalRefNo": "GOV20260620001",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 9.4 编辑国补申请

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "appliedAmount": 600.00,
  "remark": "调整为600元补贴"
}
```
- 仅 `pending_submit` 状态可编辑

**事务：** 否 | **审计：** 📝 | **幂等：** 否

---

### 9.5 提交审批

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}/submit` |
| Method | POST |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "subsidyNo": "SUB202606140001",
  "status": "submitted",
  "submittedAt": "2026-06-15T09:00:00.000Z"
}
```

**错误码：** 42201(非pending_submit状态)

**事务：** 否 | **审计：** 📝 | **幂等：** ⚡

---

### 9.6 审批通过

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}/approve` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "approvedAmount": 500.00,
  "remark": "符合补贴条件"
}
```

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡

---

### 9.7 审批驳回

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}/reject` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "remark": "发票信息不完整，请补充"
}
```

**事务：** 否 | **审计：** 📝 | **幂等：** ⚡

---

### 9.8 确认拨付

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}/disburse` |
| Method | POST |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "externalRefNo": "GOV20260620001",
  "disbursedAmount": 500.00
}
```

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡

---

### 9.9 追回国补（退货触发）

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/records/{id}/recall` |
| Method | POST |
| 权限 | 🔒 系统内部调用 |

**请求参数：**
```json
{
  "reason": "订单退货，追回补贴",
  "returnNo": "RT202606140001"
}
```

**事务：** 🔄(national_subsidy UPDATE status + recalled_at) | **审计：** 📝(system_log) | **幂等：** ⚡

---

### 9.10 国补汇总统计

| 属性 | 值 |
|------|-----|
| URL | `/api/subsidy/summary` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "totalApplied": 150000.00,
  "totalApproved": 145000.00,
  "totalDisbursed": 120000.00,
  "totalRecalled": 5000.00,
  "pendingCount": 5,
  "pendingAmount": 25000.00,
  "byStatus": {
    "pending_submit": 3,
    "submitted": 5,
    "under_review": 8,
    "approved": 30,
    "rejected": 2,
    "disbursed": 150,
    "recalled": 3
  }
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 10. TradeIn — 以旧换新模块（6个接口）

### 10.1 旧机估价

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/appraisal` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "oldBrand": "Apple",
  "oldModel": "iPhone 14",
  "oldCondition": "良好",
  "oldImei": "123456789012345"
}
```

**响应参数：**
```json
{
  "estimatedValue": 2000.00,
  "valueRange": {"min": 1800.00, "max": 2200.00},
  "factors": [
    {"factor": "外观成色", "score": "良好", "adjustment": 0},
    {"factor": "功能检测", "score": "正常", "adjustment": 0}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 10.2 创建以旧换新订单

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/orders` |
| Method | POST |
| 权限 | 🔒 salesperson/owner |

**请求参数：**
```json
{
  "orderNo": "SO2026061400124",
  "oldImei": "123456789012345",
  "oldBrand": "Apple",
  "oldModel": "iPhone 14",
  "oldCondition": "良好",
  "appraisedValue": 2000.00,
  "actualDeduction": 2000.00,
  "remark": "屏幕轻微划痕"
}
```

**响应参数：**
```json
{
  "id": 1,
  "orderNo": "SO2026061400124",
  "appraisedValue": 2000.00,
  "actualDeduction": 2000.00,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**错误码：** 40901(该订单已有以旧换新) | 40401(订单不存在)

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** ⚡(order_no唯一)

---

### 10.3 以旧换新订单列表

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/orders` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 1,
      "orderNo": "SO2026061400124",
      "oldBrand": "Apple",
      "oldModel": "iPhone 14",
      "oldCondition": "良好",
      "appraisedValue": 2000.00,
      "actualDeduction": 2000.00,
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 10.4 以旧换新详情

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/orders/{id}` |
| Method | GET |
| 权限 | 🔒 owner |

**响应参数：**
```json
{
  "id": 1,
  "orderNo": "SO2026061400124",
  "newDeviceImei": "356789****12345",
  "oldImei": "123456789012345",
  "oldBrand": "Apple",
  "oldModel": "iPhone 14",
  "oldCondition": "良好",
  "appraisedValue": 2000.00,
  "actualDeduction": 2000.00,
  "remark": "屏幕轻微划痕",
  "newDevicePrice": 8999.00,
  "finalPaid": 6999.00,
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

### 10.5 更新以旧换新订单

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/orders/{id}` |
| Method | PUT |
| 权限 | 🔒 owner |

**请求参数：**
```json
{
  "actualDeduction": 1800.00,
  "remark": "复检发现屏幕划痕严重，下调200元"
}
```

**事务：** 否 | **审计：** 📝(system_log) | **幂等：** 否

---

### 10.6 以旧换新汇总

| 属性 | 值 |
|------|-----|
| URL | `/api/trade-in/summary` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?startDate=2026-06-01&endDate=2026-06-14
```

**响应参数：**
```json
{
  "totalOrders": 15,
  "totalAppraisedValue": 35000.00,
  "totalDeduction": 34800.00,
  "avgDeduction": 2320.00,
  "byBrand": [
    {"brand": "Apple", "count": 10, "totalValue": 25000.00},
    {"brand": "Huawei", "count": 5, "totalValue": 10000.00}
  ]
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 11. Agent — AI智能体模块（8个接口）

所有AI接口均使用 `ai_readonly` Token，仅允许GET方法。

### 11.1 AI对话

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/chat` |
| Method | GET |
| 权限 | 🔒 全部角色 | 👁 |

**请求参数：**
```
?query=iPhone 16 Pro 还有货吗&role=owner&phone=13800000001&conversationId=conv_abc123
```

**响应参数：**
```json
{
  "conversationId": "conv_abc123",
  "function": "query_inventory",
  "confidence": 0.98,
  "reply": "iPhone 16 Pro 目前库存情况如下：\n\n• 原色钛金属 256GB：12 台（货位 A-03、B-07、C-01）\n• 原色钛金属 512GB：5 台（货位 A-03）\n• 黑色钛金属 256GB：8 台（货位 A-05、B-02）\n• 黑色钛金属 1TB：2 台（货位 A-05）\n\n共 4 个 SKU 有现货，总计 27 台。",
  "result": {
    "items": [
      {"model": "iPhone 16 Pro", "color": "原色钛金属", "spec": "256GB", "inStockCount": 12, "locations": ["A-03", "B-07", "C-01"]}
    ]
  },
  "metadata": {"latencyMs": 320, "model": "claude-opus-4"}
}
```

**错误码：** 50301(AI服务不可用) | 42901(AI请求频率超限)

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

**置信度<85% 时的响应：**
```json
{
  "conversationId": "conv_abc123",
  "function": null,
  "confidence": 0.52,
  "reply": "您的问题比较专业，正在为您转接人工客服...",
  "transfer": {
    "ticketId": "TK20260614001",
    "reason": "confidence_below_threshold",
    "estimatedWaitMinutes": 2
  }
}
```

---

### 11.2 AI查库存

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/inventory/query` |
| Method | GET |
| 权限 | 🔒 ai_readonly | 👁 |

**请求参数：**
```
?keyword=iPhone 16 Pro&location=A-03
```

**响应参数：**
```json
{
  "function": "query_inventory",
  "result": [
    {
      "model": "iPhone 16 Pro",
      "color": "原色钛金属",
      "spec": "256GB",
      "inStockCount": 12,
      "locations": ["A-03", "B-07", "C-01"]
    }
  ],
  "searchedAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

---

### 11.3 AI查毛利

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/finance/gross-profit` |
| Method | GET |
| 权限 | 🔒 ai_readonly | 👁 |

**请求参数：**
```
?period=today
```

**响应参数：**
```json
{
  "function": "query_gross_profit",
  "result": {
    "period": "today",
    "dateRange": "2026-06-14",
    "totalRevenue": 186500.00,
    "totalCost": 152300.00,
    "totalSubsidy": 8500.00,
    "totalCommission": 9325.00,
    "grossProfit": 33375.00,
    "orderCount": 14
  }
}
```
- **注意：不返回 `cost_price` 明细**

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

---

### 11.4 AI查会员积分

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/member/points` |
| Method | GET |
| 权限 | 🔒 ai_readonly | 👁 |

**请求参数：**
```
?phone=13812345678
```

**响应参数：**
```json
{
  "function": "query_member_points",
  "result": {
    "phone": "138****5678",
    "name": "张先生",
    "totalPoints": 3680,
    "recentEarn": [
      {"type": "消费得积分", "amount": 5699, "time": "2026-06-10T15:30:00.000Z", "model": "iPhone 16 Pro"}
    ],
    "recentRedeem": []
  }
}
```
- **注意：手机号、IMEI 自动脱敏**

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

---

### 11.5 AI查会员订单

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/member/orders` |
| Method | GET |
| 权限 | 🔒 ai_readonly | 👁 |

**请求参数：**
```
?phone=13812345678
```

**响应参数：**
```json
{
  "function": "query_member_orders",
  "result": {
    "phone": "138****5678",
    "orders": [
      {
        "orderNo": "SO2026061000123",
        "model": "iPhone 16 Pro",
        "color": "原色钛金属",
        "spec": "256GB",
        "price": 8999.00,
        "time": "2026-06-10T15:30:00.000Z",
        "imeiSnapshot": "356789****12345"
      }
    ]
  }
}
```

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

---

### 11.6 AI查销售员业绩

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/finance/performance` |
| Method | GET |
| 权限 | 🔒 ai_readonly | 👁 |

**请求参数：**
```
?name=李明&period=this_month
```

**响应参数：**
```json
{
  "function": "query_salesperson_performance",
  "result": {
    "name": "李明",
    "period": "this_month",
    "orderCount": 42,
    "totalSales": 523600.00,
    "totalCommission": 12680.00
  }
}
```

**事务：** 否 | **审计：** 📝(ai_chat_log) | **幂等：** 是

---

### 11.7 转人工客服

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/transfer-human` |
| Method | POST |
| 权限 | 🔒 ai_readonly / 全部角色 |

**请求参数：**
```json
{
  "userPhone": "13812345678",
  "lastQuery": "这个手机跟华为那个比哪个好",
  "confidence": 0.52,
  "conversationSummary": "用户咨询竞品对比，AI未能匹配到知识库答案",
  "conversationId": "conv_abc123"
}
```

**响应参数：**
```json
{
  "ticketId": "TK20260614001",
  "status": "queued",
  "message": "已为您转接人工客服，预计等待 2 分钟",
  "createdAt": "2026-06-14T10:30:00.000Z"
}
```

**事务：** 否 | **审计：** 📝(ai_chat_log + system_log) | **幂等：** 否

---

### 11.8 AI对话历史

| 属性 | 值 |
|------|-----|
| URL | `/api/ai/chat/history` |
| Method | GET |
| 权限 | 🔒 owner |

**请求参数：**
```
?userId=1&startDate=2026-06-01&endDate=2026-06-14&page=1&pageSize=20
```

**响应参数：**
```json
{
  "items": [
    {
      "id": 5001,
      "userId": 1,
      "userRole": "owner",
      "query": "iPhone 16 Pro 还有货吗",
      "intent": "query_inventory",
      "functionCalled": "query_inventory",
      "confidence": 0.98,
      "reply": "iPhone 16 Pro 目前库存...",
      "isTransferred": false,
      "latencyMs": 320,
      "createdAt": "2026-06-14T10:30:00.000Z"
    }
  ],
  "total": 500,
  "page": 1,
  "pageSize": 20,
  "totalPages": 25
}
```

**事务：** 否 | **审计：** 否 | **幂等：** 是

---

## 附录

### A. 接口汇总

| 模块 | 接口数 | 事务接口 | 幂等接口 |
|------|:--:|:--:|:--:|
| Auth | 8 | 0 | 1 |
| Member | 13 | 2 | 4 |
| Point | 9 | 4 | 5 |
| Inventory | 16 | 2 | 4 |
| Purchase | 10 | 3 | 4 |
| Sale | 16 | 4 | 6 |
| Finance | 8 | 1 | 1 |
| Commission | 10 | 2 | 4 |
| Subsidy | 10 | 1 | 7 |
| TradeIn | 6 | 0 | 1 |
| Agent | 8 | 0 | 0 |
| **合计** | **114** | **19** | **37** |

### B. 事务接口清单（19个需REPEATABLE READ事务）

1. `POST /api/members/register` — member + member_referral
2. `POST /api/members/referral-reward` — member_referral + 2×point_ledger + 2×member
3. `POST /api/points/redeem` — point_ledger + member
4. `POST /api/points/exchange` — point_ledger + member
5. `POST /api/points/manual-adjust` — point_ledger + member
6. `POST /api/points/execute-expire` — point_ledger + member + points_expire_log (分批)
7. `POST /api/inventory/stock-check/{id}/scan` — stock_check_item + stock_check
8. `POST /api/inventory/stock-check/{id}/commit` — stock_check + stock_check_item
9. `POST /api/purchase/inbound/audit/{id}` — imei_stock + audit_log
10. `POST /api/purchase/orders` — purchase_order + purchase_item
11. `POST /api/purchase/orders/{id}/receive` — purchase_order + imei_stock + stock_ledger
12. **`POST /api/sale/outbound/scan`** — 最复杂：imei_stock + sale_order + sale_item + point_ledger + member + payment_flow + trade_in_order + notification_outbox + stock_ledger
13. `DELETE /api/sale/orders/{orderNo}` — sale_order + imei_stock + point_ledger + payment_flow + stock_ledger
14. `POST /api/sale/returns/{returnNo}/audit` — return_order + sale_order + imei_stock + point_ledger + payment_flow + national_subsidy + commission_ledger + notification_outbox + stock_ledger
15. `POST /api/finance/daily-reconcile/execute` — daily_reconcile
16. `POST /api/commission/settlement` — commission_ledger
17. `POST /api/commission/settlements/{id}/confirm` — commission_ledger
18. `POST /api/subsidy/records/{id}/recall` — national_subsidy
19. `POST /api/sale/payment` — payment_flow（单表，简单事务）

### C. 审计日志覆盖

所有 POST/PUT/DELETE 接口均通过 `system_log` 拦截器自动记录（操作人/模块/动作/目标/时间/IP），以下操作额外写入专项审计表：

| 操作 | 审计表 | 记录内容 |
|------|--------|----------|
| 入库申请/审核 | `audit_log` | 操作人/IMEI/动作/驳回原因 |
| 积分调整 | `system_log` + 特殊标记 | 操作人/会员/调整量/原因 |
| AI查询 | `ai_chat_log` | 用户/意图/置信度/延迟 |
| AI越权尝试 | `system_log`(告警级别) | 方法/路径/Token信息 |
| 售价异常 | `system_log`(告警级别) | 订单号/售价/成本/偏差 |
