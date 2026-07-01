#!/bin/sh
# ============================================================================
# Nginx SSL 初始化 — 无证书时自动生成自签名占位证书
# 确保 Nginx 能正常启动，后续可替换为正式 SSL 证书
# ============================================================================

SSL_DIR="/etc/nginx/ssl"
CERT_FILE="${SSL_DIR}/fullchain.pem"
KEY_FILE="${SSL_DIR}/privkey.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "[ssl-init] SSL 证书不存在，生成自签名占位证书..."
  mkdir -p "$SSL_DIR"
  openssl req -x509 -nodes -days 90 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost" \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" 2>/dev/null
  echo "[ssl-init] 自签名证书已生成，有效期为 90 天"
  echo "[ssl-init] 上线前请替换为正式 SSL 证书"
else
  echo "[ssl-init] SSL 证书已存在，跳过"
fi
