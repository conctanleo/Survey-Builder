import db from '../models/db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 所有会拼入文件系统路径的 ID 只允许安全字符，防止路径遍历（含 URL 编码的 ../、\ 等）
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function getExtensionFromMime(mimeType) {
  if (!mimeType) return 'webm';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function getSurvey(req, res, next) {
  try {
    const { surveyId } = req.params;
    const stmt = db.prepare('SELECT * FROM surveys WHERE survey_id = ?');
    const survey = stmt.get(surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    res.json({
      surveyId: survey.survey_id,
      config: JSON.parse(survey.config),
      infoFields: JSON.parse(survey.info_fields),
      questions: JSON.parse(survey.questions),
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadRecording(req, res, next) {
  try {
    const { surveyId, questionId } = req.params;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: '未找到录音文件' });
    }

    if (!SAFE_ID_PATTERN.test(surveyId) || !SAFE_ID_PATTERN.test(questionId)) {
      return res.status(400).json({ error: '无效的问卷或题目 ID' });
    }

    let submissionId = req.headers['x-submission-id'];
    if (submissionId && !SAFE_ID_PATTERN.test(submissionId)) {
      return res.status(400).json({ error: '无效的 submission ID' });
    }
    if (!submissionId) {
      submissionId = `temp_${uuidv4()}`;
    }

    const ext = getExtensionFromMime(file.mimetype);
    const recordingsDir = path.join(__dirname, '../../../data/recordings', surveyId, submissionId);
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const fileName = `${questionId}.${ext}`;
    const filePath = path.join(recordingsDir, fileName);
    await fs.promises.writeFile(filePath, file.buffer);

    const relativePath = `recordings/${surveyId}/${submissionId}/${fileName}`;

    const checkStmt = db.prepare('SELECT submission_id FROM submissions WHERE submission_id = ?');
    const existing = checkStmt.get(submissionId);

    try {
      // INSERT OR IGNORE 防止并发上传时 UNIQUE 约束错误
      db.prepare(`
        INSERT OR IGNORE INTO submissions (submission_id, survey_id, user_info, answers)
        VALUES (?, ?, '{}', '{}')
      `).run(submissionId, surveyId);

      const upsertStmt = db.prepare(`
        INSERT INTO recordings (submission_id, question_id, file_path, mime_type, file_size)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(submission_id, question_id) DO UPDATE SET
          file_path = excluded.file_path,
          mime_type = excluded.mime_type,
          file_size = excluded.file_size
      `);
      upsertStmt.run(submissionId, questionId, relativePath, file.mimetype, file.size);
    } catch (dbErr) {
      // DB 写入失败时清理已写入的文件
      try { await fs.promises.unlink(filePath); } catch (_) { /* ignore cleanup error */ }
      throw dbErr;
    }

    res.json({ success: true, submissionId });
  } catch (err) {
    next(err);
  }
}

export function submitSurvey(req, res, next) {
  try {
    const { surveyId } = req.params;
    const { userInfo, answers, recordingDurations, submissionId } = req.body;

    console.log('[submitSurvey] Received:', { surveyId, submissionId, userInfo });

    const surveyStmt = db.prepare('SELECT survey_id FROM surveys WHERE survey_id = ?');
    const survey = surveyStmt.get(surveyId);

    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }

    // 如果提供了 submissionId（录音时创建的临时ID），则更新现有记录
    // 否则创建新的 submissionId
    const finalSubmissionId = submissionId || uuidv4();
    console.log('[submitSurvey] finalSubmissionId:', finalSubmissionId);

    const existingStmt = db.prepare('SELECT submission_id FROM submissions WHERE submission_id = ?');
    const existing = existingStmt.get(finalSubmissionId);
    console.log('[submitSurvey] existing:', existing);

    if (existing) {
      // 更新现有记录
      const updateStmt = db.prepare(`
        UPDATE submissions
        SET user_info = ?, answers = ?, recording_durations = ?, submitted_at = CURRENT_TIMESTAMP
        WHERE submission_id = ?
      `);
      updateStmt.run(
        JSON.stringify(userInfo || {}),
        JSON.stringify(answers || {}),
        JSON.stringify(recordingDurations || {}),
        finalSubmissionId
      );
    } else {
      // 插入新记录
      const insertStmt = db.prepare(`
        INSERT INTO submissions (submission_id, survey_id, user_info, answers, recording_durations)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        finalSubmissionId,
        surveyId,
        JSON.stringify(userInfo || {}),
        JSON.stringify(answers || {}),
        JSON.stringify(recordingDurations || {})
      );
    }

    res.json({ success: true, submissionId: finalSubmissionId });
  } catch (err) {
    next(err);
  }
}