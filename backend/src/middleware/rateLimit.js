// 简单内存滑动窗口限速（无外部依赖）。
// 场景：公开无认证的上传/提交接口，防止脚本刷库、灌磁盘。
// 注意：单进程内存计数，重启清零；本服务 PM2 instances=1，够用。
import { isIP } from 'net';

// 内网/回环地址不限速：不影响本机并发测试（tests/concurrent-test.mjs），
// 公网滥用都来自公网 IP（经 nginx 反代后 req.ip 取 X-Forwarded-For 首个 IP）
function isPrivateIp(ip) {
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  const v4 = ip.replace('::ffff:', '');
  if (isIP(v4) !== 4) return false;
  const [a] = v4.split('.').map(Number);
  return a === 10 || a === 127 || a === 0
    || (a === 172 && Number(v4.split('.')[1]) >= 16 && Number(v4.split('.')[1]) <= 31)
    || (a === 192 && Number(v4.split('.')[1]) === 168);
}

export function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map(); // ip -> { start, count }
  // 定期清理过期条目，防止 Map 无限增长
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) {
      if (now - rec.start > windowMs) hits.delete(ip);
    }
  }, windowMs);
  sweeper.unref();

  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    if (isPrivateIp(ip)) return next();

    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now - rec.start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }
    rec.count += 1;
    if (rec.count > max) {
      return res.status(429).set('Retry-After', String(Math.ceil(windowMs / 1000)))
        .json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
  };
}
