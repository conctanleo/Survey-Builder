# Survey Data Export & Speech-to-Text Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click ZIP export (CSV/Excel/JSON + recordings) and manual speech-to-text transcription via VibeVoice-ASR q4 GGUF model microservice to the survey admin panel.

**Architecture:** Python FastAPI microservice on port 3002 loads the GGUF model once and exposes `/health` and `/transcribe` endpoints. Node.js admin server polls a `transcription_queue` table, calling the Python service one task at a time. Export streams a ZIP via `archiver`, building flat CSV/Excel rows that include transcription results.

**Tech Stack:** archiver, exceljs, better-sqlite3, FastAPI, uvicorn, llama-cpp-python (CUDA), ffmpeg

---

### Task 1: Install new dependencies

**Files:**
- Modify: `backend/package.json`
- Create: `backend/requirements.txt`

- [ ] **Step 1: Install npm packages**

Run:
```bash
cd D:/wenjuan/backend && npm install archiver exceljs
```

Expected: `archiver` and `exceljs` added to `node_modules` and `package.json`.

- [ ] **Step 2: Create Python requirements file**

Write `backend/requirements.txt`:
```
llama-cpp-python>=0.3.0
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
```

- [ ] **Step 3: Install Python packages with CUDA support**

Run:
```bash
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python fastapi uvicorn
```

Expected: `llama-cpp-python` installed with CUDA backend. Verify with:
```bash
python -c "import llama_cpp; print(llama_cpp.llama_cpp_python_supports_gpu_offload())"
```
Expected output: `True`

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/requirements.txt
git commit -m "chore: add archiver, exceljs, and Python STT dependencies"
```

---

### Task 2: Add transcription_queue table to database

**Files:**
- Modify: `backend/src/models/db.js`

- [ ] **Step 1: Add table creation SQL**

Insert after the existing index creation lines (after line 59) in `backend/src/models/db.js`:

```javascript
  -- 转录任务队列表
  CREATE TABLE IF NOT EXISTS transcription_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id   TEXT NOT NULL,
    question_id     TEXT NOT NULL,
    recording_id    INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    result          TEXT,
    error           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id),
    FOREIGN KEY (recording_id) REFERENCES recordings(id),
    UNIQUE(submission_id, question_id)
  );

  CREATE INDEX IF NOT EXISTS idx_transcription_status ON transcription_queue(status);
  CREATE INDEX IF NOT EXISTS idx_transcription_submission ON transcription_queue(submission_id);
```

- [ ] **Step 2: Verify table creation**

Run:
```bash
cd D:/wenjuan/backend && node -e "
import db from './src/models/db.js';
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log(tables.map(t => t.name));
"
```

Expected output includes `transcription_queue`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/db.js
git commit -m "feat: add transcription_queue table for STT job tracking"
```

---

### Task 3: Create Python STT microservice

**Files:**
- Create: `backend/stt_service.py`

- [ ] **Step 1: Write the microservice**

Write `backend/stt_service.py`:

```python
"""VibeVoice-ASR Speech-to-Text microservice."""
import os
import io
import subprocess
import tempfile
import wave
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llama_cpp import Llama

app = FastAPI(title="VibeVoice STT", version="1.0.0")

MODEL_PATH = os.environ.get(
    "VIBEVOICE_MODEL_PATH",
    "D:/models/vibevoice/vibevoice-asr-q4_k.gguf",
)
GPU_LAYERS = int(os.environ.get("VIBEVOICE_GPU_LAYERS", "20"))
N_CTX = int(os.environ.get("VIBEVOICE_N_CTX", "8192"))
N_THREADS = int(os.environ.get("VIBEVOICE_N_THREADS", "4"))

gpu_available = False
model = None


class TranscribeRequest(BaseModel):
    path: str


class TranscribeResponse(BaseModel):
    text: str
    duration_ms: float = 0


@app.on_event("startup")
def load_model():
    global model, gpu_available
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    model = Llama(
        model_path=MODEL_PATH,
        n_gpu_layers=GPU_LAYERS,
        n_ctx=N_CTX,
        n_threads=N_THREADS,
        verbose=False,
    )
    gpu_available = GPU_LAYERS > 0
    print(f"Model loaded. GPU layers: {GPU_LAYERS}, GPU available: {gpu_available}")


@app.get("/health")
def health():
    return {
        "status": "ok" if model is not None else "loading",
        "model_loaded": model is not None,
        "gpu_layers": GPU_LAYERS,
        "gpu_available": gpu_available,
    }


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded yet")

    audio_path = Path(req.path)
    if not audio_path.exists():
        raise HTTPException(400, f"Audio file not found: {req.path}")

    pcm_data = _decode_audio(audio_path)
    duration_ms = (len(pcm_data) / 2 / 16000) * 1000

    try:
        output = model.transcribe(pcm_data, sample_rate=16000)
        text = output.get("text", "").strip()
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {str(e)}")

    return {"text": text, "duration_ms": round(duration_ms)}


def _decode_audio(file_path: Path) -> bytes:
    """Convert any audio format to 16kHz mono PCM via ffmpeg."""
    proc = subprocess.run(
        [
            "ffmpeg", "-i", str(file_path),
            "-ar", "16000", "-ac", "1", "-f", "s16le",
            "-hide_banner", "-loglevel", "error",
            "pipe:1",
        ],
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode()[:200]}")
    return proc.stdout


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=3002, log_level="info")
```

- [ ] **Step 2: Verify service starts (model loading)**

Run:
```bash
cd D:/wenjuan/backend && python stt_service.py
```

Wait for "Model loaded" message (~30-60 seconds for model to load). Then press Ctrl+C to stop. If model fails to load, check:
- `D:/models/vibevoice/vibevoice-asr-q4_k.gguf` exists
- `llama-cpp-python` was installed with CUDA support
- Try `VIBEVOICE_GPU_LAYERS=0` for CPU-only fallback

- [ ] **Step 3: Commit**

```bash
git add backend/stt_service.py
git commit -m "feat: add VibeVoice-ASR STT microservice with GPU acceleration"
```

---

### Task 4: Add export API endpoint to admin server

**Files:**
- Modify: `backend/src/admin.js`

- [ ] **Step 1: Add imports at top of admin.js**

After line 7 (`import db from './models/db.js';`), add:

```javascript
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
```

- [ ] **Step 2: Add export endpoint**

Insert after the QR code endpoint block (after line 162, before the `// ── 管理页面 ──` comment):

```javascript
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
    const subIds = submissions.map(s => s.submission_id);
    const placeholders = subIds.map(() => '?').join(',');

    allRecordings.push(...db.prepare(
      `SELECT * FROM recordings WHERE submission_id IN (${placeholders})`
    ).all(...subIds));

    // Fetch completed transcriptions
    const transcriptions = db.prepare(
      `SELECT * FROM transcription_queue WHERE submission_id IN (${placeholders}) AND status = 'completed'`
    ).all(...subIds);
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
  archive.on('error', (err) => { res.status(500).json({ error: err.message }); });
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
    const rowVals = [];

    infoFields.forEach(f => rowVals.push(userInfo[f.id] ?? ''));
    questions.forEach(q => {
      const ans = answers[q.id];
      if (q.type === 'voice') {
        rowVals.push('(录音)');
        const transKey = `${sub.submission_id}_${q.id}`;
        rowVals.push(transcriptionMap[transKey] || '');
      } else if (q.type === 'choice' && q.multiple && Array.isArray(ans)) {
        rowVals.push(ans.join('、'));
      } else {
        rowVals.push(ans ?? '');
      }
    });
    rowVals.push(sub.submitted_at || '');
    sheet.addRow(rowVals);
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
```

- [ ] **Step 2: Verify the endpoint responds**

Start the admin server:
```bash
cd D:/wenjuan/backend && node src/admin.js &
```

Test with a survey ID:
```bash
curl -o /tmp/export-test.zip http://localhost:3001/api/export/demo-survey-001
unzip -l /tmp/export-test.zip
```

Expected: ZIP contains `data.csv`, `data.xlsx`, `data.json`, and `recordings/` directory. Stop admin server after test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/admin.js
git commit -m "feat: add ZIP export endpoint with CSV/Excel/JSON + recordings"
```

---

### Task 5: Add transcription API endpoints

**Files:**
- Modify: `backend/src/admin.js`

- [ ] **Step 1: Add transcription management endpoints**

Insert after the export endpoint block, before the `// ── 管理页面 ──` comment:

```javascript
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
```

- [ ] **Step 2: Verify endpoint**

Start admin server and test:
```bash
curl -X POST http://localhost:3001/api/transcriptions/start \
  -H "Content-Type: application/json" \
  -d '{"surveyId":"demo-survey-001","selectAll":true}'
```

Expected: `{ "created": N, "skipped": 0, "total": N }` where N is the number of voice recordings.

```bash
curl "http://localhost:3001/api/transcriptions/status?surveyId=demo-survey-001"
```

Expected: JSON with `summary` and `tasks` array, all tasks with `status: "pending"`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/admin.js
git commit -m "feat: add transcription trigger and status API endpoints"
```

---

### Task 6: Add transcription poller and Python subprocess management

**Files:**
- Modify: `backend/src/admin.js`

- [ ] **Step 1: Add STT service lifecycle and poller**

Insert after the transcription endpoints block, before the `// ── 管理页面 ──` comment:

```javascript
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

// 启动
startSttService();
startTranscriptionPoller();

// 优雅关闭
process.on('exit', stopSttService);
process.on('SIGINT', () => { stopSttService(); process.exit(); });
process.on('SIGTERM', () => { stopSttService(); process.exit(); });
```

- [ ] **Step 2: Add fetch import for Node 18+**

Node.js 18+ has built-in `fetch`. Verify with:
```bash
node -e "console.log(typeof fetch)"
```
Expected: `function`. If `undefined`, add `import fetch from 'node-fetch'` and install node-fetch.

- [ ] **Step 3: Verify poller starts without errors**

Start the admin server:
```bash
cd D:/wenjuan/backend && node src/admin.js
```

Expected: Console logs `[STT] Python microservice starting on http://127.0.0.1:3002` (if stt_service.py exists). No crash or unhandled errors. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/src/admin.js
git commit -m "feat: add transcription poller and STT microservice lifecycle management"
```

---

### Task 7: Update admin UI — Export button and transcription modal

**Files:**
- Modify: `backend/src/admin.js` (inline HTML/CSS/JS)

- [ ] **Step 1: Add CSS styles for transcription modal**

Insert in the `<style>` block, before the closing `</style>` tag:

```css
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
```

- [ ] **Step 2: Add transcription modal HTML**

Insert after the "问卷详情弹窗" modal block (after the `<div class="modal-overlay" id="detailModal">...</div>` block), before the opening `<script>` tag:

```html
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
```

- [ ] **Step 3: Add Export and Transcribe buttons to survey cards**

In the `renderSurveys()` function, replace the survey card HTML. Find the line with `survey-actions` div and replace the button row from `查看详情` through `删除`:

Old code (lines 425-428):
```javascript
'<button class="btn btn-ghost btn-sm" onclick="showDetail(\\'' + esc(s.surveyId) + '\\')">查看详情</button>' +
'<button class="btn btn-primary btn-sm" onclick="showQR(\\'' + esc(s.surveyId) + '\\', \\'' + esc(s.config.title).replace(/'/g, "\\\\'") + '\\')">二维码</button>' +
'<button class="btn btn-danger btn-sm" onclick="deleteSurvey(\\'' + esc(s.surveyId) + '\\')">删除</button>' +
```

Replace with:
```javascript
'<button class="btn btn-ghost btn-sm" onclick="showDetail(\\'' + esc(s.surveyId) + '\\')">详情</button>' +
'<button class="btn btn-ghost btn-sm" onclick="showQR(\\'' + esc(s.surveyId) + '\\', \\'' + esc(s.config.title).replace(/'/g, "\\\\'") + '\\')">二维码</button>' +
'<button class="btn btn-success btn-sm" onclick="exportSurvey(\\'' + esc(s.surveyId) + '\\')">导出</button>' +
'<button class="btn btn-primary btn-sm" onclick="openTranscribeModal(\\'' + esc(s.surveyId) + '\\', \\'' + esc(s.config.title).replace(/'/g, "\\\\'") + '\\')">转录</button>' +
'<button class="btn btn-danger btn-sm" onclick="deleteSurvey(\\'' + esc(s.surveyId) + '\\')">删除</button>' +
```

- [ ] **Step 4: Add Export function to JavaScript**

Insert inside the `<script>` block, before the closing `</script>` tag:

```javascript
    // ── 导出 ──
    function exportSurvey(surveyId) {
      const a = document.createElement('a');
      a.href = '/api/export/' + encodeURIComponent(surveyId);
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
```

- [ ] **Step 5: Add transcription modal JavaScript**

Insert after the export function:

```javascript
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
```

- [ ] **Step 6: Add transcription modal click-outside-to-close**

In the `['qrModal', 'createModal', 'detailModal']` array at the bottom, add `'transcribeModal'`:

```javascript
    ['qrModal', 'createModal', 'detailModal', 'transcribeModal'].forEach(id => {
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/admin.js
git commit -m "feat: add export button and transcription management modal to admin UI"
```

---

### Task 8: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Start all services**

Terminal 1 — Python STT:
```bash
cd D:/wenjuan/backend && python stt_service.py
```
Wait for "Model loaded" message.

Terminal 2 — Admin server:
```bash
cd D:/wenjuan/backend && node src/admin.js
```

- [ ] **Step 2: Test export flow**

Open browser at `http://localhost:3001`. Click **导出** on a survey. Verify:
- ZIP file downloads
- Contains `data.csv`, `data.xlsx`, `data.json`
- `data.csv` has correct column headers (info fields + question answers + transcription columns)
- CSV data rows match submissions
- `recordings/` folder contains audio files

- [ ] **Step 3: Test transcription flow**

In admin UI, click **转录** on a survey. Verify:
- Modal opens with task table showing all voice recordings
- Click **全选** → all pending/failed checkboxes checked
- Click **开始转录** → alert shows task count
- Tasks transition: pending → processing → completed
- Progress bar updates
- Auto-refresh works (uncheck to disable)

- [ ] **Step 4: Test transcription result in export**

After transcription completes, export again. Verify:
- CSV `_转录文本` columns contain transcribed text
- Excel file has same data
- JSON file has `transcriptions` field with results

- [ ] **Step 5: Test edge cases**

- Empty survey (no submissions): Export returns ZIP with empty CSV (headers only), no recordings
- Failed transcription: Kill Python STT process, trigger transcription → tasks marked `failed` with error message
- Recovery: Restart Python STT, trigger transcription again → works

- [ ] **Step 6: Commit final verification notes**

```bash
git commit --allow-empty -m "verify: export and STT integration E2E verified"
```
