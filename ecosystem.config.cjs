module.exports = {
  apps: [
    {
      name: 'survey-api',
      script: 'src/index.js',
      cwd: './backend',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'survey-admin',
      script: 'src/admin.js',
      cwd: './backend',
      env: {
        ADMIN_PORT: 3001,
        NODE_ENV: 'production',
        // 从启动环境透传，避免把密码写进仓库：
        // ADMIN_PASSWORD=xxx pm2 start ecosystem.config.cjs
        ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        // 前端公开地址（二维码/链接默认指向），如 https://survey.example.com
        ADMIN_PUBLIC_URL: process.env.ADMIN_PUBLIC_URL,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      max_memory_restart: '300M',
    },
  ],
};
