# Survey Data Export & Speech-to-Text Integration Design

## Context

The voice survey app (语音问卷) currently has no data export functionality. Administrators can view submissions and recordings in the admin panel (port 3001) but cannot download structured data for analysis. Additionally, voice recordings need to be transcribed to text for efficient data processing. This design adds:

1. One-click ZIP export containing CSV, Excel, JSON data files and all recording files
2. Manual speech-to-text conversion using the VibeVoice-ASR q4 quantized GGUF model (located at `D:/models/vibevoice/vibevoice-asr-q4_k.gguf`), integrated as a standalone Python microservice
3. Background task queue for transcription jobs with status tracking in the admin UI

## Architecture Overview

```
Admin Browser (:3001)
     │
     ├── POST /api/export/:surveyId               → ZIP download
     ├── POST /api/transcriptions/start            → trigger batch transcription
     ├── GET  /api/transcriptions/status           → poll job status
     ├── GET  /api/transcriptions/status/:subId    → per-submission status
     │
     ▼
┌──────────────────────────────────────────┐
│         Node.js Admin Server (:3001)     │
│                                          │
│  - ZIP streaming (archiver)              │
│  - Transcription task management         │
│  - Poller (setInterval 2s)               │
│  - New DB table: transcription_queue     │
└────────────┬─────────────────────────────┘
             │ HTTP localhost:3002
             ▼
┌──────────────────────────────────────────┐
│     Python STT Microservice (:3002)      │
│                                          │
│  - FastAPI + uvicorn                     │
│  - llama-cpp-python loads GGUF model     │
│  - ffmpeg preprocess (→ 16kHz mono PCM)  │
│  - Single-request serial processing      │
└──────────────────────────────────────────┘
```

## Database Changes

### New table: `transcription_queue`

```sql
CREATE TABLE transcription_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id TEXT NOT NULL,
    question_id   TEXT NOT NULL,
    recording_id  INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    result        TEXT,
    error         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(submission_id, question_id)
);
```

Status values: `pending` → `processing` → `completed` / `failed`

### Export data query flow

1. Query all submissions for the survey
2. Join with recordings and transcription_queue to get transcription results
3. Build flat CSV/Excel rows: one row per submission, columns for each question answer + transcription
4. Build JSON structure: nested by submission, with recordings and transcriptions inline
5. Stream all files + recordings into a ZIP archive

### CSV/Excel column layout

```
submission_id | 姓名 | 年龄 | ... | Q1_答案 | Q1_转录文本 | Q2_答案 | Q2_转录文本 | ... | submitted_at
```

- Voice questions: answer column shows "(录音)", transcription column shows transcribed text
- Choice (single): shows selected option text
- Choice (multiple): shows comma-separated selected options
- Text: shows user's text answer

## API Endpoints

All endpoints on admin server (port 3001).

### Export

**GET `/api/export/:surveyId`**

- Response: `Content-Type: application/zip`
- Filename: `Content-Disposition: attachment; filename="{surveyId}-export-{timestamp}.zip"`
- Generates ZIP stream containing `data.csv`, `data.xlsx`, `data.json`, and `recordings/` directory

### Transcription Management

**POST `/api/transcriptions/start`**

Request body:
```json
{
  "surveyId": "demo-survey-001",
  "submissionIds": ["sub-1", "sub-2"],
  "selectAll": false,
  "reprocess": false
}
```

- `selectAll: true` ignores `submissionIds` and creates tasks for all recordings in the survey
- `reprocess: false` skips recordings that already have `completed` tasks; `true` resets them to `pending`
- Returns: `{ created: 5, skipped: 3, total: 8 }`

**GET `/api/transcriptions/status?surveyId=xxx`**

Returns:
```json
{
  "surveyId": "demo-survey-001",
  "summary": {
    "total": 8,
    "pending": 3,
    "processing": 1,
    "completed": 4,
    "failed": 0
  },
  "tasks": [
    {
      "id": 1,
      "submissionId": "sub-001",
      "questionId": "q1",
      "status": "completed",
      "result": "我认为这个政策...",
      "updatedAt": "2026-05-02T10:30:00Z"
    }
  ]
}
```

**GET `/api/transcriptions/status/:submissionId`**

Returns tasks for a single submission (same task shape as above).

## Transcription Poller

Runs as `setInterval` (2s period) in the admin.js process:

1. Query oldest `status = 'pending'` row
2. Set it to `processing`
3. Call `POST http://localhost:3002/transcribe` with the recording file path
4. On success: update `status = 'completed'`, store `result = response.text`
5. On failure: update `status = 'failed'`, store `error = response.error`
6. Repeat (only one task processed at a time to avoid OOM)

## Python STT Microservice

### Hardware

- GPU: NVIDIA GeForce RTX 4060 Laptop (8GB VRAM), CUDA 12.7
- Strategy: hybrid CPU/GPU — offload ~20 of 28 LM layers to GPU, keep encoder on CPU
- Estimated VRAM usage: ~5-6GB with partial offload (leaves headroom for system)

### Setup

```bash
# Install with CUDA support
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python fastapi uvicorn
```

### Service code (stt_service.py)

- FastAPI app on `127.0.0.1:3002`
- Loads GGUF model once at startup via `llama_cpp.Llama`
- Two endpoints: `GET /health`, `POST /transcribe`

### Model loading (GPU-accelerated)

```python
model = Llama(
    model_path="D:/models/vibevoice/vibevoice-asr-q4_k.gguf",
    n_gpu_layers=20,      # offload 20/28 LM layers to GPU
    n_ctx=8192,
    n_threads=4,           # CPU threads for remaining layers
    verbose=False
)
```

- `n_gpu_layers` tunable via env var `VIBEVOICE_GPU_LAYERS` (default 20)
- If CUDA not available, `llama-cpp-python` falls back to CPU automatically
- Health endpoint reports `{ "gpu_layers": 20, "gpu_available": true }`

### POST /transcribe

Request:
```json
{ "path": "D:/wenjuan/backend/data/recordings/demo-survey-001/sub-uuid/q1.webm" }
```

Response (success):
```json
{ "text": "我认为这个政策的实施效果很好...", "duration_ms": 15234 }
```

Response (error):
```json
{ "error": "音频文件不存在或无法解码" }
```

### Audio preprocessing

Input formats: WebM/Opus, MP4/AAC, OGG. Convert to 16kHz mono PCM via ffmpeg subprocess before feeding to the model.

### Lifecycle

- Started by Node.js `child_process.spawn` in admin.js
- Killed on admin.js process exit
- Health check in poller: if `/health` fails, mark task as failed and log

## Admin UI Changes

### Survey card: new buttons

Each survey card gains two new action buttons: `[Export]` and `[Transcribe]`.

### Transcription modal

Opened by clicking `[Transcribe]` on a survey card. Contains:

- **Progress summary bar**: visual progress with counts (pending/processing/completed/failed)
- **[Select All]** checkbox: selects all `pending` and `failed` recordings (excludes already `completed`)
- **[Start Transcribe]** button: POSTs to `/api/transcriptions/start` with selected IDs
- **[Refresh]** button: manually fetch status
- **Task table**: columns for checkbox, submission ID, question ID, status badge, result preview
- **Auto-refresh**: 2-second interval when modal is open (can be toggled off)
- **Close** button

## Dependencies

### New npm packages (backend)

- `archiver` — streaming ZIP generation
- `exceljs` — Excel (.xlsx) generation with streaming support
- Both installed in `backend/package.json`

### New Python packages

- `llama-cpp-python` — GGUF model inference
- `fastapi` + `uvicorn` — HTTP microservice
- Listed in `backend/requirements.txt`

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/admin.js` | Modify | Add export & transcription API routes, poller, start Python subprocess |
| `backend/src/models/db.js` | Modify | Add transcription_queue table creation |
| `backend/stt_service.py` | Create | Python STT microservice |
| `backend/requirements.txt` | Create | Python dependencies |

## Verification

1. **Export**: Open admin panel, click Export on a survey → ZIP downloads. Verify it contains data.csv, data.xlsx, data.json, and recordings/ directory with correct files
2. **Transcription trigger**: Click Transcribe → Select All → Start → observe pending → processing → completed status transitions in the task table
3. **Transcription result in export**: After transcription completes, export again → verify CSV/Excel contain transcribed text in the `_转录文本` columns
4. **Edge cases**: Empty survey (no submissions), survey with mixed answer types, failed transcription tasks (invalid/missing audio)
5. **Model health**: Kill Python process → verify poller marks tasks as failed → restart → verify recovery
