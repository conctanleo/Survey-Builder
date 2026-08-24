import express from 'express';
import * as surveyController from '../controllers/surveyController.js';
import { upload } from '../middleware/upload.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// 公开写接口限速：每 IP 每分钟 30 次（正常答题 ≈ 录音数 + 1 次提交，远低于此）
const writeRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

// 获取问卷配置
router.get('/:surveyId', surveyController.getSurvey);

// 上传录音
router.post('/:surveyId/recordings/:questionId', writeRateLimit, upload.single('recording'), surveyController.uploadRecording);

// 提交问卷
router.post('/:surveyId/submit', writeRateLimit, surveyController.submitSurvey);

export default router;