# Voice Survey Web App (语音问卷)

面向学术研究场景的语音问卷 Web App。用户扫码进入，填写信息后以语音/选择/文字方式答题。

## 技术栈

- **前端**：React 19 + Vite 8 + Ant Design 5 + Zustand 5 + Axios
- **后端**：Express 4 + better-sqlite3 + multer（文件上传）+ qrcode（二维码生成）
- **数据库**：SQLite（`backend/data/surveys.db`），WAL 模式

## 项目结构

```
src/                            # 前端
├── api/
│   ├── client.js               # Axios 实例，baseURL = VITE_API_BASE_URL || '/api'
│   ├── mock.js                 # Mock 问卷数据（8 题：3 语音 + 4 选择 + 1 填空）
│   └── survey.js               # fetchSurvey, submitSurvey, uploadRecording
├── hooks/useAudioRecorder.js   # MediaRecorder 状态机 + 波形 + 计时
├── stores/surveyStore.js       # Zustand 全局状态
├── pages/
│   ├── InfoCollection/         # 页面 1：采集用户信息
│   ├── Welcome/                # 页面 2：问卷欢迎
│   ├── Survey/                 # 页面 3：答题（核心页面）
│   └── Complete/               # 页面 4：提交完成
└── components/
    ├── layout/                 # GradientBackground, GlassCard, ProgressBar
    ├── common/                 # PrimaryButton, NavigationBar
    └── question/               # VoiceRecorder, ChoiceQuestion, TextQuestion

backend/
├── src/
│   ├── index.js                # Express 入口，端口 3000（不对外暴露录音文件）
│   ├── routes/surveys.js       # API 路由定义
│   ├── controllers/surveyController.js  # 业务逻辑（录音写入 <仓库根>/data/recordings/）
│   ├── models/db.js            # SQLite 连接 + 建表 + 遗留表清理
│   ├── middleware/upload.js    # multer（内存模式，10MB 限制，仅 audio/*）
│   ├── middleware/errorHandler.js       # 统一错误处理
│   └── admin.js                # 管理后台（端口 3001）：问卷 CRUD + 二维码 + 提交/录音查看（认证）
├── scripts/init-db.js          # 初始化示例问卷数据
└── data/
    └── surveys.db              # SQLite 数据库

data/
└── recordings/                 # 录音文件存储目录（注意：在仓库根目录，不在 backend/ 下）
```

## 页面路由

```
/:surveyId              → InfoCollection（信息采集）
/:surveyId/welcome      → Welcome（欢迎页）
/:surveyId/survey       → Survey（答题页）
/:surveyId/complete     → Complete（完成页）
```

## API 接口

### GET /api/surveys/:surveyId — 获取问卷配置

响应：`{ surveyId, config: { title, description, questionCount, estimatedMinutes, displayMode }, infoFields: [{ id, label, type, required, placeholder }], questions: [{ id, type, title, required, ... }] }`

- `displayMode`：`"paged"`（单题分页）/ `"scroll"`（连续滚动）
- `questions[].type`：`"voice"` / `"choice"` / `"text"`
- `choice` 题有 `multiple`（布尔）和 `options`（字符串数组）

### POST /api/surveys/:surveyId/recordings/:questionId — 上传录音

- Content-Type: `multipart/form-data`，字段名 `recording`
- 请求头 `X-Submission-Id` 关联录音与提交（未提供则生成临时 ID）
- 后端根据 `Content-Type` 判断格式，自动选择扩展名（webm/m4a/ogg）
- 文件存储在**仓库根目录** `data/recordings/{surveyId}/{submissionId}/{questionId}.{ext}`（注意不在 `backend/data/` 下，数据库才在 `backend/data/`）

### POST /api/surveys/:surveyId/submit — 提交问卷

请求体：`{ userInfo, answers, recordingDurations, submissionId? }`

- 服务端校验必答题（`question.required`），存在未作答的必答题时返回 400
- 传入的 `submissionId` 若属于其它问卷返回 400（防跨问卷覆盖）

- `voice` 题答案为 `true`（实际音频通过录音接口单独上传）
- `choice` 单选：`string`，多选：`string[]`
- `text` 题：`string`
- `recordingDurations`：`{ questionId: 秒数 }`
- `submissionId`：若前端录音时获得过 submissionId，传入以关联已有录音

## 数据库 Schema

```
surveys      (survey_id PK, config JSON, info_fields JSON, questions JSON, created_at)
submissions  (submission_id PK, survey_id FK, user_info JSON, answers JSON, recording_durations JSON, status, submitted_at)
recordings   (id PK, submission_id FK, question_id, file_path, mime_type, duration, file_size, UNIQUE(submission_id, question_id))
```

- `submissions.status`：`pending`（仅上传过录音的占位行，不计入提交数/导出）/ `submitted`（正式提交）
- 公开写接口（上传/提交）有每 IP 每分钟 30 次的限速（内网/本机不限），超限返回 429

## 管理后台（端口 3001）

- 认证：HTTP Basic Auth。**必须**设置环境变量 `ADMIN_PASSWORD`（可选 `ADMIN_USERNAME`，默认 `admin`），未设置时服务拒绝启动（fail-closed）
- 问卷列表：显示所有问卷，支持一键生成二维码
- 二维码生成：`GET /api/qrcode/:surveyId?host=...` 返回 PNG 图片，可自定义 host 地址
- 提交记录 + 录音文件查看（录音经认证接口 `GET /api/recordings/file/:submissionId/:questionId` 流式播放，不对公网静态暴露）
- 问卷 CRUD 与数据导出（CSV/XLSX/JSON + 录音 zip）
- 启动：`ADMIN_PASSWORD=xxx node backend/src/admin.js`（PM2：`ADMIN_PASSWORD=xxx pm2 start ecosystem.config.cjs`）

## 录音兼容性

- Android Chrome/微信：WebM/Opus | iOS Safari/微信：MP4/AAC | Firefox：OGG/Opus
- `useAudioRecorder` 通过 `getSupportedMimeType()` 自动探测
- 需要 HTTPS（localhost 除外），iOS 需用户手势中 `resume()` AudioContext

## 开发调试

```bash
# 前端
npm run dev                              # localhost:5173，不带 VITE_API_BASE_URL 使用 mock 数据
VITE_API_BASE_URL=http://localhost:3000/api npm run dev  # 联调模式

# 后端
cd backend && npm run dev                # 主服务 localhost:3000
cd backend && node scripts/init-db.js    # 初始化示例问卷
node backend/src/admin.js                # 管理后台 localhost:3001（查看提交记录和录音）
```
