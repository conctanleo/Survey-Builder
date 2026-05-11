import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import surveysRouter from './routes/surveys.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务（录音文件）
app.use('/recordings', express.static(path.join(__dirname, '../data/recordings')));

// 路由
app.use('/api/surveys', surveysRouter);

// 错误处理
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  console.log(`问卷后端服务已启动: http://localhost:${PORT}`);
});