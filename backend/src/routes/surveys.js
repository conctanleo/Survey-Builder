import express from 'express';
import * as surveyController from '../controllers/surveyController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// 获取问卷配置
router.get('/:surveyId', surveyController.getSurvey);

// 上传录音
router.post('/:surveyId/recordings/:questionId', upload.single('recording'), surveyController.uploadRecording);

// 提交问卷
router.post('/:surveyId/submit', surveyController.submitSurvey);

export default router;