#!/bin/bash
# ============================================================================
# 3C数码零售系统 · 数据库备份脚本
# 用法: ./backup.sh [daily|weekly|manual]
# 建议: crontab 定时执行 (每日凌晨 2:00 full backup)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/data/backup/mysql}"
RETENTION_DAYS=${RETENTION_DAYS:-30}
MODE="${1:-daily}"

# ---- 加载环境变量 (docker-compose) ----
ENV_FILE="${SCRIPT_DIR}/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
export MYSQL_PWD="${MYSQL_PASSWORD}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-3c_retail}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${MYSQL_DATABASE}_${MODE}_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# ---- 创建备份目录 ----
mkdir -p "$BACKUP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ---- 执行备份 ----
backup_full() {
  log "开始全量备份: $BACKUP_FILE"

  mysqldump \
    -u"$MYSQL_USER" \
    -h"$MYSQL_HOST" -P"$MYSQL_PORT" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --set-gtid-purged=OFF \
    --databases "$MYSQL_DATABASE" \
    2>>"$LOG_FILE" \
    | gzip > "$BACKUP_FILE"

  if [ $? -eq 0 ]; then
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "备份完成: $BACKUP_FILE ($FILE_SIZE)"
  else
    log "备份失败!"
    exit 1
  fi
}

# ---- 清理过期备份 ----
cleanup_old() {
  local count
  count=$(find "$BACKUP_DIR" -name "${MYSQL_DATABASE}_*.sql.gz" -mtime +"$RETENTION_DAYS" | wc -l)
  if [ "$count" -gt 0 ]; then
    find "$BACKUP_DIR" -name "${MYSQL_DATABASE}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
    log "清理 ${count} 个过期备份 (>${RETENTION_DAYS}天)"
  fi
}

# ---- 上传至腾讯云 COS ----
upload_to_cos() {
  if [ -z "${COS_BUCKET:-}" ]; then
    log "COS_BUCKET 未配置，跳过上传"
    return
  fi

  log "上传至腾讯云 COS: ${COS_BUCKET}/backups/mysql/"
  coscmd upload "$BACKUP_FILE" "backups/mysql/$(basename "$BACKUP_FILE")" 2>>"$LOG_FILE" \
    && log "COS 上传成功" \
    || log "COS 上传失败"
}

# ---- 主流程 ----
case "$MODE" in
  daily)
    backup_full
    cleanup_old
    upload_to_cos
    ;;
  weekly)
    backup_full
    ;;
  manual)
    backup_full
    log "手动备份完成"
    ;;
  *)
    echo "用法: $0 [daily|weekly|manual]"
    exit 1
    ;;
esac

log "备份任务结束"
