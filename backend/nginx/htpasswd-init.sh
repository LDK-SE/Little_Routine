#!/bin/sh
# ============================================================================
# Nginx htpasswd 初始化 — 从环境变量生成 Swagger 文档鉴权文件
# 仅在 SWAGGER_AUTH=true 时启用，否则创建空允许文件
# ============================================================================

HTPASSWD_FILE="/etc/nginx/.htpasswd"

if [ "${SWAGGER_AUTH}" = "true" ] && [ -n "${SWAGGER_USER}" ] && [ -n "${SWAGGER_PASS}" ]; then
  echo "[htpasswd-init] 生成 Swagger 鉴权文件..."
  printf "${SWAGGER_USER}:$(openssl passwd -apr1 "${SWAGGER_PASS}")\n" > "$HTPASSWD_FILE"
  chmod 600 "$HTPASSWD_FILE"
  echo "[htpasswd-init] htpasswd 已生成"
else
  echo "[htpasswd-init] SWAGGER_AUTH 未启用，跳过鉴权配置"
  # 创建一个允许所有访问的占位文件（auth_basic 仍会生效但允许空密码）
  echo "admin:*" > "$HTPASSWD_FILE"
fi
