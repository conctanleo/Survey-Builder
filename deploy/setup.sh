#!/bin/bash
# Voice Survey Web App 一键部署脚本
#
# 使用方法：
#   1. 将代码上传到服务器（git clone 或 scp）
#   2. bash deploy/setup.sh
#
# 前提：纯净 Linux（Ubuntu 20.04+ / Debian 11+），有 root 或 sudo 权限
#
# 交互式步骤：
#   - 输入域名
#   - 输入管理员邮箱（用于 Let's Encrypt）

set -euo pipefail

# ── 颜色 ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 检查 root ──
if [[ $EUID -ne 0 ]]; then
  error "请使用 root 用户或 sudo 运行此脚本"
fi

# ── 收集信息 ──
APP_DIR="/opt/voice-survey"
read -rp "请输入域名（例：survey.example.com）: " DOMAIN
read -rp "请输入管理员邮箱（用于 HTTPS 证书）: " EMAIL

if [[ -z "$DOMAIN" ]]; then error "域名不能为空"; fi

info "域名: $DOMAIN"
info "应用目录: $APP_DIR"

# ── 1. 系统依赖 ──
info "安装系统依赖..."
apt-get update -qq
apt-get install -y -qq curl git build-essential python3 nginx certbot python3-certbot-nginx > /dev/null

# ── 2. Node.js（通过 nvm）──
if ! command -v node &> /dev/null; then
  info "安装 Node.js 20..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash -
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm alias default 20
  # 为所有用户可用：写入 profile 脚本，登录时自动加载 nvm
  cat > /etc/profile.d/nvm.sh <<'NVM_RC'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NVM_RC
else
  info "Node.js 已安装: $(node -v)"
fi

# ── 3. PM2 ──
if ! command -v pm2 &> /dev/null; then
  info "安装 PM2..."
  npm install -g pm2
  # 为当前用户配置开机自启
  pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" 2>/dev/null || true
else
  info "PM2 已安装: $(pm2 -v)"
fi

# ── 4. 项目代码 ──
info "设置项目目录..."

# 如果脚本在项目内执行，复制到 /opt；否则提示
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ "$PROJECT_DIR" != "$APP_DIR" ]]; then
  if [[ -d "$APP_DIR" ]]; then
    warn "$APP_DIR 已存在，将更新代码"
  else
    info "复制项目到 $APP_DIR..."
    cp -r "$PROJECT_DIR" "$APP_DIR"
  fi
fi

cd "$APP_DIR"

# ── 5. 安装依赖 & 构建 ──
info "安装前端依赖..."
npm install --production=false

info "构建前端..."
npm run build

info "安装后端依赖..."
cd backend
npm install --production
cd ..

info "初始化数据库（如果需要）..."
cd backend
node scripts/init-db.js 2>/dev/null || true
cd ..

# 确保 data 目录权限正确
mkdir -p backend/data/recordings
chown -R "$SUDO_USER:$SUDO_USER" backend/data

# ── 6. PM2 启动 ──
info "启动应用服务..."
pm2 delete survey-api 2>/dev/null || true
pm2 delete survey-admin 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

info "设置 PM2 开机自启..."
pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" 2>/dev/null || true

# ── 7. Nginx 配置 ──
info "配置 Nginx..."
NGINX_CONF="/etc/nginx/sites-available/voice-survey"

sed -e "s/YOUR_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > "$NGINX_CONF"

# 启用站点
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/voice-survey
# 删除默认站点（如果存在）
rm -f /etc/nginx/sites-enabled/default

nginx -t || error "Nginx 配置有误，请检查 $NGINX_CONF"
systemctl enable nginx
systemctl reload nginx

# ── 8. 防火墙 ──
info "配置防火墙..."
if command -v ufw &> /dev/null; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 8443/tcp
  ufw --force enable 2>/dev/null || true
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --permanent --add-port=8443/tcp
  firewall-cmd --reload
fi

# ── 9. HTTPS 证书 ──
info "申请 Let's Encrypt 证书..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect

info "设置证书自动续期..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -

# ── 完成 ──
echo ""
echo "══════════════════════════════════════════════════════"
echo -e "${GREEN}  部署完成！${NC}"
echo ""
echo "  前端访问：    https://$DOMAIN"
echo "  管理后台：    https://$DOMAIN:8443"
echo "  管理后台(内)：ssh -L 3001:localhost:3001 user@$DOMAIN"
echo ""
echo "  PM2 管理：    pm2 status | pm2 logs | pm2 restart all"
echo "  Nginx 日志：  tail -f /var/log/nginx/voice-survey.access.log"
echo "  数据库：      $APP_DIR/backend/data/surveys.db"
echo "  录音文件：    $APP_DIR/backend/data/recordings/"
echo "══════════════════════════════════════════════════════"
