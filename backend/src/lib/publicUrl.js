// 推断受访者访问前端所用的公开地址（用于管理后台生成二维码/链接）。
//
// 生产环境：管理后台经 nginx 8443 反代（带 X-Forwarded-Proto: https），
// 前端由 nginx 443 直接伺服，URL 不带端口 → https://域名
// 开发环境：前端跑在 Vite dev server（5173）→ http://localhost:5173
//
// explicitUrl（ADMIN_PUBLIC_URL）优先于推断，用于前端不在
// 443/5173 这两个约定端口的特殊部署。
export function defaultPublicHost(req, explicitUrl) {
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');

  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const hostname = (req.get('host') || 'localhost').split(':')[0];
  return proto === 'https' ? `https://${hostname}` : `http://${hostname}:5173`;
}
