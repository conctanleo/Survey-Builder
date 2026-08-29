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
#   - 设置管理后台密码（ADMIN_PASSWORD）

set -euo pipefail

# 非交互：Ubuntu 22.04+ 的 apt 会触发 needrestart 钩子，弹出
# "Restarting services..." 确认对话框，SSH 下可能无法输入导致卡死。
# NEEDRESTART_MODE=a 让其自动重启服务；DEBIAN_FRONTEND 禁用所有安装弹窗。
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

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
read -rsp "请设置管理后台密码（ADMIN_PASSWORD，输入不回显）: " ADMIN_PASSWORD
echo ""

if [[ -z "$DOMAIN" ]]; then error "域名不能为空"; fi
if [[ -z "$ADMIN_PASSWORD" ]]; then error "管理后台密码不能为空（admin 服务未设密码会拒绝启动）"; fi
export ADMIN_PASSWORD
# 二维码/链接默认指向的前端公开地址
export ADMIN_PUBLIC_URL="https://$DOMAIN"

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

# 确保 data 目录权限正确（数据库在 backend/data/，录音在仓库根 data/recordings/）
mkdir -p backend/data data/recordings
chown -R "$SUDO_USER:$SUDO_USER" backend/data data

# ── 6. PM2 启动 ──
info "启动应用服务..."
pm2 delete survey-api 2>/dev/null || true
pm2 delete survey-admin 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

info "设置 PM2 开机自启..."
pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" 2>/dev/null || true

# ── 7. HTTPS 证书（必须先于 nginx 配置：nginx -t 需要证书文件存在）──
info "申请 Let's Encrypt 证书..."
# standalone 模式需要 80 端口空闲
systemctl stop nginx 2>/dev/null || true
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" \
  || error "证书申请失败：请确认域名已解析到本机且 80 端口可访问后重试"

# ── 8. Nginx 配置 ──
info "配置 Nginx..."
NGINX_CONF="/etc/nginx/sites-available/voice-survey"

# 替换域名并取消注释证书路径行（certonly 生成的路径与 nginx.conf 模板一致）。
# 注意：模板中证书行在 server 块内有缩进，不能用 ^# 锚定行首（匹配不到）
sed -e "s/YOUR_DOMAIN/$DOMAIN/g" -e "s|# *\(ssl_certificate\)|\1|" \
  "$APP_DIR/deploy/nginx.conf" > "$NGINX_CONF"

# 启用站点
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/voice-survey
# 删除默认站点（如果存在）
rm -f /etc/nginx/sites-enabled/default

nginx -t || error "Nginx 配置有误，请检查 $NGINX_CONF"
systemctl enable nginx
# 申请证书前 nginx 被停掉，对已停止的服务 reload 会报错：活动则 reload，否则 start
systemctl is-active --quiet nginx && systemctl reload nginx || systemctl start nginx

# ── 9. 防火墙 ──
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

# ── 10. 证书自动续期 ──
info "设置证书自动续期..."
# standalone 续期需要临时占用 80 端口，前后停/启 nginx
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --pre-hook 'systemctl stop nginx' --post-hook 'systemctl start nginx'") | sort -u | crontab -

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
echo "  录音文件：    $APP_DIR/data/recordings/"
echo "══════════════════════════════════════════════════════"
