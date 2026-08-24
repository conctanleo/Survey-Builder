import express from 'express';
import cors from 'cors';
import surveysRouter from './routes/surveys.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 部署在 nginx 反代之后：req.ip 取 X-Forwarded-For 首个 IP（限速用）
app.set('trust proxy', 1);

// 中间件
app.use(cors());
app.use(express.json());

// 注意：录音文件（受访者声纹 PII）不在公网静态暴露，
// 收听请走管理后台的认证接口 /api/recordings/file/...（admin.js）

// 路由
app.use('/api/surveys', surveysRouter);

// 错误处理
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  console.log(`问卷后端服务已启动: http://localhost:${PORT}`);
});