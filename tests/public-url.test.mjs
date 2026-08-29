import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPublicHost } from '../backend/src/lib/publicUrl.js';

// 模拟 Express req 对象
function mockReq({ host, proto, secure = false }) {
  return {
    secure,
    get: (h) => {
      if (h.toLowerCase() === 'host') return host;
      if (h.toLowerCase() === 'x-forwarded-proto') return proto;
      return undefined;
    },
  };
}

test('生产环境（nginx 反代，https）不带端口：https://域名', () => {
  const req = mockReq({ host: 'tandonkey.tech', proto: 'https' });
  assert.equal(defaultPublicHost(req), 'https://tandonkey.tech');
});

test('生产环境（直接 https，Host 带端口）剥离端口', () => {
  const req = mockReq({ host: 'survey.example.com:3443', proto: undefined, secure: true });
  assert.equal(defaultPublicHost(req), 'https://survey.example.com');
});

test('开发环境（http）默认 Vite 端口 5173', () => {
  const req = mockReq({ host: 'localhost:3001', proto: undefined, secure: false });
  assert.equal(defaultPublicHost(req), 'http://localhost:5173');
});

test('ADMIN_PUBLIC_URL 显式配置优先于推断', () => {
  const req = mockReq({ host: 'localhost:3001', proto: 'https' });
  assert.equal(
    defaultPublicHost(req, 'https://my-survey.example.com'),
    'https://my-survey.example.com'
  );
});

test('缺少 x-forwarded-proto 且非 secure 时按 http 处理', () => {
  const req = mockReq({ host: '192.168.1.10:3001', proto: undefined });
  assert.equal(defaultPublicHost(req), 'http://192.168.1.10:5173');
});
