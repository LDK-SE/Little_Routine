# 3C 零售小程序后端部署方案

---

## 一、部署架构总览

```
                         ┌─────────────┐
                         │   Nginx      │  :443 (SSL 终结)
                         │   Reverse    │
                         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    │   Docker Network       │
                    │   (3c-retail-net)      │
                    └───────────┬───────────┘
            ┌───────────────────┼───────────────────┐
            │                   │                   │
     ┌──────┴──────┐    ┌──────┴──────┐    ┌───────┴──────┐
     │ NestJS API  │    │   MySQL 8   │    │   Redis 7    │
     │ (2 replica) │    │  (Master)   │    │   (Cache +   │
     │   :3000     │    │   :3306     │    │    Queue)    │
     └─────────────┘    └──────┬──────┘    └──────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   MySQL Backup      │
                    │   (cron + binlog)   │
                    └─────────────────────┘

     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │ Prometheus   │   │  Grafana     │   │  Loki +      │
     │ :9091        │   │  :3001       │   │  Promtail    │
     └──────────────┘   └──────────────┘   └──────────────┘
```

---

## 二、Docker Compose 部署

### 2.1 目录结构

```
/opt/3c-retail/
├── docker-compose.yml
├── .env
├── nginx/
│   ├── nginx.conf
│   └── ssl/
│       ├── fullchain.pem
│       └── privkey.pem
├── nestjs/
│   ├── Dockerfile
│   └── dist/                   # 构建产物
├── mysql/
│   ├── init/
│   │   └── 01-init-db.sql
│   ├── conf.d/
│   │   └── custom.cnf
│   └── backup/
│       └── backup.sh
├── redis/
│   └── redis.conf
├── prometheus/
│   ├── prometheus.yml
│   └── alerts/
│       └── rules.yml
├── grafana/
│   └── dashboards/
│       └── 3c-retail-dashboard.json
└── loki/
    └── loki-config.yml
```

### 2.2 docker-compose.yml

```yaml
version: '3.8'

services:
  # ==================== 核心服务 ====================
  nestjs:
    build:
      context: ./nestjs
      dockerfile: Dockerfile
    container_name: 3c-retail-api
    restart: unless-stopped
    deploy:
      replicas: 2
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - DB_NAME=3c_retail
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
      - AI_READONLY_SECRET=${AI_READONLY_SECRET}
      - DIFY_API_URL=${DIFY_API_URL}
      - DIFY_API_KEY=${DIFY_API_KEY}
      - SMS_ACCESS_KEY=${SMS_ACCESS_KEY}
      - SMS_SECRET=${SMS_SECRET}
    ports:
      - "3000:3000"
    networks:
      - 3c-retail-net
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  nginx:
    image: nginx:1.25-alpine
    container_name: 3c-retail-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - 3c-retail-net
    depends_on:
      - nestjs

  # ==================== 数据库 ====================
  mysql:
    image: mysql:8.0.36
    container_name: 3c-retail-mysql
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASS}
      - MYSQL_DATABASE=3c_retail
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASS}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./mysql/init:/docker-entrypoint-initdb.d:ro
      - ./mysql/conf.d:/etc/mysql/conf.d:ro
      - mysql-binlog:/var/log/mysql
    networks:
      - 3c-retail-net
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_ROOT_PASS}"]
      interval: 10s
      timeout: 5s
      retries: 5
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --binlog-expire-logs-days=7
      - --slow-query-log=1
      - --slow-query-log-file=/var/log/mysql/slow-query.log
      - --long-query-time=0.5

  redis:
    image: redis:7.2-alpine
    container_name: 3c-retail-redis
    restart: unless-stopped
    command: redis-server /usr/local/etc/redis/redis.conf --requirepass ${REDIS_PASS}
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
    networks:
      - 3c-retail-net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASS}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ==================== 监控 ====================
  prometheus:
    image: prom/prometheus:v2.50
    container_name: 3c-retail-prometheus
    restart: unless-stopped
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alerts:/etc/prometheus/alerts:ro
      - prometheus-data:/prometheus
    networks:
      - 3c-retail-net
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:10.3
    container_name: 3c-retail-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASS}
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    networks:
      - 3c-retail-net

  loki:
    image: grafana/loki:2.9
    container_name: 3c-retail-loki
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - ./loki/loki-config.yml:/etc/loki/local-config.yaml:ro
      - loki-data:/loki
    networks:
      - 3c-retail-net
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:2.9
    container_name: 3c-retail-promtail
    restart: unless-stopped
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - ./loki/promtail-config.yml:/etc/promtail/config.yml:ro
    networks:
      - 3c-retail-net

  # ==================== 定时备份 ====================
  mysql-backup:
    image: mysql:8.0.36
    container_name: 3c-retail-mysql-backup
    restart: unless-stopped
    environment:
      - MYSQL_HOST=mysql
      - MYSQL_PORT=3306
      - MYSQL_USER=root
      - MYSQL_PASSWORD=${DB_ROOT_PASS}
    volumes:
      - mysql-backup:/backup
      - ./mysql/backup/backup.sh:/backup.sh:ro
    networks:
      - 3c-retail-net
    entrypoint: /bin/sh
    command:
      - -c
      - |
        echo "0 2 * * * /backup.sh >> /backup/backup.log 2>&1" > /etc/crontabs/root
        crond -f
    depends_on:
      mysql:
        condition: service_healthy

volumes:
  mysql-data:
  mysql-binlog:
  mysql-backup:
  redis-data:
  prometheus-data:
  grafana-data:
  loki-data:

networks:
  3c-retail-net:
    driver: bridge
```

### 2.3 .env 文件

```bash
# MySQL
DB_ROOT_PASS=changeme_root_2024
DB_USER=3c_app
DB_PASS=changeme_app_2024

# NestJS
JWT_SECRET=your-256-bit-secret-key-here
AI_READONLY_SECRET=ai-readonly-jwt-secret-key

# Dify
DIFY_API_URL=https://your-dify-instance.com/v1
DIFY_API_KEY=app-xxxxxxxxxxxxx

# 短信
SMS_ACCESS_KEY=your_aliyun_access_key
SMS_SECRET=your_aliyun_secret

# Redis
REDIS_PASS=redis_pass_2024

# Grafana
GRAFANA_USER=admin
GRAFANA_PASS=grafana_admin_2024
```

---

## 三、NestJS Dockerfile 与 Nginx 配置

### 3.1 Dockerfile

```dockerfile
# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY .env.production ./.env

# --- Runtime Stage ---
FROM node:20-alpine
RUN apk add --no-cache curl tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env ./.env

EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "dist/main.js"]
```

### 3.2 Nginx 配置

```nginx
upstream nestjs_backend {
    least_conn;
    server nestjs:3000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.3c-retail.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.3c-retail.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 限流
    limit_req_zone $binary_remote_addr zone=api_rate:10m rate=30r/s;
    limit_req zone=api_rate burst=20 nodelay;

    # 日志
    access_log /var/log/nginx/3c-retail-access.log json_combined;
    error_log  /var/log/nginx/3c-retail-error.log;

    # API 代理
    location /api/ {
        proxy_pass http://nestjs_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
    }

    # 健康检查
    location /health {
        proxy_pass http://nestjs_backend/api/health;
        access_log off;
    }
}
```

---

## 四、数据库备份与 Binlog 方案

### 4.1 备份脚本

```bash
#!/bin/sh
# /opt/3c-retail/mysql/backup/backup.sh

BACKUP_DIR="/backup"
RETENTION_DAYS=30
DB_NAME="3c_retail"
DATE=$(date +%Y%m%d_%H%M%S)

# 全量备份
mysqldump -h mysql -u root -p${MYSQL_PASSWORD} \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  ${DB_NAME} | gzip > ${BACKUP_DIR}/${DB_NAME}_full_${DATE}.sql.gz

# 删除过期备份
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# 校验
if [ -f "${BACKUP_DIR}/${DB_NAME}_full_${DATE}.sql.gz" ]; then
  echo "[$(date)] Backup success: ${DB_NAME}_full_${DATE}.sql.gz ($(du -h ${BACKUP_DIR}/${DB_NAME}_full_${DATE}.sql.gz | cut -f1))"
else
  echo "[$(date)] Backup FAILED!" >&2
fi
```

### 4.2 MySQL 配置（custom.cnf）

```ini
[mysqld]
# Binlog 配置
log-bin=/var/log/mysql/mysql-bin
binlog_format=ROW
binlog_row_image=FULL
expire_logs_days=7
max_binlog_size=512M

# 慢查询
slow_query_log=1
slow_query_log_file=/var/log/mysql/slow-query.log
long_query_time=0.5

# InnoDB
innodb_buffer_pool_size=1G
innodb_log_file_size=256M
innodb_flush_log_at_trx_commit=1
innodb_doublewrite=1

# 字符集
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

# 连接
max_connections=200
max_connect_errors=1000
```

### 4.3 备份策略

| 备份类型 | 频率 | 保留期 | 存储位置 |
|---------|------|--------|---------|
| 全量 mysqldump | 每日凌晨 2:00 | 30 天 | `/backup/` 卷 |
| Binlog 增量 | 实时写入 | 7 天 | `/var/log/mysql/` |
| 异地备份 (可选) | 每周同步到 OSS/S3 | 90 天 | 阿里云 OSS |

---

## 五、日志方案

### 5.1 日志层级

```
┌─────────────────────────────────────────────────────────┐
│                    Loki (日志聚合)                        │
│                    :3100                                 │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
   ┌─────┴─────┐  ┌──────┴──────┐  ┌─────┴─────┐
   │ NestJS     │  │ Nginx       │  │ MySQL     │
   │ JSON log   │  │ Access log  │  │ Slow log  │
   │ stdout     │  │ stdout      │  │ stdout    │
   └───────────┘  └─────────────┘  └───────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                  ┌──────┴──────┐
                  │  Promtail   │ ← 采集 Docker 日志
                  └─────────────┘
```

### 5.2 NestJS 日志格式（Winston）

```typescript
// 应用层 logger 配置
{
  "level": "info",
  "format": "json",
  "defaultMeta": { "service": "3c-retail-api" },
  "transports": [
    { "type": "console" }  // Docker 自动采集 stdout
  ]
}

// 输出示例
{
  "timestamp": "2026-06-12T10:30:00.123Z",
  "level": "info",
  "service": "3c-retail-api",
  "module": "SaleService",
  "action": "outbound_scan",
  "imei": "356789****12345",
  "duration_ms": 85,
  "status": "success",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 5.3 关键日志字段

| 字段 | 说明 | 示例 |
|------|------|------|
| `traceId` | 全链路追踪 ID | UUID v4 |
| `module` | 模块名 | `SaleService` |
| `action` | 操作 | `outbound_scan` |
| `duration_ms` | 耗时 | `85` |
| `userId` | 操作用户 ID | `1003` |
| `orderNo` | 订单号（如有） | `SO2026061000123` |

---

## 六、监控方案

### 6.1 Prometheus 配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files:
  - "/etc/prometheus/alerts/rules.yml"

scrape_configs:
  - job_name: 'nestjs'
    scrape_interval: 10s
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['nestjs:3000']
        labels:
          service: '3c-retail-api'

  - job_name: 'mysql'
    static_configs:
      - targets: ['mysql-exporter:9104']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

### 6.2 核心告警规则

```yaml
# alerts/rules.yml
groups:
  - name: 3c-retail-critical
    rules:
      # P95 响应时间告警
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 200
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "API P95 延迟 > 200ms"
          description: "接口 {{ $labels.route }} P95 延迟为 {{ $value }}ms"

      # 并发冲突告警
      - alert: ConcurrencyConflict
        expr: rate(stock_optimistic_lock_conflict_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "检测到串码并发冲突"
          description: "过去5分钟内发生 {{ $value }} 次乐观锁冲突"

      # 对账失败告警
      - alert: ReconcileFailed
        expr: daily_reconcile_status{status="fail"} == 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "日终对账失败"
          description: "{{ $labels.check_type }} 对账发现差异 {{ $labels.diff_count }} 条"

      # API 错误率
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "API 5xx 错误率 > 1%"

      # 服务宕机
      - alert: ServiceDown
        expr: up{job="nestjs"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "NestJS 服务不可用"

      # MySQL 慢查询
      - alert: SlowQueries
        expr: rate(mysql_global_status_slow_queries[5m]) > 5
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "MySQL 慢查询 > 5次/分钟"

      # Redis 连接
      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis 服务不可用"
```

### 6.3 Grafana 仪表盘核心面板

| 面板标题 | 数据源 | 指标 | 刷新 |
|---------|--------|------|------|
| **API P95 延迟** | Prometheus | `histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))` | 10s |
| **QPS（每秒请求）** | Prometheus | `rate(http_requests_total[1m])` | 10s |
| **5xx 错误率** | Prometheus | `rate(http_requests_total{status=~"5.."}[5m])` | 30s |
| **并发冲突次数** | Prometheus | `stock_optimistic_lock_conflict_total` | 10s |
| **今日销售单数** | MySQL | `SELECT COUNT(*) FROM sales_order WHERE DATE(created_at)=CURDATE()` | 60s |
| **今日毛利** | MySQL | `SELECT SUM(gross_profit) FROM sales_order WHERE DATE(created_at)=CURDATE()` | 60s |
| **库存总量** | MySQL | `SELECT COUNT(*) FROM stock_ledger WHERE status='in_stock'` | 60s |
| **对账状态** | MySQL | `SELECT status, diff_count FROM daily_reconcile WHERE reconcile_date=CURDATE()` | 3600s |
| **日志面板** | Loki | `{service="3c-retail-api"} |= "ERROR"` | 实时 |

---

## 七、NestJS 监控埋点（Prometheus 指标）

```typescript
// metrics/MetricsService.ts
import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

@Injectable()
export class MetricsService {
  // HTTP 请求计数器
  httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
  });

  // HTTP 请求耗时直方图
  httpRequestDuration = new Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request duration in ms',
    labelNames: ['method', 'route'],
    buckets: [10, 25, 50, 100, 200, 500, 1000, 3000],
  });

  // 乐观锁冲突计数器（红线指标）
  optimisticLockConflict = new Counter({
    name: 'stock_optimistic_lock_conflict_total',
    help: 'Total optimistic lock conflicts during outbound',
  });

  // 对账状态（0=pass, 1=fail）
  reconcileStatus = new Gauge({
    name: 'daily_reconcile_status',
    help: 'Daily reconcile status per check type',
    labelNames: ['check_type', 'diff_count'],
  });

  // 当前活跃数据库连接
  dbConnectionsActive = new Gauge({
    name: 'db_connections_active',
    help: 'Active database connections',
  });

  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
```

---

## 八、小程序后台部署路径

### 8.1 小程序发布流程

```
代码开发
    │
    ▼
上传至微信开发者工具 → 编译 → 预览
    │
    ▼
提交代码 → 选择版本号 → 提交审核
    │
    ▼
微信审核（1-7天）
    │
    ▼
审核通过 → 发布上线 → 全量用户可见
```

### 8.2 环境配置

| 环境 | API Base URL | 用途 |
|------|-------------|------|
| 开发 | `http://localhost:3000/api` | 本地开发 |
| 测试 | `https://api-test.3c-retail.com/api` | 联调测试 |
| 生产 | `https://api.3c-retail.com/api` | 线上正式 |

### 8.3 小程序 app.js 全局配置

```javascript
// app.js
App({
  globalData: {
    apiBase: '',   // 构建时注入
    token: '',
    userRole: '',
    userPhone: '',
  },

  onLaunch() {
    // 根据环境切换 API 地址
    const env = __wxConfig.envVersion;
    switch (env) {
      case 'develop':
        this.globalData.apiBase = 'http://localhost:3000/api';
        break;
      case 'trial':
        this.globalData.apiBase = 'https://api-test.3c-retail.com/api';
        break;
      case 'release':
        this.globalData.apiBase = 'https://api.3c-retail.com/api';
        break;
    }
  },
});
```

---

## 九、部署命令清单

### 9.1 首次部署

```bash
# 1. 拉取代码
git clone https://github.com/your-org/3c-retail-api.git /opt/3c-retail

# 2. 构建 NestJS
cd /opt/3c-retail/nestjs
npm ci
npm run build

# 3. 配置环境变量
cp .env.example .env
vim .env  # 填写密码、密钥

# 4. 启动所有服务
docker compose -f /opt/3c-retail/docker-compose.yml up -d

# 5. 等待 MySQL 就绪后执行 Migration
docker exec 3c-retail-api npx typeorm migration:run

# 6. 验证
curl https://api.3c-retail.com/api/health
# → {"status":"ok","uptime":120}
```

### 9.2 日常运维

```bash
# 查看服务状态
docker compose -f /opt/3c-retail/docker-compose.yml ps

# 查看实时日志
docker compose -f /opt/3c-retail/docker-compose.yml logs -f --tail=100 nestjs

# 查看错误日志
docker logs 3c-retail-api 2>&1 | grep ERROR

# 手动数据库备份
docker exec 3c-retail-mysql-backup /backup.sh

# MySQL 进入
docker exec -it 3c-retail-mysql mysql -u root -p 3c_retail

# Redis 进入
docker exec -it 3c-retail-redis redis-cli -a ${REDIS_PASS}

# 滚动更新 NestJS（无停机）
docker compose -f /opt/3c-retail/docker-compose.yml up -d --no-deps --build nestjs

# 整体重启
docker compose -f /opt/3c-retail/docker-compose.yml restart
```

### 9.3 故障恢复

```bash
# 从全量备份恢复数据库
docker exec -i 3c-retail-mysql mysql -u root -p${DB_ROOT_PASS} 3c_retail < backup.sql

# 从 Binlog 恢复到指定时间点
mysqlbinlog --start-datetime="2026-06-12 02:00:00" \
  --stop-datetime="2026-06-12 14:30:00" \
  /var/log/mysql/mysql-bin.* | mysql -u root -p 3c_retail

# 重置冲突的乐观锁版本号（紧急情况下）
# 非必要不执行，需在业务低峰期操作
docker exec 3c-retail-mysql mysql -u root -p 3c_retail \
  -e "UPDATE stock_ledger SET version=0 WHERE status='in_stock' AND version>100;"
```

---

## 十、部署检查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| 所有容器 Running | `docker compose ps` | 全部 `Up` |
| NestJS 健康检查 | `curl /api/health` | `{"status":"ok"}` |
| MySQL 可连接 | `mysqladmin ping` | `mysqld is alive` |
| Redis 可连接 | `redis-cli PING` | `PONG` |
| Binlog 开启 | `SHOW VARIABLES LIKE 'log_bin'` | `ON` |
| 备份文件存在 | `ls /backup/*.sql.gz` | 最近 1 天内有文件 |
| Prometheus 采集 | `http://ip:9091/targets` | nestjs/mysql/redis state=UP |
| Grafana 可访问 | `http://ip:3001` | 登录页 |
| SSL 证书有效 | `openssl s_client -connect api.3c-retail.com:443` | 证书未过期 |
| API P95 < 200ms | Grafana 面板 | 曲线在 200 以下 |
| 并发冲突 = 0 | Grafana 面板 | `stock_optimistic_lock_conflict_total` 无新增 |
