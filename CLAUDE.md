# Voice Survey Web App (语音问卷)

## 项目概述

面向学术研究场景的语音问卷 Web App。用户通过扫码进入问卷，填写个人信息后，以语音录音、选择或文字方式回答问题。前端已完成，后端待开发。

## 技术栈

- **前端**：React 19 + Vite 8 + Ant Design 5 + Zustand 5 + Axios
- **构建**：`npm run dev`（开发）、`npm run build`（生产）
- **环境变量**：`VITE_API_BASE_URL`（后端地址，不设置则使用 mock 数据）

## 项目结构

```
src/
├── App.jsx                     # 路由定义 + SurveyLoader（首次加载拉取问卷数据）
├── main.jsx                    # 入口，ConfigProvider 包裹
├── api/
│   ├── client.js               # Axios 实例，baseURL = VITE_API_BASE_URL || '/api'
│   ├── mock.js                 # Mock 问卷数据（8 题：3 语音 + 4 选择 + 1 填空）
│   └── survey.js               # 3 个 API 函数（fetchSurvey, submitSurvey, uploadRecording）
├── hooks/
│   └── useAudioRecorder.js     # 录音 hook：MediaRecorder 状态机 + 波形 + 计时
├── stores/
│   └── surveyStore.js          # Zustand 全局状态
├── pages/
│   ├── InfoCollection/         # 页面 1：采集用户信息
│   ├── Welcome/                # 页面 2：问卷欢迎（绿色背景）
│   ├── Survey/                 # 页面 3：答题（紫色背景，核心页面）
│   └── Complete/               # 页面 4：提交完成
├── components/
│   ├── layout/                 # GradientBackground, GlassCard, ProgressBar
│   ├── common/                 # PrimaryButton, NavigationBar
│   └── question/               # VoiceRecorder, ChoiceQuestion, TextQuestion
└── styles/
    ├── theme.js                # Ant Design 主题 Token
    └── global.module.css       # 全局样式
```

## 页面路由

```
/:surveyId              → InfoCollection（信息采集）
/:surveyId/welcome      → Welcome（欢迎页）
/:surveyId/survey       → Survey（答题页）
/:surveyId/complete     → Complete（完成页）
```

## 后端需要实现的 API

### 1. 获取问卷配置

```
GET /api/surveys/{surveyId}
```

**响应体：**
```json
{
  "surveyId": "demo-survey-001",
  "config": {
    "title": "工作环境满意度调查",
    "description": "本问卷旨在了解...",
    "questionCount": 8,
    "estimatedMinutes": 5,
    "displayMode": "paged"
  },
  "infoFields": [
    { "id": "name", "label": "姓名", "type": "text", "required": true, "placeholder": "请输入您的姓名" },
    { "id": "phone", "label": "手机号", "type": "tel", "required": true, "placeholder": "请输入手机号" }
  ],
  "questions": [
    { "id": "q1", "type": "voice", "title": "请描述...", "required": true, "maxLength": 300 },
    { "id": "q2", "type": "choice", "title": "您的性别", "required": true, "multiple": false, "options": ["男", "女"] },
    { "id": "q3", "type": "text", "title": "建议", "required": false, "maxLength": 500, "placeholder": "请输入" }
  ]
}
```

**字段说明：**
- `displayMode`：`"paged"`（单题分页）或 `"scroll"`（连续滚动）
- `infoFields[].type`：`"text"` 或 `"tel"`
- `questions[].type`：`"voice"`（语音录音）、`"choice"`（选择）、`"text"`（填空）
- `questions[].multiple`：仅 choice 类型，`true` 为多选

### 2. 上传录音文件

```
POST /api/surveys/{surveyId}/recordings/{questionId}
Content-Type: multipart/form-data
```

**请求体：** FormData，字段名 `recording`，文件名为 `{questionId}.webm`

**注意事项：**
- 文件名虽然是 `.webm`，但实际 MIME 类型可能是以下之一：
  - `audio/webm;codecs=opus`（Android Chrome / Android 微信）
  - `audio/mp4`（iOS Safari / iOS 微信）
  - `audio/ogg;codecs=opus`（Firefox）
- 后端应根据 `Content-Type` 头判断实际格式，而非依赖文件扩展名
- 每题录音最大 5 分钟，约 1MB/分钟（Opus 128kbps）

**响应体：**
```json
{ "success": true }
```

### 3. 提交问卷答案

```
POST /api/surveys/{surveyId}/submit
Content-Type: application/json
```

**请求体：**
```json
{
  "userInfo": { "name": "张三", "phone": "13800138000", "department": "XX学院" },
  "answers": {
    "q1": true,
    "q2": "男",
    "q3": true,
    "q4": "3-5年",
    "q5": "比较满意",
    "q6": "建议内容...",
    "q7": ["弹性工作时间", "培训机会"],
    "q8": true
  },
  "recordingDurations": {
    "q1": 45,
    "q3": 120,
    "q8": 30
  }
}
```

**答案值类型说明：**
- `voice` 题：`true`（表示已录音，实际音频通过 uploadRecording 单独上传）
- `choice` 单选：`string`（选项文本）
- `choice` 多选：`string[]`（选项文本数组）
- `text` 题：`string`（文本内容）
- `recordingDurations`：录音时长（秒），与 voice 题对应

**响应体：**
```json
{ "success": true }
```

## 前端待完成的后端集成点

> **重要：** `submitSurvey` 和 `uploadRecording` 已在 `src/api/survey.js` 中定义，但尚未在任何组件中调用。需要补充：

1. **录音上传时机**：每题录音完成后异步调用 `uploadRecording()`，不阻塞答题
2. **最终提交**：在 Survey 页面最后一题点"下一题"时（即跳转 Complete 页面前），调用 `submitSurvey()` 提交答案
3. **Complete 页面数据来源**：当前从 Zustand store 读取统计数据，提交后应改为从后端响应获取

## 录音兼容性

| 平台 | getUserMedia | MediaRecorder | 音频格式 |
|------|:---:|:---:|------|
| Android Chrome | ✅ | ✅ | WebM/Opus |
| Android 微信 (X5) | ✅ | ✅ | WebM/Opus |
| iOS Safari (14.5+) | ✅ | ✅ | MP4/AAC |
| iOS 微信 (WebKit) | ✅ | ✅ | MP4/AAC |

- `useAudioRecorder` 通过 `getSupportedMimeType()` 自动探测格式
- 录音需要 HTTPS 环境（localhost 开发除外）
- iOS 的 AudioContext 需在用户手势中 `resume()`

## 开发调试

```bash
npm run dev                    # 启动开发服务器（localhost:5173）
npm run build                  # 生产构建
```

不带 `VITE_API_BASE_URL` 时前端使用 mock 数据，可直接开发调试。联调时设置：
```bash
VITE_API_BASE_URL=http://localhost:3000/api npm run dev
```
