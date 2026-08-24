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

// 必答题是否已作答（与服务端校验保持一致）
function isAnswered(question, answers) {
  const a = answers ? answers[question.id] : undefined;
  if (question.type === 'voice') return a === true;
  if (Array.isArray(a)) return a.length > 0;
  return typeof a === 'string' && a.trim() !== '';
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

    // 校验归属：客户端提供的 submissionId 若属于其它问卷，拒绝挂载，
    // 防止跨问卷污染/覆盖他人提交（IDOR）
    if (submissionId) {
      const owned = db.prepare('SELECT survey_id FROM submissions WHERE submission_id = ?').get(submissionId);
      if (owned && owned.survey_id !== surveyId) {
        return res.status(400).json({ error: 'submission ID 与问卷不匹配' });
      }
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
      // INSERT OR IGNORE 防止并发上传时 UNIQUE 约束错误；
      // 占位行标记为 pending，只有正式提交后才计入提交数/导出
      db.prepare(`
        INSERT OR IGNORE INTO submissions (submission_id, survey_id, user_info, answers, status)
        VALUES (?, ?, '{}', '{}', 'pending')
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

    // 日志不落受访者 PII（姓名/手机号）
    console.log('[submitSurvey]', surveyId, 'submissionId:', submissionId || '(new)');

    const surveyStmt = db.prepare('SELECT * FROM surveys WHERE survey_id = ?');
    const survey = surveyStmt.get(surveyId);

    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }

    // 服务端必答校验（客户端校验可被绕过）
    const questions = JSON.parse(survey.questions);
    const missing = questions.filter(q => q.required && !isAnswered(q, answers));
    if (missing.length > 0) {
      return res.status(400).json({
        error: `存在未作答的必答题：${missing.map(q => q.title || q.id).join('、')}`,
      });
    }

    // 如果提供了 submissionId（录音时创建的临时ID），则更新现有记录
    // 否则创建新的 submissionId
    const finalSubmissionId = submissionId || uuidv4();

    const existingStmt = db.prepare('SELECT submission_id, survey_id FROM submissions WHERE submission_id = ?');
    const existing = existingStmt.get(finalSubmissionId);

    // 归属校验：拒绝用其它问卷的 submissionId 覆盖他人提交（IDOR）
    if (existing && existing.survey_id !== surveyId) {
      return res.status(400).json({ error: 'submission ID 与问卷不匹配' });
    }

    if (existing) {
      // 更新现有记录
      const updateStmt = db.prepare(`
        UPDATE submissions
        SET user_info = ?, answers = ?, recording_durations = ?, status = 'submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE submission_id = ? AND survey_id = ?
      `);
      updateStmt.run(
        JSON.stringify(userInfo || {}),
        JSON.stringify(answers || {}),
        JSON.stringify(recordingDurations || {}),
        finalSubmissionId,
        surveyId
      );
    } else {
      // 插入新记录
      const insertStmt = db.prepare(`
        INSERT INTO submissions (submission_id, survey_id, user_info, answers, recording_durations, status)
        VALUES (?, ?, ?, ?, ?, 'submitted')
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