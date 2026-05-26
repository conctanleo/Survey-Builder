import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { spawn } from 'child_process';
import db from './models/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

app.use(cors());
app.use(express.json());

// ── API: 问卷 CRUD ──

// 获取所有问卷（列表）
app.get('/api/surveys', (req, res) => {
  const surveys = db.prepare('SELECT survey_id, config, created_at FROM surveys ORDER BY created_at DESC').all();
  res.json(surveys.map(s => ({
    surveyId: s.survey_id,
    config: JSON.parse(s.config),
    createdAt: s.created_at,
  })));
});

// 获取单个问卷完整数据
app.get('/api/surveys/:surveyId', (req, res) => {
  const row = db.prepare('SELECT * FROM surveys WHERE survey_id = ?').get(req.params.surveyId);
  if (!row) return res.status(404).json({ error: '问卷不存在' });
  res.json({
    surveyId: row.survey_id,
    config: JSON.parse(row.config),
    infoFields: JSON.parse(row.info_fields),
    questions: JSON.parse(row.questions),
    createdAt: row.created_at,
  });
});

// 创建问卷
app.post('/api/surveys', (req, res) => {
  const { surveyId, config, infoFields, questions } = req.body;
  if (!surveyId || !config || !config.title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: '缺少必填字段：surveyId、config.title、questions' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(surveyId)) {
    return res.status(400).json({ error: '问卷 ID 只能包含英文、数字、下划线和中划线' });
  }
  const exists = db.prepare('SELECT 1 FROM surveys WHERE survey_id = ?').get(surveyId);
  if (exists) return res.status(409).json({ error: '问卷 ID 已存在' });

  const finalConfig = {
    title: config.title,
    description: config.description || '',
    questionCount: questions.length,
    estimatedMinutes: config.estimatedMinutes || 5,
    displayMode: config.displayMode || 'paged',
  };
  const fields = Array.isArray(infoFields) ? infoFields : [];

  db.prepare(
    'INSERT INTO surveys (survey_id, config, info_fields, questions) VALUES (?, ?, ?, ?)'
  ).run(surveyId, JSON.stringify(finalConfig), JSON.stringify(fields), JSON.stringify(questions));

  res.status(201).json({ surveyId, config: finalConfig, infoFields: fields, questions });
});

// 更新问卷
app.put('/api/surveys/:surveyId', (req, res) => {
  const { config, infoFields, questions } = req.body;
  const row = db.prepare('SELECT 1 FROM surveys WHERE survey_id = ?').get(req.params.surveyId);
  if (!row) return res.status(404).json({ error: '问卷不存在' });

  const current = db.prepare('SELECT * FROM surveys WHERE survey_id = ?').get(req.params.surveyId);
  const currentConfig = JSON.parse(current.config);
  const currentFields = JSON.parse(current.info_fields);
  const currentQuestions = JSON.parse(current.questions);

  const newConfig = config ? {
    title: config.title || currentConfig.title,
    description: config.description ?? currentConfig.description,
    questionCount: Array.isArray(questions) ? questions.length : currentConfig.questionCount,
    estimatedMinutes: config.estimatedMinutes ?? currentConfig.estimatedMinutes,
    displayMode: config.displayMode || currentConfig.displayMode,
  } : { ...currentConfig, questionCount: Array.isArray(questions) ? questions.length : currentConfig.questionCount };

  const newFields = Array.isArray(infoFields) ? infoFields : currentFields;
  const newQuestions = Array.isArray(questions) ? questions : currentQuestions;

  db.prepare(
    'UPDATE surveys SET config = ?, info_fields = ?, questions = ? WHERE survey_id = ?'
  ).run(JSON.stringify(newConfig), JSON.stringify(newFields), JSON.stringify(newQuestions), req.params.surveyId);

  res.json({ surveyId: req.params.surveyId, config: newConfig, infoFields: newFields, questions: newQuestions });
});

// 删除问卷（级联删除 submissions + recordings）
app.delete('/api/surveys/:surveyId', (req, res) => {
  const row = db.prepare('SELECT 1 FROM surveys WHERE survey_id = ?').get(req.params.surveyId);
  if (!row) return res.status(404).json({ error: '问卷不存在' });

  const surveyDir = path.join(__dirname, '../../data/recordings', req.params.surveyId);

  const deleteSurvey = db.transaction((surveyId) => {
    const submissionIds = db.prepare('SELECT submission_id FROM submissions WHERE survey_id = ?')
      .all(surveyId).map(s => s.submission_id);

    if (submissionIds.length > 0) {
      const placeholders = submissionIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM transcription_queue WHERE submission_id IN (${placeholders})`).run(...submissionIds);
      db.prepare(`DELETE FROM recordings WHERE submission_id IN (${placeholders})`).run(...submissionIds);
      db.prepare('DELETE FROM submissions WHERE survey_id = ?').run(surveyId);
    }

    db.prepare('DELETE FROM surveys WHERE survey_id = ?').run(surveyId);
  });

  deleteSurvey(req.params.surveyId);

  // 清理磁盘上的录音文件
  try {
    if (fs.existsSync(surveyDir)) {
      fs.rmSync(surveyDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Failed to clean recording files:', err.message);
  }

  res.json({ success: true });
});

// ── API: 提交记录 ──

// 获取提交记录（支持按问卷筛选）
app.get('/api/submissions', (req, res) => {
  const { surveyId } = req.query;
  let rows;
  if (surveyId) {
    rows = db.prepare('SELECT * FROM submissions WHERE survey_id = ? ORDER BY submitted_at DESC').all(surveyId);
  } else {
    rows = db.prepare('SELECT * FROM submissions ORDER BY submitted_at DESC').all();
  }
  res.json(rows);
});

// ── API: 录音文件 ──

// 获取录音（支持按问卷筛选）
app.get('/api/recordings', (req, res) => {
  const { surveyId } = req.query;
  let rows;
  if (surveyId) {
    rows = db.prepare(`
      SELECT r.* FROM recordings r
      JOIN submissions s ON r.submission_id = s.submission_id
      WHERE s.survey_id = ?
      ORDER BY r.created_at DESC
    `).all(surveyId);
  } else {
    rows = db.prepare('SELECT * FROM recordings').all();
  }
  res.json(rows);
});

// ── API: 二维码 ──

app.get('/api/qrcode/:surveyId', async (req, res) => {
  try {
    const { surveyId } = req.params;
    const survey = db.prepare('SELECT survey_id FROM surveys WHERE survey_id = ?').get(surveyId);
    if (!survey) return res.status(404).json({ error: '问卷不存在' });
    const host = req.query.host || `${req.protocol}://${req.get('host').replace(PORT.toString(), '5173')}`;
    const url = `${host}/${surveyId}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    res.type('png').send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: 导出 ──

app.get('/api/export/:surveyId', (req, res) => {
  const { surveyId } = req.params;

  // Validate survey exists
  const survey = db.prepare('SELECT * FROM surveys WHERE survey_id = ?').get(surveyId);
  if (!survey) return res.status(404).json({ error: '问卷不存在' });

  const questions = JSON.parse(survey.questions);
  const infoFields = JSON.parse(survey.info_fields);
  const voiceQuestionIds = questions.filter(q => q.type === 'voice').map(q => q.id);

  // Fetch all submissions for this survey
  const submissions = db.prepare(
    'SELECT * FROM submissions WHERE survey_id = ? ORDER BY submitted_at ASC'
  ).all(surveyId);

  // Fetch all recordings for these submissions
  const allRecordings = [];
  const transcriptionMap = {};
  if (submissions.length > 0) {
    const subId = submissions.map(s => s.submission_id);
    const placeholders = subId.map(() => '?').join(',');

    allRecordings.push(...db.prepare(
      `SELECT * FROM recordings WHERE submission_id IN (${placeholders})`
    ).all(...subId));

    // Fetch completed transcriptions
    const transcriptions = db.prepare(
      `SELECT * FROM transcription_queue WHERE submission_id IN (${placeholders}) AND status = 'completed'`
    ).all(...subId);
    transcriptions.forEach(t => {
      transcriptionMap[`${t.submission_id}_${t.question_id}`] = t.result;
    });
  }

  // Build recording lookup: submission_id -> question_id -> recording
  const recordingLookup = {};
  allRecordings.forEach(r => {
    if (!recordingLookup[r.submission_id]) recordingLookup[r.submission_id] = {};
    recordingLookup[r.submission_id][r.question_id] = r;
  });

  const dataDir = path.join(__dirname, '../../data');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipFilename = `${surveyId}-export-${timestamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  });
  archive.pipe(res);

  // --- Build CSV ---
  const headers = [];
  infoFields.forEach(f => headers.push(f.label));
  questions.forEach(q => {
    headers.push(`${q.title}_答案`);
    if (voiceQuestionIds.includes(q.id)) headers.push(`${q.title}_转录文本`);
  });
  headers.push('submitted_at');

  const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

  submissions.forEach(sub => {
    const userInfo = JSON.parse(sub.user_info);
    const answers = JSON.parse(sub.answers);
    const cols = [];

    infoFields.forEach(f => {
      const val = userInfo[f.id] ?? '';
      cols.push(`"${String(val).replace(/"/g, '""')}"`);
    });

    questions.forEach(q => {
      const ans = answers[q.id];
      if (q.type === 'voice') {
        cols.push('"(录音)"');
        const transKey = `${sub.submission_id}_${q.id}`;
        const transText = transcriptionMap[transKey] || '';
        cols.push(`"${transText.replace(/"/g, '""')}"`);
      } else if (q.type === 'choice' && q.multiple && Array.isArray(ans)) {
        cols.push(`"${ans.join('、').replace(/"/g, '""')}"`);
      } else {
        cols.push(`"${String(ans ?? '').replace(/"/g, '""')}"`);
      }
    });

    cols.push(`"${sub.submitted_at || ''}"`);
    csvRows.push(cols.join(','));
  });

  archive.append(csvRows.join('\n'), { name: 'data.csv' });

  // --- Build Excel ---
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Survey Data');
  const xlsxHeaders = [];
  infoFields.forEach(f => xlsxHeaders.push(f.label));
  questions.forEach(q => {
    xlsxHeaders.push(`${q.title}_答案`);
    if (voiceQuestionIds.includes(q.id)) xlsxHeaders.push(`${q.title}_转录文本`);
  });
  xlsxHeaders.push('submitted_at');
  sheet.addRow(xlsxHeaders);

  submissions.forEach(sub => {
    const userInfo = JSON.parse(sub.user_info);
    const answers = JSON.parse(sub.answers);
    const rowVal = [];

    infoFields.forEach(f => rowVal.push(userInfo[f.id] ?? ''));
    questions.forEach(q => {
      const ans = answers[q.id];
      if (q.type === 'voice') {
        rowVal.push('(录音)');
        const transKey = `${sub.submission_id}_${q.id}`;
        rowVal.push(transcriptionMap[transKey] || '');
      } else if (q.type === 'choice' && q.multiple && Array.isArray(ans)) {
        rowVal.push(ans.join('、'));
      } else {
        rowVal.push(ans ?? '');
      }
    });
    rowVal.push(sub.submitted_at || '');
    sheet.addRow(rowVal);
  });

  // Stream Excel to buffer then add to archive
  const xlsxBuffer = workbook.xlsx.writeBuffer().then(buf => {
    archive.append(Buffer.from(buf), { name: 'data.xlsx' });
  });

  // --- Build JSON ---
  const jsonData = submissions.map(sub => {
    const userInfo = JSON.parse(sub.user_info);
    const answers = JSON.parse(sub.answers);
    const recs = recordingLookup[sub.submission_id] || {};
    const entry = {
      submissionId: sub.submission_id,
      userInfo,
      answers,
      recordings: {},
      transcriptions: {},
      submittedAt: sub.submitted_at,
    };

    voiceQuestionIds.forEach(qid => {
      if (recs[qid]) {
        entry.recordings[qid] = {
          filePath: recs[qid].file_path,
          mimeType: recs[qid].mime_type,
          fileSize: recs[qid].file_size,
        };
      }
      const transKey = `${sub.submission_id}_${qid}`;
      if (transcriptionMap[transKey]) {
        entry.transcriptions[qid] = transcriptionMap[transKey];
      }
    });

    return entry;
  });

  archive.append(JSON.stringify(jsonData, null, 2), { name: 'data.json' });

  // --- Add recording files ---
  allRecordings.forEach(rec => {
    const fullPath = path.join(dataDir, rec.file_path);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: `recordings/${rec.submission_id}/${rec.question_id}${path.extname(rec.file_path)}` });
    }
  });

  // Finalize after Excel buffer is ready
  xlsxBuffer.then(() => archive.finalize());
});

// ── API: 转录管理 ──

// 创建/触发转录任务
app.post('/api/transcriptions/start', (req, res) => {
  const { surveyId, submissionIds, selectAll, reprocess } = req.body;
  if (!surveyId) return res.status(400).json({ error: 'surveyId is required' });

  // Get all voice question recordings for this survey
  let recordings;
  if (selectAll || !submissionIds || submissionIds.length === 0) {
    recordings = db.prepare(`
      SELECT r.* FROM recordings r
      JOIN submissions s ON r.submission_id = s.submission_id
      WHERE s.survey_id = ?
    `).all(surveyId);
  } else {
    const placeholders = submissionIds.map(() => '?').join(',');
    recordings = db.prepare(`
      SELECT r.* FROM recordings r
      WHERE r.submission_id IN (${placeholders})
    `).all(...submissionIds);
  }

  let created = 0;
  let skipped = 0;

  const upsert = db.prepare(`
    INSERT INTO transcription_queue (submission_id, question_id, recording_id, status)
    VALUES (?, ?, ?, 'pending')
    ON CONFLICT(submission_id, question_id) DO UPDATE SET
      status = CASE WHEN ? THEN 'pending' ELSE status END,
      result = CASE WHEN ? THEN NULL ELSE result END,
      error = CASE WHEN ? THEN NULL ELSE error END,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertMany = db.transaction(() => {
    recordings.forEach(rec => {
      const existing = db.prepare(
        'SELECT status FROM transcription_queue WHERE submission_id = ? AND question_id = ?'
      ).get(rec.submission_id, rec.question_id);

      if (existing && existing.status === 'completed' && !reprocess) {
        skipped++;
        return;
      }
      upsert.run(rec.submission_id, rec.question_id, rec.id, reprocess ? 1 : 0, reprocess ? 1 : 0, reprocess ? 1 : 0);
      created++;
    });
  });

  insertMany();
  res.json({ created, skipped, total: recordings.length });
});

// 查询转录任务状态
app.get('/api/transcriptions/status', (req, res) => {
  const { surveyId } = req.query;
  if (!surveyId) return res.status(400).json({ error: 'surveyId query param is required' });

  const tasks = db.prepare(`
    SELECT tq.* FROM transcription_queue tq
    JOIN submissions s ON tq.submission_id = s.submission_id
    WHERE s.survey_id = ?
    ORDER BY tq.created_at ASC
  `).all(surveyId);

  const summary = { total: tasks.length, pending: 0, processing: 0, completed: 0, failed: 0 };
  tasks.forEach(t => summary[t.status]++);

  res.json({
    surveyId,
    summary,
    tasks: tasks.map(t => ({
      id: t.id,
      submissionId: t.submission_id,
      questionId: t.question_id,
      status: t.status,
      result: t.result,
      error: t.error,
      updatedAt: t.updated_at,
    })),
  });
});

// 查询单个提交的转录状态
app.get('/api/transcriptions/status/:submissionId', (req, res) => {
  const tasks = db.prepare(
    'SELECT * FROM transcription_queue WHERE submission_id = ? ORDER BY created_at ASC'
  ).all(req.params.submissionId);

  res.json({
    submissionId: req.params.submissionId,
    tasks: tasks.map(t => ({
      id: t.id,
      questionId: t.question_id,
      status: t.status,
      result: t.result,
      error: t.error,
      updatedAt: t.updated_at,
    })),
  });
});

// ── STT 微服务管理 ──

const STT_SERVICE_URL = process.env.VIBEVOICE_STT_URL || 'http://127.0.0.1:3002';
let sttProcess = null;
let pollerInterval = null;

function startSttService() {
  const scriptPath = path.join(__dirname, '..', 'stt_service.py');
  if (!fs.existsSync(scriptPath)) {
    console.warn('[STT] stt_service.py not found, skipping auto-start');
    return;
  }

  sttProcess = spawn('python', [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  sttProcess.stdout.on('data', (data) => console.log(`[STT] ${data.toString().trim()}`));
  sttProcess.stderr.on('data', (data) => console.error(`[STT] ${data.toString().trim()}`));
  sttProcess.on('close', (code) => console.log(`[STT] Process exited with code ${code}`));

  console.log('[STT] Python microservice starting on', STT_SERVICE_URL);
}

function stopSttService() {
  if (sttProcess) {
    sttProcess.kill('SIGTERM');
    sttProcess = null;
  }
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

// 转录轮询器
function startTranscriptionPoller() {
  pollerInterval = setInterval(async () => {
    try {
      // Check STT service health first
      const healthRes = await fetch(`${STT_SERVICE_URL}/health`).catch(() => null);
      if (!healthRes || !healthRes.ok) {
        return; // Service not ready, skip this poll
      }

      // Get oldest pending task
      const task = db.prepare(
        "SELECT * FROM transcription_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      ).get();

      if (!task) return;

      // Set to processing
      db.prepare(
        "UPDATE transcription_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(task.id);

      // Get the recording file path
      const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(task.recording_id);
      if (!recording) {
        db.prepare(
          "UPDATE transcription_queue SET status = 'failed', error = 'Recording not found', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(task.id);
        return;
      }

      const recordingFullPath = path.resolve(
        path.join(__dirname, '../../data'), recording.file_path
      );

      // Call STT service
      const sttRes = await fetch(`${STT_SERVICE_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: recordingFullPath }),
      });

      if (sttRes.ok) {
        const data = await sttRes.json();
        db.prepare(
          "UPDATE transcription_queue SET status = 'completed', result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(data.text, task.id);
      } else {
        const err = await sttRes.json().catch(() => ({ error: 'Unknown error' }));
        db.prepare(
          "UPDATE transcription_queue SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(err.error || JSON.stringify(err), task.id);
      }
    } catch (err) {
      console.error('[STT Poller] Error:', err.message);
    }
  }, 2000);
}

// 启动（STT 服务暂未启用，需要 llama-cpp-python 和 ffmpeg）
// startSttService();
// startTranscriptionPoller();

// 优雅关闭
// process.on('exit', stopSttService);
// process.on('SIGINT', () => { stopSttService(); process.exit(); });
// process.on('SIGTERM', () => { stopSttService(); process.exit(); });

// ── 管理页面 ──

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>问卷管理后台</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px 40px; }
    h1 { color: #333; margin-bottom: 20px; }
    h2 { color: #666; margin-top: 30px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; font-size: 13px; }
    th { background: #f0f0f0; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .json { font-size: 12px; color: #666; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap; }
    .empty { color: #999; font-style: italic; }
    .btn { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; transition: background .2s; }
    .btn-primary { background: #1677ff; color: white; }
    .btn-primary:hover { background: #0958d9; }
    .btn-success { background: #52c41a; color: white; }
    .btn-success:hover { background: #389e0d; }
    .btn-danger { background: #ff4d4f; color: white; }
    .btn-danger:hover { background: #cf1322; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-ghost { background: transparent; color: #1677ff; border: 1px solid #1677ff; }
    .btn-ghost:hover { background: #f0f5ff; }

    /* 统计卡片 */
    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat-card { background: white; border-radius: 8px; padding: 16px 24px; flex: 1; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .stat-card .num { font-size: 28px; font-weight: 700; color: #1677ff; }
    .stat-card .label { font-size: 13px; color: #999; margin-top: 4px; }

    /* 问卷卡片 */
    .survey-card { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .survey-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .survey-info h3 { margin: 0 0 4px; color: #333; font-size: 15px; }
    .survey-info span { color: #999; font-size: 13px; }
    .survey-actions { display: flex; gap: 8px; align-items: center; }

    /* 弹窗通用 */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 999; justify-content: center; align-items: flex-start; padding-top: 60px; overflow-y: auto; }
    .modal-overlay.active { display: flex; }
    .modal { background: white; border-radius: 12px; padding: 30px; max-width: 420px; width: 90%; text-align: center; }
    .modal img { max-width: 280px; margin: 16px 0; }
    .modal p { color: #666; font-size: 14px; margin: 4px 0; }
    .modal .url { font-family: monospace; font-size: 12px; background: #f5f5f5; padding: 6px 10px; border-radius: 4px; word-break: break-all; }
    .modal-actions { margin-top: 20px; display: flex; gap: 10px; justify-content: center; }

    /* 大弹窗（创建问卷、问卷详情） */
    .modal-wide { max-width: 800px; text-align: left; max-height: 85vh; overflow-y: auto; }
    .modal-wide h3 { font-size: 18px; margin-bottom: 16px; text-align: center; }

    /* 表单样式 */
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 13px; font-weight: 500; color: #555; margin-bottom: 4px; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; padding: 8px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px;
      transition: border-color .2s;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #1677ff; outline: none; }
    .form-group textarea { resize: vertical; min-height: 60px; }
    .form-row { display: flex; gap: 12px; }
    .form-row .form-group { flex: 1; }
    .form-check { display: flex; align-items: center; gap: 6px; }
    .form-check input[type="checkbox"] { width: auto; }

    /* 动态列表项 */
    .field-item { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 12px; margin-bottom: 10px; position: relative; }
    .field-item .btn-remove { position: absolute; top: 8px; right: 8px; background: #ff4d4f; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 14px; cursor: pointer; line-height: 1; }
    .field-item .btn-remove:hover { background: #cf1322; }

    /* 步骤指示器 */
    .steps { display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; }
    .step { width: 36px; height: 4px; border-radius: 2px; background: #e0e0e0; transition: background .3s; }
    .step.active { background: #1677ff; }
    .step.done { background: #52c41a; }

    /* 标签 */
    .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; }
    .tag-voice { background: #e6f7ff; color: #1677ff; }
    .tag-choice { background: #f6ffed; color: #52c41a; }
    .tag-text { background: #fff7e6; color: #fa8c16; }

    /* 筛选栏 */
    .filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .filter-bar select { padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; }
    .filter-bar label { font-size: 13px; color: #666; }

    /* 详情表格 */
    .detail-section { margin-bottom: 20px; }
    .detail-section h4 { font-size: 14px; color: #555; margin-bottom: 8px; border-left: 3px solid #1677ff; padding-left: 8px; }

    /* 转录状态样式 */
    .status-pending { background: #fff7e6; color: #fa8c16; }
    .status-processing { background: #e6f7ff; color: #1677ff; }
    .status-completed { background: #f6ffed; color: #52c41a; }
    .status-failed { background: #fff2f0; color: #ff4d4f; }
    .progress-bar { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; margin: 8px 0; }
    .progress-bar .fill { height: 100%; background: #52c41a; border-radius: 4px; transition: width 0.5s ease; }
    .progress-bar .fill.failed { background: #ff4d4f; }
    .summary-tags { display: flex; gap: 12px; margin: 12px 0; }
    .summary-tag { font-size: 12px; padding: 2px 10px; border-radius: 10px; }
    .modal-task-table { max-height: 400px; overflow-y: auto; margin-top: 12px; }
    .modal-task-table th { position: sticky; top: 0; z-index: 1; }
    .auto-refresh { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>问卷管理后台</h1>

    <div class="stats" id="stats"></div>

    <h2>
      <span>问卷列表</span>
      <button class="btn btn-primary" onclick="openCreateModal()">+ 新建问卷</button>
    </h2>
    <div id="surveys">加载中...</div>

    <h2>提交记录</h2>
    <div class="filter-bar">
      <label>按问卷筛选：</label>
      <select id="submissionFilter" onchange="loadSubmissions()"></select>
    </div>
    <div id="submissions">加载中...</div>

    <h2>录音文件</h2>
    <div class="filter-bar">
      <label>按问卷筛选：</label>
      <select id="recordingFilter" onchange="loadRecordings()"></select>
    </div>
    <div id="recordings">加载中...</div>
  </div>

  <!-- 二维码弹窗 -->
  <div class="modal-overlay" id="qrModal">
    <div class="modal">
      <h3 id="qrTitle"></h3>
      <img id="qrImage" alt="二维码" />
      <p>扫码进入问卷</p>
      <div class="url" id="qrUrl"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="downloadQR()">下载二维码</button>
        <button class="btn" style="background:#eee" onclick="closeQR()">关闭</button>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; align-items:center; justify-content:center;">
        <label style="font-size:13px;color:#666;">访问地址：</label>
        <input id="qrHost" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;" placeholder="http://localhost:5173" />
        <button class="btn btn-primary btn-sm" onclick="refreshQR()">刷新</button>
      </div>
    </div>
  </div>

  <!-- 创建问卷弹窗 -->
  <div class="modal-overlay" id="createModal">
    <div class="modal modal-wide">
      <h3 id="createTitle">新建问卷</h3>
      <div class="steps" id="createSteps">
        <div class="step active" data-step="0"></div>
        <div class="step" data-step="1"></div>
        <div class="step" data-step="2"></div>
      </div>
      <div id="createStep0" class="step-content">
        <h4 style="font-size:14px;color:#555;margin-bottom:12px;">基本信息</h4>
        <div class="form-group">
          <label>问卷 ID（英文/数字，用于 URL）</label>
          <input id="c-surveyId" placeholder="例：survey-2024-01" />
        </div>
        <div class="form-group">
          <label>问卷标题 *</label>
          <input id="c-title" placeholder="例：工作满意度调查" />
        </div>
        <div class="form-group">
          <label>问卷描述</label>
          <textarea id="c-desc" placeholder="问卷目的说明（选填）"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>预计时长（分钟）</label>
            <input id="c-minutes" type="number" value="5" min="1" />
          </div>
          <div class="form-group">
            <label>显示模式</label>
            <select id="c-displayMode">
              <option value="paged">分页（每题一页）</option>
              <option value="scroll">连续滚动</option>
            </select>
          </div>
        </div>
      </div>
      <div id="createStep1" class="step-content" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h4 style="font-size:14px;color:#555;">信息采集字段</h4>
          <button class="btn btn-sm btn-ghost" onclick="addInfoField()">+ 添加字段</button>
        </div>
        <div id="c-infoFields"></div>
      </div>
      <div id="createStep2" class="step-content" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h4 style="font-size:14px;color:#555;">题目列表</h4>
          <button class="btn btn-sm btn-ghost" onclick="addQuestion()">+ 添加题目</button>
        </div>
        <div id="c-questions"></div>
      </div>
      <div class="modal-actions" style="margin-top:24px;">
        <button class="btn" style="background:#eee" id="createPrev" onclick="createStepNav(-1)">上一步</button>
        <button class="btn btn-primary" id="createNext" onclick="createStepNav(1)">下一步</button>
        <button class="btn btn-success" id="createSubmit" style="display:none" onclick="submitSurvey()">创建问卷</button>
        <button class="btn" style="background:#eee" onclick="closeCreateModal()">取消</button>
      </div>
    </div>
  </div>

  <!-- 问卷详情弹窗 -->
  <div class="modal-overlay" id="detailModal">
    <div class="modal modal-wide">
      <h3 id="detailTitle">问卷详情</h3>
      <div id="detailContent"></div>
      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn" style="background:#eee" onclick="closeDetail()">关闭</button>
      </div>
    </div>
  </div>

  <!-- 转录管理弹窗 -->
  <div class="modal-overlay" id="transcribeModal">
    <div class="modal modal-wide" style="max-width:900px;">
      <h3 id="transcribeTitle">转录管理</h3>
      <div id="transcribeContent">
        <div class="summary-tags" id="transcribeSummary"></div>
        <div class="progress-bar"><div class="fill" id="transcribeProgress" style="width:0%"></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0;">
          <div>
            <label class="form-check">
              <input type="checkbox" id="transcribeSelectAll" onchange="toggleSelectAll()" /> 全选所有录音
            </label>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" id="btnTranscribeStart" onclick="startTranscription()">▶ 开始转录</button>
            <button class="btn btn-ghost btn-sm" onclick="refreshTranscriptions()">↻ 刷新</button>
          </div>
        </div>
        <div class="modal-task-table">
          <table>
            <thead><tr>
              <th style="width:30px;">选</th>
              <th>提交ID</th>
              <th>题目ID</th>
              <th style="width:90px;">状态</th>
              <th>转录结果</th>
            </tr></thead>
            <tbody id="transcribeTaskTable"></tbody>
          </table>
        </div>
        <div class="auto-refresh">
          <label class="form-check">
            <input type="checkbox" id="autoRefresh" checked onchange="toggleAutoRefresh()" />
            <span>自动刷新 (2s)</span>
          </label>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn" style="background:#eee" onclick="closeTranscribeModal()">关闭</button>
      </div>
    </div>
  </div>

  <script>
    // ── 全局状态 ──
    let allSurveys = [];
    let createStep = 0;
    let infoFieldIdx = 0;
    let questionIdx = 0;

    // ── 初始化 ──
    async function load() {
      const [surveysRes, subsRes, recsRes] = await Promise.all([
        fetch('/api/surveys'),
        fetch('/api/submissions'),
        fetch('/api/recordings'),
      ]);
      allSurveys = await surveysRes.json();
      const submissions = await subsRes.json();
      const recordings = await recsRes.json();

      renderStats(allSurveys.length, submissions.length, recordings.length);
      renderSurveys(allSurveys);
      renderSubmissions(submissions);
      renderRecordings(recordings);
      renderFilters(allSurveys);
    }

    function renderStats(surveyCount, subCount, recCount) {
      document.getElementById('stats').innerHTML =
        '<div class="stat-card"><div class="num">' + surveyCount + '</div><div class="label">问卷数</div></div>' +
        '<div class="stat-card"><div class="num">' + subCount + '</div><div class="label">提交数</div></div>' +
        '<div class="stat-card"><div class="num">' + recCount + '</div><div class="label">录音数</div></div>';
    }

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function renderSurveys(surveys) {
      let html = '';
      if (surveys.length === 0) {
        html = '<p class="empty">暂无问卷，点击上方「新建问卷」创建</p>';
      } else {
        surveys.forEach(s => {
          html += '<div class="survey-card">' +
            '<div class="survey-info"><h3>' + esc(s.config.title) + '</h3>' +
            '<span>ID: ' + esc(s.surveyId) + ' · ' + s.config.questionCount + '题 · ' + s.config.estimatedMinutes + '分钟 · 创建于 ' + s.createdAt + '</span></div>' +
            '<div class="survey-actions">' +
            '<button class="btn btn-ghost btn-sm" onclick="showDetail(\\'' + esc(s.surveyId) + '\\')">详情</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="showQR(\\'' + esc(s.surveyId) + '\\', \\'' + esc(s.config.title).replace(/'/g, "\\\\'") + '\\')">二维码</button>' +
            '<button class="btn btn-success btn-sm" onclick="exportSurvey(\\'' + esc(s.surveyId) + '\\')">导出</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteSurvey(\\'' + esc(s.surveyId) + '\\')">删除</button>' +
            '</div></div>';
        });
      }
      document.getElementById('surveys').innerHTML = html;
    }

    function renderFilters(surveys) {
      const saved = localStorage.getItem('adminFilterSurveyId') || '';
      const opts = '<option value="">全部</option>' + surveys.map(s =>
        '<option value="' + esc(s.surveyId) + '"' + (saved === s.surveyId ? ' selected' : '') + '>' + esc(s.config.title) + ' (' + esc(s.surveyId) + ')</option>'
      ).join('');
      document.getElementById('submissionFilter').innerHTML = opts;
      document.getElementById('recordingFilter').innerHTML = opts;
    }

    // ── 筛选加载 ──
    async function loadSubmissions() {
      const sid = document.getElementById('submissionFilter').value;
      localStorage.setItem('adminFilterSurveyId', sid);
      document.getElementById('recordingFilter').value = sid;
      const url = sid ? '/api/submissions?surveyId=' + encodeURIComponent(sid) : '/api/submissions';
      const res = await fetch(url);
      renderSubmissions(await res.json());
      await loadRecordings();
    }

    async function loadRecordings() {
      const sid = document.getElementById('recordingFilter').value;
      localStorage.setItem('adminFilterSurveyId', sid);
      const url = sid ? '/api/recordings?surveyId=' + encodeURIComponent(sid) : '/api/recordings';
      const res = await fetch(url);
      renderRecordings(await res.json());
    }

    function renderSubmissions(submissions) {
      let html = '<table><tr><th>ID</th><th>问卷</th><th>用户信息</th><th>答案</th><th>录音时长</th><th>提交时间</th></tr>';
      if (submissions.length === 0) {
        html += '<tr><td colspan="6" class="empty">暂无数据</td></tr>';
      } else {
        submissions.forEach(s => {
          html += '<tr>';
          html += '<td>' + esc(s.submission_id.substring(0, 8)) + '...</td>';
          html += '<td>' + esc(s.survey_id) + '</td>';
          html += '<td class="json">' + esc(JSON.stringify(JSON.parse(s.user_info), null, 2)) + '</td>';
          html += '<td class="json">' + esc(JSON.stringify(JSON.parse(s.answers), null, 2)) + '</td>';
          html += '<td class="json">' + esc(s.recording_durations) + '</td>';
          html += '<td>' + esc(s.submitted_at) + '</td>';
          html += '</tr>';
        });
      }
      html += '</table>';
      document.getElementById('submissions').innerHTML = html;
    }

    function renderRecordings(recordings) {
      let html = '<table><tr><th>ID</th><th>Question</th><th>文件路径</th><th>MIME类型</th><th>文件大小</th></tr>';
      if (recordings.length === 0) {
        html += '<tr><td colspan="5" class="empty">暂无录音文件</td></tr>';
      } else {
        recordings.forEach(r => {
          html += '<tr>';
          html += '<td>' + r.id + '</td>';
          html += '<td>' + esc(r.question_id) + '</td>';
          html += '<td>' + esc(r.file_path) + '</td>';
          html += '<td>' + esc(r.mime_type) + '</td>';
          html += '<td>' + (r.file_size / 1024).toFixed(1) + ' KB</td>';
          html += '</tr>';
        });
      }
      html += '</table>';
      document.getElementById('recordings').innerHTML = html;
    }

    // ── 删除问卷 ──
    async function deleteSurvey(surveyId) {
      if (!confirm('确定删除问卷 "' + surveyId + '"？该操作将同时删除所有关联的提交记录和录音，不可恢复。')) return;
      const res = await fetch('/api/surveys/' + encodeURIComponent(surveyId), { method: 'DELETE' });
      if (res.ok) {
        load();
      } else {
        const err = await res.json();
        alert('删除失败：' + err.error);
      }
    }

    // ── 问卷详情 ──
    async function showDetail(surveyId) {
      const res = await fetch('/api/surveys/' + encodeURIComponent(surveyId));
      if (!res.ok) return alert('加载失败');
      const data = await res.json();
      document.getElementById('detailTitle').textContent = data.config.title;

      let html = '<div class="detail-section"><h4>基本信息</h4>' +
        '<p style="font-size:13px;color:#666;margin-bottom:4px;">ID: ' + esc(data.surveyId) + '</p>' +
        '<p style="font-size:13px;color:#666;margin-bottom:4px;">描述: ' + esc(data.config.description || '无') + '</p>' +
        '<p style="font-size:13px;color:#666;margin-bottom:4px;">题目数: ' + data.questions.length + ' · 预计: ' + data.config.estimatedMinutes + '分钟 · 模式: ' + data.config.displayMode + '</p>' +
        '</div>';

      if (data.infoFields.length > 0) {
        html += '<div class="detail-section"><h4>信息采集字段</h4><table><tr><th>ID</th><th>标签</th><th>类型</th><th>必填</th></tr>';
        data.infoFields.forEach(f => {
          html += '<tr><td>' + esc(f.id) + '</td><td>' + esc(f.label) + '</td><td>' + esc(f.type) + '</td><td>' + (f.required ? '是' : '否') + '</td></tr>';
        });
        html += '</table></div>';
      }

      html += '<div class="detail-section"><h4>题目列表</h4>';
      data.questions.forEach((q, i) => {
        const tagClass = q.type === 'voice' ? 'tag-voice' : q.type === 'choice' ? 'tag-choice' : 'tag-text';
        const typeLabel = q.type === 'voice' ? '语音题' : q.type === 'choice' ? '选择题' : '填空题';
        html += '<div class="field-item" style="margin-bottom:8px;">' +
          '<span class="tag ' + tagClass + '">' + typeLabel + '</span> ' +
          '<strong style="font-size:13px;">' + (i+1) + '. ' + esc(q.title) + '</strong>' +
          (q.required ? ' <span style="color:#ff4d4f;font-size:12px;">*必填</span>' : '') +
          (q.type === 'choice' ? '<br><span style="font-size:12px;color:#888;">' + (q.multiple ? '多选' : '单选') + ': ' + esc((q.options||[]).join('、')) + '</span>' : '') +
          '</div>';
      });
      html += '</div>';

      document.getElementById('detailContent').innerHTML = html;
      document.getElementById('detailModal').classList.add('active');
    }

    function closeDetail() {
      document.getElementById('detailModal').classList.remove('active');
    }

    // ── 二维码 ──
    let currentSurveyId = '';
    function showQR(surveyId, title) {
      currentSurveyId = surveyId;
      document.getElementById('qrTitle').textContent = title;
      document.getElementById('qrHost').value = location.protocol + '//' + location.hostname + ':5173';
      refreshQR();
      document.getElementById('qrModal').classList.add('active');
    }
    function closeQR() { document.getElementById('qrModal').classList.remove('active'); }
    function refreshQR() {
      const host = document.getElementById('qrHost').value;
      document.getElementById('qrUrl').textContent = host + '/' + currentSurveyId;
      document.getElementById('qrImage').src = '/api/qrcode/' + currentSurveyId + '?host=' + encodeURIComponent(host);
    }
    function downloadQR() {
      const a = document.createElement('a');
      a.href = document.getElementById('qrImage').src;
      a.download = 'qrcode-' + currentSurveyId + '.png';
      a.click();
    }

    // ── 创建问卷 ──
    function openCreateModal() {
      createStep = 0;
      infoFieldIdx = 0;
      questionIdx = 0;
      document.getElementById('c-surveyId').value = '';
      document.getElementById('c-title').value = '';
      document.getElementById('c-desc').value = '';
      document.getElementById('c-minutes').value = '5';
      document.getElementById('c-displayMode').value = 'paged';
      document.getElementById('c-infoFields').innerHTML = '';
      document.getElementById('c-questions').innerHTML = '';
      addInfoField('name', '姓名', 'text', true, '请输入您的姓名');
      addInfoField('phone', '手机号', 'tel', true, '请输入手机号');
      updateCreateSteps();
      document.getElementById('createModal').classList.add('active');
    }

    function closeCreateModal() { document.getElementById('createModal').classList.remove('active'); }

    function updateCreateSteps() {
      for (let i = 0; i < 3; i++) {
        document.getElementById('createStep' + i).style.display = i === createStep ? '' : 'none';
        const dot = document.querySelector('.step[data-step="' + i + '"]');
        dot.className = 'step' + (i < createStep ? ' done' : i === createStep ? ' active' : '');
      }
      document.getElementById('createPrev').style.display = createStep > 0 ? '' : 'none';
      document.getElementById('createNext').style.display = createStep < 2 ? '' : 'none';
      document.getElementById('createSubmit').style.display = createStep === 2 ? '' : 'none';
    }

    function createStepNav(dir) {
      if (createStep === 0 && dir > 0) {
        const sid = document.getElementById('c-surveyId').value.trim();
        const title = document.getElementById('c-title').value.trim();
        if (!sid) return alert('请填写问卷 ID');
        if (!title) return alert('请填写问卷标题');
        if (!/^[a-zA-Z0-9_-]+$/.test(sid)) return alert('问卷 ID 只能包含英文、数字、下划线和中划线');
      }
      createStep = Math.max(0, Math.min(2, createStep + dir));
      updateCreateSteps();
    }

    function addInfoField(id, label, type, required, placeholder) {
      const idx = infoFieldIdx++;
      const div = document.createElement('div');
      div.className = 'field-item';
      div.dataset.idx = idx;
      div.innerHTML =
        '<button class="btn-remove" onclick="this.parentElement.remove()">\\u00d7</button>' +
        '<div class="form-row">' +
        '<div class="form-group"><label>字段 ID</label><input data-role="id" value="' + esc(id || '') + '" placeholder="例：name" /></div>' +
        '<div class="form-group"><label>标签</label><input data-role="label" value="' + esc(label || '') + '" placeholder="例：姓名" /></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label>类型</label><select data-role="type"><option value="text"' + (type==='text'?' selected':'') + '>文本</option><option value="tel"' + (type==='tel'?' selected':'') + '>电话</option><option value="email"' + (type==='email'?' selected':'') + '>邮箱</option><option value="number"' + (type==='number'?' selected':'') + '>数字</option></select></div>' +
        '<div class="form-group"><label>占位文字</label><input data-role="placeholder" value="' + esc(placeholder || '') + '" /></div>' +
        '<div class="form-group" style="flex:0 0 auto;padding-top:20px;"><label class="form-check"><input data-role="required" type="checkbox"' + (required ? ' checked' : '') + ' /> 必填</label></div>' +
        '</div>';
      document.getElementById('c-infoFields').appendChild(div);
    }

    function addQuestion(id, type, title, required, extra) {
      const idx = questionIdx++;
      type = type || 'choice';
      extra = extra || {};
      const div = document.createElement('div');
      div.className = 'field-item';
      div.dataset.idx = idx;
      div.innerHTML =
        '<button class="btn-remove" onclick="removeQuestion(this)">\\u00d7</button>' +
        '<div class="form-row">' +
        '<div class="form-group" style="flex:0 0 100px"><label>题目 ID</label><input data-role="id" value="' + esc(id || 'q' + (idx+1)) + '" placeholder="q1" /></div>' +
        '<div class="form-group" style="flex:0 0 130px"><label>类型</label><select data-role="type" onchange="onTypeChange(this)">' +
          '<option value="voice"' + (type==='voice'?' selected':'') + '>语音题</option>' +
          '<option value="choice"' + (type==='choice'?' selected':'') + '>选择题</option>' +
          '<option value="text"' + (type==='text'?' selected':'') + '>填空题</option>' +
        '</select></div>' +
        '<div class="form-group"><label>题目标题</label><input data-role="title" value="' + esc(title || '') + '" placeholder="请输入题目" /></div>' +
        '<div class="form-group" style="flex:0 0 auto;padding-top:20px;"><label class="form-check"><input data-role="required" type="checkbox"' + (required ? ' checked' : '') + ' /> 必填</label></div>' +
        '</div>' +
        '<div data-role="extra">' + buildExtraHtml(type, extra) + '</div>';
      document.getElementById('c-questions').appendChild(div);
    }

    function buildExtraHtml(type, extra) {
      if (type === 'voice') {
        return '<div class="form-row"><div class="form-group" style="flex:0 0 200px"><label>最长录音（秒）</label><input data-role="maxLength" type="number" value="' + (extra.maxLength || 300) + '" /></div></div>';
      }
      if (type === 'text') {
        return '<div class="form-row">' +
          '<div class="form-group" style="flex:0 0 200px"><label>最大字数</label><input data-role="maxLength" type="number" value="' + (extra.maxLength || 500) + '" /></div>' +
          '<div class="form-group"><label>占位文字</label><input data-role="placeholder" value="' + esc(extra.placeholder || '') + '" /></div></div>';
      }
      // choice
      const opts = (extra.options || ['选项1', '选项2']).join('\\n');
      return '<div class="form-row">' +
        '<div class="form-group" style="flex:0 0 100px"><label class="form-check"><input data-role="multiple" type="checkbox"' + (extra.multiple ? ' checked' : '') + ' /> 多选</label></div>' +
        '<div class="form-group"><label>选项（每行一个）</label><textarea data-role="options" rows="3" placeholder="每行一个选项">' + esc(opts) + '</textarea></div></div>';
    }

    function onTypeChange(sel) {
      const extra = sel.closest('.field-item').querySelector('[data-role="extra"]');
      extra.innerHTML = buildExtraHtml(sel.value, {});
    }

    function removeQuestion(btn) {
      btn.closest('.field-item').remove();
    }

    async function submitSurvey() {
      const surveyId = document.getElementById('c-surveyId').value.trim();
      const config = {
        title: document.getElementById('c-title').value.trim(),
        description: document.getElementById('c-desc').value.trim(),
        estimatedMinutes: parseInt(document.getElementById('c-minutes').value) || 5,
        displayMode: document.getElementById('c-displayMode').value,
      };

      // 收集 infoFields
      const infoFields = [];
      document.querySelectorAll('#c-infoFields .field-item').forEach(el => {
        const val = (r) => el.querySelector('[data-role="' + r + '"]');
        const id = val('id').value.trim();
        if (!id) return;
        infoFields.push({
          id, label: val('label').value.trim(), type: val('type').value,
          required: val('required').checked, placeholder: val('placeholder').value.trim(),
        });
      });

      // 收集 questions
      const questions = [];
      document.querySelectorAll('#c-questions .field-item').forEach(el => {
        const val = (r) => el.querySelector('[data-role="' + r + '"]');
        const id = val('id').value.trim();
        const type = val('type').value;
        const title = val('title').value.trim();
        if (!id || !title) return;
        const q = { id, type, title, required: val('required').checked };
        if (type === 'voice') q.maxLength = parseInt(val('maxLength').value) || 300;
        if (type === 'text') { q.maxLength = parseInt(val('maxLength').value) || 500; q.placeholder = val('placeholder').value.trim(); }
        if (type === 'choice') {
          q.multiple = val('multiple').checked;
          q.options = val('options').value.split('\\n').map(s => s.trim()).filter(Boolean);
        }
        questions.push(q);
      });

      if (questions.length === 0) return alert('请至少添加一道题目');

      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId, config, infoFields, questions }),
      });

      if (res.ok) {
        closeCreateModal();
        load();
      } else {
        const err = await res.json();
        alert('创建失败：' + err.error);
      }
    }

    // ── 点击遮罩关闭弹窗 ──
    ['qrModal', 'createModal', 'detailModal', 'transcribeModal'].forEach(id => {
      document.getElementById(id).addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
      });
    });

    // ── 导出 ──
    function exportSurvey(surveyId) {
      const a = document.createElement('a');
      a.href = '/api/export/' + encodeURIComponent(surveyId);
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // ── 转录管理 ──
    let transcribeSurveyId = '';
    let autoRefreshTimer = null;

    function openTranscribeModal(surveyId, title) {
      transcribeSurveyId = surveyId;
      document.getElementById('transcribeTitle').textContent = '转录管理: ' + title;
      document.getElementById('transcribeModal').classList.add('active');
      refreshTranscriptions();
      document.getElementById('autoRefresh').checked = true;
      startAutoRefresh();
    }

    function closeTranscribeModal() {
      document.getElementById('transcribeModal').classList.remove('active');
      stopAutoRefresh();
    }

    function toggleAutoRefresh() {
      if (document.getElementById('autoRefresh').checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    }

    function startAutoRefresh() {
      stopAutoRefresh();
      autoRefreshTimer = setInterval(refreshTranscriptions, 2000);
    }

    function stopAutoRefresh() {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    }

    async function refreshTranscriptions() {
      if (!transcribeSurveyId) return;
      try {
        const res = await fetch('/api/transcriptions/status?surveyId=' + encodeURIComponent(transcribeSurveyId));
        const data = await res.json();
        renderTranscriptionSummary(data.summary);
        renderTranscriptionTasks(data.tasks);
      } catch (err) {
        console.error('Failed to load transcription status:', err);
      }
    }

    function renderTranscriptionSummary(summary) {
      const pct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;
      document.getElementById('transcribeProgress').style.width = pct + '%';
      document.getElementById('transcribeProgress').className = 'fill' + (summary.failed > 0 && pct === 100 ? ' failed' : '');

      document.getElementById('transcribeSummary').innerHTML =
        '<span class="summary-tag status-pending">⏳ Pending: ' + summary.pending + '</span>' +
        '<span class="summary-tag status-processing">🔄 Processing: ' + summary.processing + '</span>' +
        '<span class="summary-tag status-completed">✅ Completed: ' + summary.completed + '</span>' +
        '<span class="summary-tag status-failed">❌ Failed: ' + summary.failed + '</span>';
    }

    function renderTranscriptionTasks(tasks) {
      if (tasks.length === 0) {
        document.getElementById('transcribeTaskTable').innerHTML =
          '<tr><td colspan="5" class="empty">暂无录音可转录</td></tr>';
        return;
      }

      let html = '';
      tasks.forEach(t => {
        const statusClass = 'status-' + t.status;
        const statusLabel = {
          pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败'
        }[t.status] || t.status;
        const result = t.result
          ? t.result.substring(0, 80) + (t.result.length > 80 ? '...' : '')
          : (t.error ? 'Error: ' + t.error.substring(0, 60) : '');
        const checked = (t.status === 'pending' || t.status === 'failed') ? ' checked' : '';

        html += '<tr>' +
          '<td><input type="checkbox" class="transcribe-checkbox" data-id="' + t.id + '"' + checked + ' /></td>' +
          '<td>' + esc(t.submissionId.substring(0, 12)) + '...</td>' +
          '<td>' + esc(t.questionId) + '</td>' +
          '<td><span class="tag ' + statusClass + '">' + statusLabel + '</span></td>' +
          '<td style="font-size:12px;color:#666;">' + esc(result) + '</td>' +
          '</tr>';
      });
      document.getElementById('transcribeTaskTable').innerHTML = html;
    }

    function toggleSelectAll() {
      const selectAll = document.getElementById('transcribeSelectAll').checked;
      document.querySelectorAll('.transcribe-checkbox').forEach(cb => {
        cb.checked = selectAll;
      });
    }

    async function startTranscription() {
      const selectAll = document.getElementById('transcribeSelectAll').checked;

      const body = {
        surveyId: transcribeSurveyId,
        selectAll: selectAll,
        reprocess: false,
      };

      if (!selectAll) {
        // Get submission IDs from checked rows
        const checkedTaskIds = [];
        document.querySelectorAll('.transcribe-checkbox:checked').forEach(cb => {
          checkedTaskIds.push(parseInt(cb.dataset.id));
        });

        if (checkedTaskIds.length === 0) {
          alert('请至少选择一个录音');
          return;
        }

        // Fetch current tasks to get submission IDs for the checked task IDs
        const tasksRes = await fetch('/api/transcriptions/status?surveyId=' + encodeURIComponent(transcribeSurveyId));
        const tasksData = await tasksRes.json();
        const submissionIds = [...new Set(
          tasksData.tasks
            .filter(t => checkedTaskIds.includes(t.id))
            .map(t => t.submissionId)
        )];
        body.submissionIds = submissionIds;
        body.selectAll = false;
      }

      const res = await fetch('/api/transcriptions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const result = await res.json();
        alert('已创建 ' + result.created + ' 个转录任务' + (result.skipped > 0 ? '，跳过 ' + result.skipped + ' 个已完成' : ''));
        refreshTranscriptions();
      } else {
        const err = await res.json();
        alert('创建失败：' + err.error);
      }
    }

    load();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log('管理后台: http://localhost:' + PORT);
});
