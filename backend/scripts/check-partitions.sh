#!/bin/bash
# ============================================================================
# 分区表迁移检查脚本 — 确保 Prisma 生成的迁移中包含 PARTITION BY RANGE
# 用法: ./check-partitions.sh
# 在 CI 或部署前执行，防止分区表被错误回退为普通表
# ============================================================================

set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-prisma/migrations}"
PARTITIONED_TABLES=("SaleOrder" "PaymentFlow" "CommissionLedger" "AuditLog" "AiChatLog")

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

LATEST_MIGRATION=$(find "$MIGRATIONS_DIR" -name "migration.sql" -type f | sort | tail -1)

if [ -z "$LATEST_MIGRATION" ]; then
  log "未找到迁移文件，跳过分区检查"
  exit 0
fi

log "检查迁移文件: $LATEST_MIGRATION"

MISSING=()
for table in "${PARTITIONED_TABLES[@]}"; do
  if grep -q "CREATE TABLE.*\`${table}\`" "$LATEST_MIGRATION" 2>/dev/null; then
    if ! grep -q "PARTITION BY RANGE" "$LATEST_MIGRATION" 2>/dev/null; then
      MISSING+=("$table")
    fi
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  log "错误: 以下分区表缺少 PARTITION BY RANGE 子句: ${MISSING[*]}"
  log "请在迁移文件中手动添加分区定义"
  exit 1
fi

log "分区检查通过"
