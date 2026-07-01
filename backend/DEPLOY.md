# 3C数码零售系统 · 生产环境部署指南

> 目标平台：腾讯云 | 容器：Docker Compose | Web：Nginx | 缓存：Redis | 数据库：MySQL 8.0

---

## 目录

1. [部署前准备](#一部署前准备)
2. [配置环境变量](#二配置环境变量)
3. [SSL 证书部署](#三ssl-证书部署)
4. [启动服务](#四启动服务)
5. [数据库初始化](#五数据库初始化)
6. [验证部署](#六验证部署)
7. [配置备份](#七配置备份)
8. [配置监控告警](#八配置监控告警)
9. [运维手册](#九运维手册)
10. [安全清单](#十安全清单)

---

## 一、部署前准备

### 1.1 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 40 GB SSD | 100 GB SSD |
| 系统 | Ubuntu 22.04 / CentOS 8 | Ubuntu 22.04 |
| 带宽 | 3 Mbps | 5 Mbps+ |

### 1.2 安装 Docker 环境

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | bash

# 2. 启动 Docker 并设置开机自启
sudo systemctl enable docker
sudo systemctl start docker

# 3. 安装 Docker Compose 插件
sudo apt-get update && sudo apt-get install -y docker-compose-plugin

# 4. 验证
docker --version        # >= 24.0
docker compose version  # >= 2.0

# 5. 安装辅助工具
sudo apt-get install -y htop vim curl unzip python3-pip
pip3 install coscmd     # 腾讯云 COS CLI（用于远程备份）
```

### 1.3 安全组配置

在腾讯云控制台 → 安全组 → 添加规则：

| 来源 | 端口 | 协议 | 说明 |
|------|------|------|------|
| 0.0.0.0/0 | 80 | TCP | HTTP（用于证书验证和 HTTPS 重定向） |
| 0.0.0.0/0 | 443 | TCP | HTTPS |
| 办公 IP | 22 | TCP | SSH 管理 |

**关键：禁止 3306（MySQL）、6379（Redis）、3000（App）的公网访问。**

### 1.4 创建目录结构

```bash
mkdir -p /opt/3c-retail
cd /opt/3c-retail

# Git 克隆（或手动上传项目文件）
git clone https://github.com/LDK-SE/Little_Routine.git .
cd backend
```

---

## 二、配置环境变量

### 2.1 生成密钥

```bash
# JWT Secret（64 字符随机串）
openssl rand -hex 32

# 数据库密码（24 字符随机串）
openssl rand -base64 24

# Redis 密码
openssl rand -base64 24
```

### 2.2 创建 .env 文件

```bash
cp .env.example .env
chmod 600 .env    # 仅 root 可读写
```

编辑 `.env`，填入真实值：

```ini
# ---- 应用 ----
APP_NAME=3c-retail-api
APP_PORT=3000
APP_ENV=production
CORS_ORIGIN=https://your-domain.com          # 必填！小程序合法域名

# ---- 数据库 ----
# Docker Compose 用此连接，host 填 mysql（容器名）
DATABASE_URL="mysql://3capp:生成的密码@mysql:3306/3c_retail?charset=utf8mb4&connection_limit=20"

# ---- Redis ----
REDIS_PASSWORD=生成的密码

# ---- JWT ----
JWT_SECRET=生成的64字符随机串
JWT_EXPIRES_IN=8h                            # 访问令牌 8 小时
JWT_REFRESH_EXPIRES_IN=7d                    # 刷新令牌 7 天

# ---- 日志 ----
LOG_LEVEL=info                               # 排查问题时可临时改为 debug

# ---- Swagger ----
SWAGGER_ENABLED=false                        # 生产环境建议关闭
# 如果启用，必须配置鉴权：
# SWAGGER_AUTH=true
# SWAGGER_USER=admin
# SWAGGER_PASS=强密码

# ---- Dify AI 平台 ----
DIFY_BASE_URL=https://dify.your-domain.com/v1
DIFY_API_KEY=app-你的Dify应用密钥

# ---- Docker Compose ----
MYSQL_ROOT_PASSWORD=生成的root密码
MYSQL_DATABASE=3c_retail
MYSQL_USER=3capp
MYSQL_PASSWORD=生成的用户密码
```

### 2.3 验证配置

```bash
# 检查所有必填变量是否已填写（不应有 change-me 或 your- 字样）
grep -E "change-me|your-domain|your-dify|your-admin|your-strong" .env && echo "还有未修改的占位值！" || echo "配置检查通过"
```

---

## 三、SSL 证书部署

### 方式 A：腾讯云免费 SSL 证书（推荐）

1. 登录 [SSL 证书控制台](https://console.cloud.tencent.com/ssl)
2. 申请免费 TrustAsia 证书（1 年有效）
3. 验证域名所有权（DNS 验证最快）
4. 下载 **Nginx 版本** 证书
5. 上传到服务器：

```bash
# 将下载的 .crt 和 .key 文件重命名后放入 ssl 目录
cp 你的域名_bundle.crt /opt/3c-retail/backend/nginx/ssl/fullchain.pem
cp 你的域名.key        /opt/3c-retail/backend/nginx/ssl/privkey.pem
chmod 600 /opt/3c-retail/backend/nginx/ssl/*.pem
```

6. Nginx 首次启动时会自动加载这些证书

### 方式 B：自签名证书（测试用）

如果尚未获取正式证书，`ssl-init.sh` 会在 Nginx 首次启动时自动生成 90 天有效的自签名证书。浏览器会提示不安全，仅用于临时测试。

### 方式 C：Let's Encrypt 自动续签

```yaml
# docker-compose.certbot.yml
services:
  certbot:
    image: certbot/certbot
    volumes:
      - ./nginx/ssl:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h; done'"
```

---

## 四、启动服务

### 4.1 构建并启动

```bash
cd /opt/3c-retail/backend

# 构建镜像 + 后台启动所有服务
docker compose up -d --build
```

启动顺序（由 `depends_on` + `condition: service_healthy` 保证）：
```
MySQL 就绪 → App 就绪 → Nginx 就绪
  (40s)        (~30s)       (~5s)
```

### 4.2 查看状态

```bash
# 各服务运行状态
docker compose ps

# 预期输出：
# NAME               STATUS
# 3c-retail-mysql    Up (healthy)
# 3c-retail-redis    Up (healthy)
# 3c-retail-api      Up (healthy)
# 3c-retail-nginx    Up

# 实时日志
docker compose logs -f app
docker compose logs -f nginx
```

### 4.3 常见启动问题

| 现象 | 原因 | 解决 |
|------|------|------|
| app 反复重启 | CORS_ORIGIN 未配置 | `.env` 中设置 `CORS_ORIGIN` |
| app 反复重启 | JWT_SECRET / REDIS_PASSWORD 未配置 | 检查 `.env` 必填变量 |
| nginx 起不来 | SSL 证书不存在且自签名失败 | 检查 `nginx/ssl/` 目录权限 |
| MySQL 起不来 | 数据目录权限问题 | `chown -R 999:999 mysql-data/` |
| `container unhealthy` | 健康检查失败 | `docker compose logs app` 查看错误 |

---

## 五、数据库初始化

### 5.1 执行数据库迁移

```bash
# 首次部署必须执行迁移，创建表结构
docker compose exec app npx prisma migrate deploy

# 查看迁移状态
docker compose exec app npx prisma migrate status
```

### 5.2 导入初始数据（可选）

```bash
# 如果有种子数据脚本
docker compose exec app npx ts-node prisma/seed.ts
```

### 5.3 分区表检查

5 张高写入量表使用 MySQL 分区，迁移后需检查分区是否生效：

```bash
docker compose exec mysql mysql -u root -p -e "
  SELECT TABLE_NAME, PARTITION_NAME, PARTITION_METHOD
  FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = '3c_retail'
    AND PARTITION_METHOD IS NOT NULL;
"
```

应看到 `sale_order`、`sale_item`、`point_ledger`、`system_log`、`ai_chat_log` 五张表。

如果某张表没有分区，参考 `scripts/check-partitions.sh` 检查迁移 SQL，手动补充 `PARTITION BY RANGE (TO_DAYS(created_at))` 语句。

### 5.4 创建初始管理员

```bash
# 方式 1：使用注册接口（推荐，走完整业务逻辑）
curl -X POST https://your-domain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "13800000001",
    "password": "强密码至少8位",
    "name": "系统管理员",
    "shopId": 1
  }'

# 方式 2：数据库直接插入
docker compose exec mysql mysql -u root -p 3c_retail -e "
  INSERT INTO shop (name, address, phone) VALUES ('总店', '默认地址', '13800000001');
  -- 注册后需手动为用户分配角色
"
```

---

## 六、验证部署

### 6.1 基础设施健康检查

```bash
# 综合健康检查（无需认证）
curl -s https://your-domain.com/api/v1/ai/health | python3 -m json.tool
```

预期输出：
```json
{
    "dify": {
        "available": true,
        "latencyMs": 45
    },
    "status": "ok",
    "uptime": 3600,
    "checks": {
        "database": {
            "status": "ok",
            "latencyMs": 3
        },
        "redis": {
            "status": "ok",
            "latencyMs": 1
        }
    }
}
```

> **若 `status` 为 `degraded` 且 HTTP 返回 503**：说明 DB 或 Redis 连通异常，Docker 将标记容器为 unhealthy。

### 6.2 登录测试

```bash
curl -X POST https://your-domain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000001","password":"你的密码"}'
```

预期返回 `accessToken` 和 `refreshToken`。

### 6.3 安全验证

```bash
# 确认 HTTP 自动重定向到 HTTPS
curl -I http://your-domain.com
# 应返回 301 Location: https://...

# 确认安全头
curl -I https://your-domain.com/api/v1/ai/health | grep -E "strict-transport|x-frame|x-content|x-xss|referrer-policy"
# 应返回 6 个安全头

# 确认 Nginx 不泄露版本号
curl -I https://your-domain.com | grep -i "server:"
# 应返回 "Server: nginx"（无版本号）
```

### 6.4 Swagger 文档（如已启用）

```bash
# 浏览器访问（需输入 SWAGGER_USER / SWAGGER_PASS）
https://your-domain.com/api/docs/
```

---

## 七、配置备份

### 7.1 备份策略

| 类型 | 频率 | 保留 | 存储 |
|------|------|------|------|
| 全量备份 | 每天 02:00 | 30 天 | 本地 + 腾讯云 COS |
| 周备份 | 每周日 03:00 | 90 天 | 腾讯云 COS |
| 备份验证 | 每月 1 日 | - | 本地 |

### 7.2 配置 Crontab

```bash
crontab -e
```

添加：

```
# 每天凌晨 2:00 全量备份 + 上传 COS
0 2 * * * /opt/3c-retail/backend/scripts/backup.sh daily >> /var/log/backup-cron.log 2>&1

# 每周日凌晨 3:00 全量备份
0 3 * * 0 /opt/3c-retail/backend/scripts/backup.sh weekly >> /var/log/backup-cron.log 2>&1

# 每月 1 日凌晨 4:00 验证上一份备份的完整性
0 4 1 * * /opt/3c-retail/backend/scripts/verify-backup.sh >> /var/log/backup-verify.log 2>&1
```

### 7.3 配置 COS 远程备份

```bash
# 初始化 coscmd
coscmd config -a <SecretId> -s <SecretKey> -b <BucketName> -r ap-guangzhou

# 测试上传
coscmd upload /etc/hostname test-hostname.txt
coscmd list

# 在 .env 中配置 COS_BUCKET
echo "COS_BUCKET=3c-retail-backup-1234567890" >> .env
```

### 7.4 手动备份与恢复

```bash
# 手动备份
/opt/3c-retail/backend/scripts/backup.sh manual

# 恢复流程
# 1. 从 COS 下载备份
coscmd download backups/mysql/3c_retail_daily_20260701_020000.sql.gz ./restore.sql.gz

# 2. 解压
gunzip restore.sql.gz

# 3. 停止应用
docker compose stop app

# 4. 导入数据库
docker compose exec -T mysql mysql -u root -p 3c_retail < restore.sql

# 5. 重启应用
docker compose start app
```

---

## 八、配置监控告警

### 8.1 腾讯云 CVM 基础监控

在 [腾讯云监控控制台](https://console.cloud.tencent.com/monitor) 配置告警策略：

| 指标 | 阈值 | 持续 | 通知方式 |
|------|------|------|----------|
| CPU 使用率 | > 80% | 5 分钟 | 短信 + 企业微信 |
| 内存使用率 | > 85% | 5 分钟 | 短信 + 企业微信 |
| 磁盘使用率 | > 80% | - | 企业微信 |
| 外网出带宽 | > 90% | 5 分钟 | 企业微信 |

### 8.2 应用健康探测

```bash
# 创建健康检查脚本
cat > /opt/3c-retail/backend/scripts/health-probe.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://localhost/api/v1/ai/health)
if [ "$STATUS" != "200" ]; then
  echo "[ALERT] 健康检查失败: HTTP $STATUS"
  # 接入企业微信机器人 Webhook 发送告警
  # curl -X POST "$WECHAT_WEBHOOK" -H "Content-Type: application/json" \
  #   -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"健康检查失败: HTTP $STATUS\"}}"
fi
EOF

# 每分钟执行
chmod +x /opt/3c-retail/backend/scripts/health-probe.sh
crontab -e
# 添加: */1 * * * * /opt/3c-retail/backend/scripts/health-probe.sh
```

### 8.3 日志监控（腾讯云 CLS）

```bash
# 安装 CLS LogListener
wget https://loglistener-1254077820.cos.ap-shanghai.myqcloud.com/loglistener-linux-x64-latest.tar.gz
tar -xzf loglistener-linux-x64-latest.tar.gz -C /usr/local/
cd /usr/local/loglistener/tools
./loglistener.sh install

# 在 CLS 控制台创建日志主题后，配置采集路径：
#   nginx:  /opt/3c-retail/backend/nginx/logs/access.log  → JSON 格式
#   应用:   /var/lib/docker/containers/*/*-json.log       → JSON 格式
```

### 8.4 关键日志告警规则（CLS）

| 告警 | 条件 | 级别 |
|------|------|------|
| Nginx 5xx 错误 | 5 分钟内 > 10 条 | 严重 |
| 应用 ERROR 日志 | 5 分钟内 > 10 条 | 严重 |
| API 响应时间 | P95 > 2000ms | 警告 |
| 登录失败 | 5 分钟内 > 20 次 | 警告（可能暴力破解） |

---

## 九、运维手册

### 9.1 常用命令速查

```bash
# ========== 服务管理 ==========
docker compose ps                               # 查看状态
docker compose up -d                            # 启动
docker compose down                             # 停止
docker compose restart app                      # 重启应用
docker compose logs -f app --tail=100           # 最近 100 行日志
docker compose exec app sh                      # 进入应用容器 shell

# ========== 数据库迁移 ==========
docker compose exec app npx prisma migrate deploy    # 执行迁移
docker compose exec app npx prisma migrate status    # 查看状态
docker compose exec app npx prisma studio            # Prisma Studio (端口 5555)

# ========== 扩缩容 ==========
docker compose up -d --scale app=3              # 扩展到 3 个实例
# 注意：多实例需外部负载均衡，单机 Nginx upstream 已支持 least_conn

# ========== 紧急回滚 ==========
docker compose down app                         # 停止应用
docker tag 3c-retail-api:latest 3c-retail-api:broken
docker tag 3c-retail-api:previous 3c-retail-api:latest
docker compose up -d app

# ========== 磁盘清理 ==========
docker system prune -a --volumes --filter "label!=3c-retail"
```

### 9.2 版本升级流程

```bash
# === 零停机升级（蓝绿部署）===

# 1. 拉取最新代码
cd /opt/3c-retail/backend && git pull

# 2. 构建新镜像（打新标签）
docker build -t 3c-retail-api:v1.1 .

# 3. 启动新实例（不同容器名 + 不同端口）
docker run -d \
  --name 3c-retail-api-green \
  --network 3c-retail_app-network \
  --env-file .env \
  -p 127.0.0.1:3001:3000 \
  -v app-logs-green:/app/logs \
  3c-retail-api:v1.1

# 4. 等待新实例健康
sleep 10
curl http://127.0.0.1:3001/api/v1/ai/health

# 5. 执行数据库迁移
docker exec 3c-retail-api-green npx prisma migrate deploy

# 6. 切换流量
# 编辑 nginx/nginx.conf：upstream 端口改为 3001
# docker compose restart nginx

# 7. 观察无误后，停止旧实例
docker stop 3c-retail-api && docker rm 3c-retail-api

# 8. 标记当前版本为 stable
docker tag 3c-retail-api:v1.1 3c-retail-api:latest
```

### 9.3 紧急回滚

```bash
# 1. 回滚数据库（如迁移有问题）
gunzip /data/backup/mysql/3c_retail_daily_恢复日期.sql.gz
docker compose stop app
docker compose exec -T mysql mysql -u root -p 3c_retail < 3c_retail_daily_恢复日期.sql

# 2. 切回旧镜像
docker compose down app
docker tag 3c-retail-api:previous 3c-retail-api:latest
docker compose up -d app

# 3. 验证
curl https://your-domain.com/api/v1/ai/health
```

### 9.4 日志管理

```bash
# 查看各服务日志
docker compose logs -f app       # 应用日志（JSON 格式，由 Pino 输出）
docker compose logs -f nginx     # Nginx 日志
docker compose logs -f mysql     # MySQL 日志（含慢查询）

# 宿主机日志轮转
cat > /etc/logrotate.d/docker-3c-retail << 'EOF'
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    copytruncate
    maxsize 100M
}
EOF
```

---

## 十、安全清单

部署完成后逐项检查：

- [ ] `.env` 文件权限为 `600`，所有占位值已替换为真实密码
- [ ] `JWT_SECRET` 使用 `openssl rand -hex 32` 生成，非示例值
- [ ] MySQL 应用账户为 `3capp`（非 root）
- [ ] Redis 已配置 `requirepass`
- [ ] 安全组仅开放 80/443 公网端口，22 端口限制 IP
- [ ] SSL 证书已部署（非自签名），HSTS 已启用
- [ ] `SWAGGER_ENABLED=false`（生产环境）
- [ ] CORS_ORIGIN 已设为实际域名（非 localhost）
- [ ] Nginx `server_tokens off`（不泄露版本号）
- [ ] Docker daemon 不监听 TCP 端口（`/etc/docker/daemon.json` 中 `hosts` 不含 tcp）
- [ ] 系统已配置自动安全更新：`apt-get install unattended-upgrades`
- [ ] 数据库备份 crontab 已配置并测试执行通过
- [ ] 监控告警已配置（CVM 指标 + 应用健康探测）
- [ ] 首次登录后立即修改默认管理员密码（如使用了 seed 脚本）

---

## 附录：文件结构

```
/opt/3c-retail/backend/
├── .env                          # 环境变量（600 权限，不入库）
├── .env.example                  # 环境变量模板
├── Dockerfile                    # 多阶段构建
├── docker-compose.yml            # 服务编排
├── package.json
├── prisma/
│   ├── schema.prisma             # 数据模型
│   ├── seed.ts                   # 种子数据（默认密码 admin123，部署后更换）
│   └── migrations/               # 迁移文件
├── nginx/
│   ├── nginx.conf                # Nginx 主配置
│   ├── ssl/                      # SSL 证书目录
│   │   └── .gitkeep
│   ├── logs/                     # Nginx 日志目录
│   │   └── .gitkeep
│   ├── ssl-init.sh               # 自签名证书生成（首次启动）
│   └── htpasswd-init.sh          # Swagger 鉴权文件生成
├── mysql/
│   ├── conf.d/my.cnf             # MySQL 配置
│   └── init/                     # MySQL 初始化脚本目录
│       └── .gitkeep
├── redis/
│   └── redis.conf                # Redis 配置
├── scripts/
│   ├── backup.sh                 # 数据库备份
│   ├── verify-backup.sh          # 备份完整性验证
│   ├── check-partitions.sh       # 分区表检查
│   └── health-probe.sh           # 应用健康探测
└── src/                          # 应用源码
```
