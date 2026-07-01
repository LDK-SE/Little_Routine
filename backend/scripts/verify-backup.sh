#!/bin/bash
# ============================================================================
# 备份验证脚本 — 解压最新的备份文件并验证其完整性
# 用法: ./verify-backup.sh
# 建议: 每月 1 日 crontab 执行
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/data/backup/mysql}"
LOG_FILE="${BACKUP_DIR}/verify.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

LATEST_BACKUP=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2)

if [ -z "$LATEST_BACKUP" ]; then
  log "未找到备份文件，验证失败"
  exit 1
fi

FILE_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
log "验证备份: $LATEST_BACKUP ($FILE_SIZE)"

# 解压并检查是否为有效的 SQL 文件
if gunzip -t "$LATEST_BACKUP" 2>/dev/null; then
  # 解压后检查头部是否为 SQL
  if gunzip -c "$LATEST_BACKUP" 2>/dev/null | head -20 | grep -qi "CREATE\|INSERT\|DROP\|ALTER"; then
    log "备份验证通过: $LATEST_BACKUP"
  else
    log "备份文件可能损坏 (非SQL格式): $LATEST_BACKUP"
    exit 1
  fi
else
  log "解压失败，备份文件可能损坏: $LATEST_BACKUP"
  exit 1
fi
