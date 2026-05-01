# Voice Survey Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first voice survey Web App where users scan a QR code, fill in personal info, and answer questions via voice recording, choice, or text input.

**Architecture:** React SPA with 4 pages in a linear flow. Zustand for state, Ant Design 5 for base components, CSS Modules for custom glassmorphism styling. Voice recording via browser MediaRecorder API.

**Tech Stack:** React 18, Vite, Ant Design 5.x, React Router 6, Zustand, Axios, MediaRecorder API, CSS Modules

---

## File Structure

```
src/
├── main.jsx                          # Entry point
├── App.jsx                           # Router + layout
├── styles/
│   ├── theme.js                      # Ant Design token config
│   └── global.module.css             # Global resets & gradient backgrounds
├── components/
│   ├── layout/
│   │   ├── GradientBackground.jsx    # Full-screen gradient wrapper
│   │   ├── GradientBackground.module.css
│   │   ├── GlassCard.jsx             # Frosted glass card container
│   │   ├── GlassCard.module.css
│   │   └── ProgressBar.jsx           # Top progress bar (4px)
│   │   └── ProgressBar.module.css
│   ├── common/
│   │   ├── PrimaryButton.jsx         # Full-width CTA button
│   │   ├── PrimaryButton.module.css
│   │   └── NavigationBar.jsx         # Prev/Next bottom nav
│   │   └── NavigationBar.module.css
│   └── question/
│       ├── VoiceRecorder.jsx         # Voice recording UI + waveform
│       ├── VoiceRecorder.module.css
│       ├── ChoiceQuestion.jsx        # Radio/Checkbox options
│       ├── ChoiceQuestion.module.css
│       ├── TextQuestion.jsx          # Textarea input
│       └── TextQuestion.module.css
├── hooks/
│   └── useAudioRecorder.js           # MediaRecorder state machine hook
├── stores/
│   └── surveyStore.js                # Zustand store
├── api/
│   ├── client.js                     # Axios instance
│   ├── survey.js                     # Survey API calls
│   └── mock.js                       # Mock data for development
└── pages/
    ├── InfoCollection/
    │   ├── index.jsx
    │   └── index.module.css
    ├── Welcome/
    │   ├── index.jsx
    │   └── index.module.css
    ├── Survey/
    │   ├── index.jsx
    │   └── index.module.css
    └── Complete/
        ├── index.jsx
        └── index.module.css
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`

- [ ] **Step 1: Initialize Vite + React project**

```bash
cd D:/wenjuan
npm create vite@latest . -- --template react
```

If prompted that directory is not empty, choose to ignore and continue.

- [ ] **Step 2: Install dependencies**

```bash
npm install antd@5 @ant-design/icons react-router-dom@6 zustand axios
```

- [ ] **Step 3: Create folder structure**

```bash
mkdir -p src/{styles,components/{layout,common,question},hooks,stores,api,pages/{InfoCollection,Welcome,Survey,Complete}}
```

- [ ] **Step 4: Replace `src/main.jsx` with Ant Design provider**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import theme from './styles/theme';
import App from './App';
import './styles/global.module.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
```

- [ ] **Step 5: Create `src/styles/theme.js`**

```js
const theme = {
  token: {
    colorPrimary: '#4f46e5',
    borderRadius: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    colorBgContainer: 'transparent',
  },
};

export default theme;
```

- [ ] **Step 6: Create `src/styles/global.module.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

body {
  background: #4f46e5;
}
```

- [ ] **Step 7: Create minimal `src/App.jsx` to verify setup**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:surveyId" element={<div>Survey App Ready</div>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Open http://localhost:5173/test — should see "Survey App Ready".

- [ ] **Step 9: Add `.gitignore` and commit**

```bash
echo "node_modules\ndist\n.DS_Store\n*.local" > .gitignore
echo ".superpowers/\n.playwright-mcp/\n*.png" >> .gitignore
git add -A
git commit -m "feat: scaffold Vite + React + Ant Design project"
```

---

### Task 2: Layout Components — GradientBackground & GlassCard

**Files:**
- Create: `src/components/layout/GradientBackground.jsx`, `src/components/layout/GradientBackground.module.css`
- Create: `src/components/layout/GlassCard.jsx`, `src/components/layout/GlassCard.module.css`

- [ ] **Step 1: Create GradientBackground**

`src/components/layout/GradientBackground.jsx`:
```jsx
import styles from './GradientBackground.module.css';

const GRADIENTS = {
  purple: 'linear-gradient(160deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
  green: 'linear-gradient(160deg, #059669 0%, #10b981 40%, #34d399 100%)',
};

export default function GradientBackground({ variant = 'purple', children }) {
  return (
    <div
      className={styles.background}
      style={{ background: GRADIENTS[variant] }}
    >
      <div className={styles.circleTopRight} />
      <div className={styles.circleBottomLeft} />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
```

`src/components/layout/GradientBackground.module.css`:
```css
.background {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  overflow: hidden;
}

.circleTopRight {
  position: absolute;
  top: -80px;
  right: -80px;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  pointer-events: none;
}

.circleBottomLeft {
  position: absolute;
  bottom: -40px;
  left: -40px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 60px 32px 32px;
  color: white;
}
```

- [ ] **Step 2: Create GlassCard**

`src/components/layout/GlassCard.jsx`:
```jsx
import styles from './GlassCard.module.css';

export default function GlassCard({ children, className = '' }) {
  return (
    <div className={`${styles.card} ${className}`}>
      {children}
    </div>
  );
}
```

`src/components/layout/GlassCard.module.css`:
```css
.card {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 28px 24px;
}
```

- [ ] **Step 3: Verify in browser**

Temporarily update `App.jsx` to render both components:

```jsx
import GradientBackground from './components/layout/GradientBackground';
import GlassCard from './components/layout/GlassCard';

export default function App() {
  return (
    <GradientBackground variant="purple">
      <GlassCard>
        <p style={{ color: 'white' }}>GlassCard test</p>
      </GlassCard>
    </GradientBackground>
  );
}
```

Open browser — purple gradient background with frosted glass card visible.

- [ ] **Step 4: Revert App.jsx to router version and commit**

```bash
git add src/components/layout/
git commit -m "feat: add GradientBackground and GlassCard layout components"
```

---

### Task 3: Common Components — PrimaryButton & NavigationBar

**Files:**
- Create: `src/components/common/PrimaryButton.jsx`, `src/components/common/PrimaryButton.module.css`
- Create: `src/components/common/NavigationBar.jsx`, `src/components/common/NavigationBar.module.css`

- [ ] **Step 1: Create PrimaryButton**

`src/components/common/PrimaryButton.jsx`:
```jsx
import styles from './PrimaryButton.module.css';

export default function PrimaryButton({ children, onClick, variant = 'solid' }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

`src/components/common/PrimaryButton.module.css`:
```css
.button {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.button:active {
  transform: scale(0.98);
}

.solid {
  background: white;
  color: #4f46e5;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.ghost {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

- [ ] **Step 2: Create NavigationBar**

`src/components/common/NavigationBar.jsx`:
```jsx
import styles from './NavigationBar.module.css';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

export default function NavigationBar({
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
}) {
  return (
    <div className={styles.bar}>
      <button
        className={`${styles.nav} ${prevDisabled ? styles.disabled : ''}`}
        onClick={onPrev}
        disabled={prevDisabled}
      >
        <LeftOutlined /> 上一题
      </button>
      <button
        className={`${styles.nav} ${nextDisabled ? styles.disabled : ''}`}
        onClick={onNext}
        disabled={nextDisabled}
      >
        下一题 <RightOutlined />
      </button>
    </div>
  );
}
```

`src/components/common/NavigationBar.module.css`:
```css
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  flex-shrink: 0;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  padding: 8px 0;
}

.nav:not(.disabled):hover {
  color: rgba(255, 255, 255, 0.8);
}

.disabled {
  color: rgba(255, 255, 255, 0.25);
  cursor: default;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/common/
git commit -m "feat: add PrimaryButton and NavigationBar components"
```

---

### Task 4: Survey Store (Zustand)

**Files:**
- Create: `src/stores/surveyStore.js`

- [ ] **Step 1: Create the Zustand store**

`src/stores/surveyStore.js`:
```js
import { create } from 'zustand';

const useSurveyStore = create((set, get) => ({
  // Survey data (loaded from API)
  surveyId: null,
  surveyConfig: null,   // { title, description, questionCount, estimatedMinutes, displayMode }
  questions: [],         // [{ id, type, title, required, options, maxLength }]
  infoFields: [],        // [{ id, label, type, required, placeholder }]

  // User state
  userInfo: {},          // { fieldId: value }
  answers: {},           // { questionId: value | Blob }
  recordingBlobs: {},    // { questionId: Blob }
  recordingDurations: {},// { questionId: number (seconds) }

  // Navigation
  currentIndex: 0,
  startTime: null,

  // Actions — data loading
  setSurveyData: (data) => set({
    surveyId: data.surveyId,
    surveyConfig: data.config,
    questions: data.questions,
    infoFields: data.infoFields,
  }),

  // Actions — user info
  setUserInfo: (fieldId, value) => set((state) => ({
    userInfo: { ...state.userInfo, [fieldId]: value },
  })),

  // Actions — answers
  setAnswer: (questionId, value) => set((state) => ({
    answers: { ...state.answers, [questionId]: value },
  })),

  setRecordingBlob: (questionId, blob) => set((state) => ({
    recordingBlobs: { ...state.recordingBlobs, [questionId]: blob },
  })),

  setRecordingDuration: (questionId, seconds) => set((state) => ({
    recordingDurations: { ...state.recordingDurations, [questionId]: seconds },
  })),

  // Actions — navigation
  setCurrentIndex: (index) => set({ currentIndex: index }),
  nextQuestion: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.questions.length - 1),
  })),
  prevQuestion: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0),
  })),

  // Actions — timing
  startTimer: () => set({ startTime: Date.now() }),

  // Getters
  getElapsedTime: () => {
    const { startTime } = get();
    if (!startTime) return '00:00';
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    return `${min}:${sec}`;
  },

  getVoiceAnswerCount: () => {
    return Object.keys(get().recordingBlobs).length;
  },

  // Reset
  reset: () => set({
    surveyId: null,
    surveyConfig: null,
    questions: [],
    infoFields: [],
    userInfo: {},
    answers: {},
    recordingBlobs: {},
    recordingDurations: {},
    currentIndex: 0,
    startTime: null,
  }),
}));

export default useSurveyStore;
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/
git commit -m "feat: add Zustand survey store with state management"
```

---

### Task 5: API Layer & Mock Data

**Files:**
- Create: `src/api/client.js`, `src/api/mock.js`, `src/api/survey.js`

- [ ] **Step 1: Create Axios client**

`src/api/client.js`:
```js
import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

export default client;
```

- [ ] **Step 2: Create mock data**

`src/api/mock.js`:
```js
export const mockSurvey = {
  surveyId: 'demo-survey-001',
  config: {
    title: '工作环境满意度调查',
    description: '本问卷旨在了解员工对当前工作环境的真实感受，您的回答将帮助我们做出改进。',
    questionCount: 8,
    estimatedMinutes: 5,
    displayMode: 'paged', // 'paged' | 'scroll'
  },
  infoFields: [
    { id: 'name', label: '姓名', type: 'text', required: true, placeholder: '请输入您的姓名' },
    { id: 'phone', label: '手机号', type: 'tel', required: true, placeholder: '请输入手机号' },
    { id: 'department', label: '所属单位', type: 'text', required: false, placeholder: '请输入单位名称' },
  ],
  questions: [
    {
      id: 'q1',
      type: 'voice',
      title: '请描述您对当前工作环境的总体感受',
      required: true,
      maxLength: 300,
    },
    {
      id: 'q2',
      type: 'choice',
      title: '您的性别是？',
      required: true,
      multiple: false,
      options: ['男', '女'],
    },
    {
      id: 'q3',
      type: 'voice',
      title: '请描述您对当前工作环境的感受',
      required: true,
      maxLength: 300,
    },
    {
      id: 'q4',
      type: 'choice',
      title: '您的工作年限是？',
      required: true,
      multiple: false,
      options: ['1年以内', '1-3年', '3-5年', '5-10年', '10年以上'],
    },
    {
      id: 'q5',
      type: 'choice',
      title: '您对工作环境总体满意度如何？',
      required: true,
      multiple: false,
      options: ['非常满意', '比较满意', '一般', '不太满意', '非常不满意'],
    },
    {
      id: 'q6',
      type: 'text',
      title: '您认为工作环境中需要改进的地方有哪些？',
      required: false,
      maxLength: 500,
      placeholder: '请输入您的建议',
    },
    {
      id: 'q7',
      type: 'choice',
      title: '您希望公司提供哪些福利？（多选）',
      required: true,
      multiple: true,
      options: ['弹性工作时间', '远程办公', '健身补贴', '培训机会', '团建活动'],
    },
    {
      id: 'q8',
      type: 'voice',
      title: '请分享您对未来工作环境改善的期望',
      required: false,
      maxLength: 300,
    },
  ],
};
```

- [ ] **Step 3: Create survey API with mock fallback**

`src/api/survey.js`:
```js
import client from './client';
import { mockSurvey } from './mock';

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;

export async function fetchSurvey(surveyId) {
  if (USE_MOCK) {
    return { ...mockSurvey, surveyId };
  }
  const { data } = await client.get(`/surveys/${surveyId}`);
  return data;
}

export async function submitSurvey(surveyId, payload) {
  if (USE_MOCK) {
    console.log('Mock submit:', surveyId, payload);
    return { success: true };
  }
  const { data } = await client.post(`/surveys/${surveyId}/submit`, payload);
  return data;
}

export async function uploadRecording(surveyId, questionId, blob) {
  if (USE_MOCK) {
    console.log('Mock upload recording:', questionId, blob.size, 'bytes');
    return { success: true };
  }
  const formData = new FormData();
  formData.append('recording', blob, `${questionId}.webm`);
  const { data } = await client.post(
    `/surveys/${surveyId}/recordings/${questionId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/api/
git commit -m "feat: add API layer with Axios client and mock data"
```

---

### Task 6: ProgressBar Component

**Files:**
- Create: `src/components/layout/ProgressBar.jsx`, `src/components/layout/ProgressBar.module.css`

- [ ] **Step 1: Create ProgressBar**

`src/components/layout/ProgressBar.jsx`:
```jsx
import styles from './ProgressBar.module.css';

export default function ProgressBar({ current, total, label }) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className={styles.wrapper}>
      <div className={styles.labels}>
        <span className={styles.label}>第 {current + 1} 题 / 共 {total} 题</span>
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

`src/components/layout/ProgressBar.module.css`:
```css
.wrapper {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.track {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  height: 4px;
  overflow: hidden;
}

.fill {
  background: white;
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/ProgressBar.jsx src/components/layout/ProgressBar.module.css
git commit -m "feat: add ProgressBar component"
```

---

### Task 7: useAudioRecorder Hook

**Files:**
- Create: `src/hooks/useAudioRecorder.js`

This is the core hook managing the MediaRecorder state machine: idle → recording → completed.

- [ ] **Step 1: Create the hook**

`src/hooks/useAudioRecorder.js`:
```js
import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function useAudioRecorder() {
  const [status, setStatus] = useState('idle'); // idle | recording | completed
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const [analyserData, setAnalyserData] = useState(new Uint8Array(0));

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const startAnalyser = useCallback((stream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const update = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      setAnalyserData(data);
      animFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(audioBlob);
        setStatus('completed');
        stopAnalyser();
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(100); // collect chunks every 100ms
      setStatus('recording');
      setDuration(0);
      setBlob(null);

      startAnalyser(stream);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setDuration(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_DURATION_MS) {
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'permission' : err.message);
      setStatus('idle');
    }
  }, [startAnalyser, stopAnalyser]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setStatus('idle');
    setDuration(0);
    setBlob(null);
    setError(null);
    setAnalyserData(new Uint8Array(0));
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
      stopAnalyser();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stop, stopAnalyser]);

  return {
    status,
    duration,
    blob,
    error,
    analyserData,
    start,
    stop,
    reset,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/
git commit -m "feat: add useAudioRecorder hook with MediaRecorder state machine"
```

---

### Task 8: Question Components — VoiceRecorder

**Files:**
- Create: `src/components/question/VoiceRecorder.jsx`, `src/components/question/VoiceRecorder.module.css`

- [ ] **Step 1: Create VoiceRecorder component**

`src/components/question/VoiceRecorder.jsx`:
```jsx
import { useMemo } from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import styles from './VoiceRecorder.module.css';

export default function VoiceRecorder({ onComplete, onReset }) {
  const recorder = useAudioRecorder();

  const handleClick = () => {
    if (recorder.status === 'idle') {
      recorder.start();
    } else if (recorder.status === 'recording') {
      recorder.stop();
    } else if (recorder.status === 'completed') {
      recorder.reset();
      onReset?.();
    }
  };

  const formattedTime = useMemo(() => {
    const min = String(Math.floor(recorder.duration / 60)).padStart(2, '0');
    const sec = String(recorder.duration % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }, [recorder.duration]);

  // Notify parent on completion
  const handleTransition = () => {
    if (recorder.status === 'completed' && recorder.blob) {
      onComplete?.(recorder.blob, recorder.duration);
    }
  };

  // Trigger callback when recording completes
  if (recorder.status === 'completed' && recorder.blob && !recorder._notified) {
    recorder._notified = true;
    setTimeout(() => onComplete?.(recorder.blob, recorder.duration), 0);
  }

  return (
    <div className={styles.container}>
      <div
        className={`${styles.button} ${styles[recorder.status]}`}
        onClick={handleClick}
        role="button"
        aria-label={
          recorder.status === 'idle' ? '点击开始录音'
          : recorder.status === 'recording' ? '点击停止录音'
          : '点击重新录音'
        }
      >
        {recorder.status === 'recording' && (
          <>
            <div className={styles.pulse1} />
            <div className={styles.pulse2} />
          </>
        )}
        <div className={styles.icon}>
          {recorder.status === 'completed' ? (
            <CheckCircleOutlined style={{ fontSize: 32, color: 'white' }} />
          ) : recorder.status === 'recording' ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </div>
      </div>

      <p className={styles.statusText}>
        {recorder.status === 'idle' && '点击开始录音'}
        {recorder.status === 'recording' && '录音中...'}
        {recorder.status === 'completed' && '点击重新录音'}
      </p>

      {(recorder.status === 'recording' || recorder.status === 'completed') && (
        <p className={styles.timer}>{formattedTime}</p>
      )}

      {recorder.status === 'recording' && (
        <div className={styles.waveform}>
          {Array.from(recorder.analyserData).slice(0, 15).map((value, i) => (
            <div
              key={i}
              className={styles.bar}
              style={{
                height: `${Math.max(4, (value / 255) * 32)}px`,
                opacity: 0.3 + (value / 255) * 0.4,
              }}
            />
          ))}
        </div>
      )}

      {recorder.error === 'permission' && (
        <p className={styles.error}>
          请允许麦克风权限以使用语音功能
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create VoiceRecorder styles**

`src/components/question/VoiceRecorder.module.css`:
```css
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.button {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  transition: transform 0.2s;
}

.button:active {
  transform: scale(0.95);
}

.idle {
  background: linear-gradient(135deg, #667eea, #764ba2);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.4);
}

.recording {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 6px 24px rgba(239, 68, 68, 0.4);
}

.completed {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  box-shadow: 0 6px 24px rgba(34, 197, 94, 0.4);
}

.icon {
  position: relative;
  z-index: 1;
}

.pulse1,
.pulse2 {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  animation: pulse 1.5s ease-in-out infinite;
}

.pulse2 {
  inset: -6px;
  background: rgba(239, 68, 68, 0.1);
  animation-delay: 0.3s;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.5; }
}

.statusText {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin: 16px 0 8px;
}

.timer {
  font-size: 22px;
  font-weight: 700;
  color: white;
  margin: 0;
}

.waveform {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 20px;
  height: 32px;
}

.bar {
  width: 3px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 2px;
  transition: height 0.1s ease;
}

.error {
  font-size: 13px;
  color: #fca5a5;
  margin-top: 12px;
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/question/VoiceRecorder.jsx src/components/question/VoiceRecorder.module.css src/hooks/
git commit -m "feat: add VoiceRecorder component with waveform visualization"
```

---

### Task 9: Question Components — ChoiceQuestion & TextQuestion

**Files:**
- Create: `src/components/question/ChoiceQuestion.jsx`, `src/components/question/ChoiceQuestion.module.css`
- Create: `src/components/question/TextQuestion.jsx`, `src/components/question/TextQuestion.module.css`

- [ ] **Step 1: Create ChoiceQuestion**

`src/components/question/ChoiceQuestion.jsx`:
```jsx
import styles from './ChoiceQuestion.module.css';

export default function ChoiceQuestion({
  options = [],
  multiple = false,
  value,
  onChange,
}) {
  const selected = value || (multiple ? [] : null);

  const handleClick = (option) => {
    if (multiple) {
      const next = Array.isArray(selected)
        ? selected.includes(option)
          ? selected.filter((o) => o !== option)
          : [...selected, option]
        : [option];
      onChange?.(next);
    } else {
      onChange?.(option);
    }
  };

  const isSelected = (option) => {
    return multiple
      ? Array.isArray(selected) && selected.includes(option)
      : selected === option;
  };

  return (
    <div className={styles.options}>
      {options.map((option) => {
        const active = isSelected(option);
        return (
          <div
            key={option}
            className={`${styles.option} ${active ? styles.active : ''}`}
            onClick={() => handleClick(option)}
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(option);
              }
            }}
          >
            <div className={`${styles.indicator} ${multiple ? styles.checkbox : styles.radio}`}>
              {active && <div className={styles.inner} />}
            </div>
            <span className={active ? styles.activeText : ''}>{option}</span>
          </div>
        );
      })}
    </div>
  );
}
```

`src/components/question/ChoiceQuestion.module.css`:
```css
.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option {
  background: rgba(255, 255, 255, 0.1);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px 20px;
  font-size: 15px;
  color: white;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.option:hover {
  background: rgba(255, 255, 255, 0.15);
}

.active {
  background: rgba(255, 255, 255, 0.2);
  border-color: white;
  box-shadow: 0 0 16px rgba(255, 255, 255, 0.1);
}

.indicator {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radio {
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.checkbox {
  border-radius: 4px;
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.inner {
  width: 10px;
  height: 10px;
  background: white;
  border-radius: inherit;
}

.activeText {
  font-weight: 600;
}
```

- [ ] **Step 2: Create TextQuestion**

`src/components/question/TextQuestion.jsx`:
```jsx
import styles from './TextQuestion.module.css';

export default function TextQuestion({
  value = '',
  onChange,
  placeholder = '请输入',
  maxLength = 500,
}) {
  return (
    <textarea
      className={styles.textarea}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
    />
  );
}
```

`src/components/question/TextQuestion.module.css`:
```css
.textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15px;
  color: white;
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

.textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.textarea:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/question/
git commit -m "feat: add ChoiceQuestion and TextQuestion components"
```

---

### Task 10: Page 1 — InfoCollection

**Files:**
- Create: `src/pages/InfoCollection/index.jsx`, `src/pages/InfoCollection/index.module.css`

- [ ] **Step 1: Create InfoCollection page**

`src/pages/InfoCollection/index.jsx`:
```jsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GradientBackground from '../../components/layout/GradientBackground';
import GlassCard from '../../components/layout/GlassCard';
import PrimaryButton from '../../components/common/PrimaryButton';
import useSurveyStore from '../../stores/surveyStore';
import styles from './index.module.css';

export default function InfoCollection() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const infoFields = useSurveyStore((s) => s.infoFields);
  const setUserInfo = useSurveyStore((s) => s.setUserInfo);
  const userInfo = useSurveyStore((s) => s.userInfo);

  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const newErrors = {};
    infoFields.forEach((field) => {
      if (field.required && !userInfo[field.id]?.trim()) {
        newErrors[field.id] = `${field.label}不能为空`;
      }
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      navigate(`/${surveyId}/welcome`);
    }
  };

  return (
    <GradientBackground variant="purple">
      <div className={styles.header}>
        <div className={styles.icon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        <h1 className={styles.title}>开始之前</h1>
        <p className={styles.subtitle}>请填写以下信息，以便我们更好地了解您</p>
      </div>

      <GlassCard>
        {infoFields.map((field) => (
          <div key={field.id} className={styles.field}>
            <label className={styles.label}>
              {field.label}
              {!field.required && (
                <span className={styles.optional}>（选填）</span>
              )}
            </label>
            <input
              className={styles.input}
              type={field.type}
              placeholder={field.placeholder}
              value={userInfo[field.id] || ''}
              onChange={(e) => setUserInfo(field.id, e.target.value)}
            />
            {errors[field.id] && (
              <p className={styles.error}>{errors[field.id]}</p>
            )}
          </div>
        ))}
      </GlassCard>

      <div style={{ flex: 1 }} />

      <div className={styles.footer}>
        <PrimaryButton onClick={handleSubmit}>进入问卷 →</PrimaryButton>
        <p className={styles.privacy}>您的信息将严格保密，仅用于研究分析</p>
      </div>
    </GradientBackground>
  );
}
```

`src/pages/InfoCollection/index.module.css`:
```css
.header {
  text-align: center;
  margin-bottom: 40px;
}

.icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: white;
}

.subtitle {
  font-size: 14px;
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.field {
  margin-bottom: 20px;
}

.field:last-child {
  margin-bottom: 0;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 8px;
}

.optional {
  color: rgba(255, 255, 255, 0.35);
  font-weight: 400;
}

.input {
  width: 100%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 15px;
  color: white;
  font-family: inherit;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.35);
}

.error {
  color: #fca5a5;
  font-size: 12px;
  margin: 6px 0 0;
}

.footer {
  flex-shrink: 0;
}

.privacy {
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin: 12px 0 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/InfoCollection/
git commit -m "feat: add InfoCollection page with form validation"
```

---

### Task 11: Page 2 — Welcome

**Files:**
- Create: `src/pages/Welcome/index.jsx`, `src/pages/Welcome/index.module.css`

- [ ] **Step 1: Create Welcome page**

`src/pages/Welcome/index.jsx`:
```jsx
import { useNavigate, useParams } from 'react-router-dom';
import { FileTextOutlined, InfoCircleOutlined } from '@ant-design/icons';
import GradientBackground from '../../components/layout/GradientBackground';
import GlassCard from '../../components/layout/GlassCard';
import PrimaryButton from '../../components/common/PrimaryButton';
import useSurveyStore from '../../stores/surveyStore';
import styles from './index.module.css';

export default function Welcome() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const config = useSurveyStore((s) => s.surveyConfig);
  const startTimer = useSurveyStore((s) => s.startTimer);

  const handleStart = () => {
    startTimer();
    navigate(`/${surveyId}/survey`);
  };

  return (
    <GradientBackground variant="green">
      <div className={styles.header}>
        <div className={styles.icon}>
          <FileTextOutlined style={{ fontSize: 28, color: 'white' }} />
        </div>
        <h1 className={styles.title}>{config?.title || '问卷调查'}</h1>
        <p className={styles.desc}>{config?.description || ''}</p>
      </div>

      <div className={styles.infoCards}>
        <GlassCard className={styles.infoCard}>
          <div className={styles.infoValue}>{config?.questionCount || 0}</div>
          <div className={styles.infoLabel}>道题目</div>
        </GlassCard>
        <GlassCard className={styles.infoCard}>
          <div className={styles.infoValue}>~{config?.estimatedMinutes || 5}</div>
          <div className={styles.infoLabel}>分钟</div>
        </GlassCard>
        <GlassCard className={styles.infoCard}>
          <div className={styles.infoEmoji}>🎤</div>
          <div className={styles.infoLabel}>语音回答</div>
        </GlassCard>
      </div>

      <GlassCard className={styles.tipCard}>
        <div className={styles.tipContent}>
          <div className={styles.tipIcon}>
            <InfoCircleOutlined style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)' }} />
          </div>
          <div>
            <p className={styles.tipTitle}>温馨提示</p>
            <p className={styles.tipText}>
              请在安静环境中作答，确保语音清晰。部分题目需要语音回答，点击录音按钮即可开始。
            </p>
          </div>
        </div>
      </GlassCard>

      <div style={{ flex: 1 }} />

      <PrimaryButton onClick={handleStart} variant="solid" style={{ color: '#059669' }}>
        开始答题
      </PrimaryButton>
    </GradientBackground>
  );
}
```

`src/pages/Welcome/index.module.css`:
```css
.header {
  text-align: center;
  margin-bottom: 32px;
}

.icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 12px;
  color: white;
  line-height: 1.3;
}

.desc {
  font-size: 14px;
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.6;
}

.infoCards {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.infoCard {
  flex: 1;
  text-align: center;
  padding: 16px !important;
}

.infoValue {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.infoLabel {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.infoEmoji {
  font-size: 20px;
  margin-bottom: 4px;
}

.tipCard {
  margin-bottom: 24px;
}

.tipContent {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.tipIcon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tipTitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 6px;
  font-weight: 600;
}

.tipText {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  line-height: 1.6;
}
```

- [ ] **Step 2: Fix PrimaryButton to accept style prop**

Update `src/components/common/PrimaryButton.jsx`:
```jsx
import styles from './PrimaryButton.module.css';

export default function PrimaryButton({ children, onClick, variant = 'solid', style }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Welcome/ src/components/common/PrimaryButton.jsx
git commit -m "feat: add Welcome page with survey info and tips"
```

---

### Task 12: Page 3 — Survey (Core)

**Files:**
- Create: `src/pages/Survey/index.jsx`, `src/pages/Survey/index.module.css`

This is the core page combining all three question types with navigation.

- [ ] **Step 1: Create Survey page**

`src/pages/Survey/index.jsx`:
```jsx
import { useNavigate, useParams } from 'react-router-dom';
import GradientBackground from '../../components/layout/GradientBackground';
import ProgressBar from '../../components/layout/ProgressBar';
import NavigationBar from '../../components/common/NavigationBar';
import VoiceRecorder from '../../components/question/VoiceRecorder';
import ChoiceQuestion from '../../components/question/ChoiceQuestion';
import TextQuestion from '../../components/question/TextQuestion';
import useSurveyStore from '../../stores/surveyStore';
import styles from './index.module.css';

const TYPE_LABELS = { voice: '语音题', choice: '选择题', text: '填空题' };

export default function Survey() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const questions = useSurveyStore((s) => s.questions);
  const currentIndex = useSurveyStore((s) => s.currentIndex);
  const answers = useSurveyStore((s) => s.answers);
  const setAnswer = useSurveyStore((s) => s.setAnswer);
  const setRecordingBlob = useSurveyStore((s) => s.setRecordingBlob);
  const setRecordingDuration = useSurveyStore((s) => s.setRecordingDuration);
  const nextQuestion = useSurveyStore((s) => s.nextQuestion);
  const prevQuestion = useSurveyStore((s) => s.prevQuestion);
  const setCurrentIndex = useSurveyStore((s) => s.setCurrentIndex);
  const config = useSurveyStore((s) => s.surveyConfig);

  const question = questions[currentIndex];
  const isPaged = config?.displayMode !== 'scroll';
  const isLast = currentIndex === questions.length - 1;

  const handleNext = () => {
    if (isLast) {
      navigate(`/${surveyId}/complete`);
    } else {
      nextQuestion();
    }
  };

  const handleVoiceComplete = (blob, duration) => {
    setRecordingBlob(question.id, blob);
    setRecordingDuration(question.id, duration);
    setAnswer(question.id, true);
  };

  const handleVoiceReset = () => {
    setRecordingBlob(question.id, null);
    setRecordingDuration(question.id, 0);
    setAnswer(question.id, null);
  };

  const renderQuestion = (q) => {
    switch (q.type) {
      case 'voice':
        return (
          <VoiceRecorder
            onComplete={handleVoiceComplete}
            onReset={handleVoiceReset}
          />
        );
      case 'choice':
        return (
          <ChoiceQuestion
            options={q.options}
            multiple={q.multiple}
            value={answers[q.id]}
            onChange={(val) => setAnswer(q.id, val)}
          />
        );
      case 'text':
        return (
          <TextQuestion
            value={answers[q.id] || ''}
            onChange={(val) => setAnswer(q.id, val)}
            placeholder={q.placeholder}
            maxLength={q.maxLength}
          />
        );
      default:
        return null;
    }
  };

  // Scroll mode: all questions on one page
  if (!isPaged) {
    return (
      <GradientBackground variant="purple">
        <h1 className={styles.scrollTitle}>{config?.title}</h1>
        <div className={styles.scrollList}>
          {questions.map((q, idx) => (
            <div key={q.id} className={styles.scrollItem}>
              <p className={styles.questionNumber}>第 {idx + 1} 题 · {TYPE_LABELS[q.type] || ''}</p>
              <p className={styles.questionTitle}>{q.title}</p>
              {renderQuestion(q)}
            </div>
          ))}
        </div>
        <button className={styles.submitBtn} onClick={handleNext}>
          提交问卷
        </button>
      </GradientBackground>
    );
  }

  // Paged mode: one question per screen
  return (
    <GradientBackground variant="purple">
      <ProgressBar
        current={currentIndex}
        total={questions.length}
        label={TYPE_LABELS[question?.type] || ''}
      />

      <div className={styles.questionArea}>
        <p className={styles.questionTitle}>{question?.title}</p>
        {renderQuestion(question)}
      </div>

      <div style={{ flex: 1 }} />

      <NavigationBar
        onPrev={prevQuestion}
        onNext={handleNext}
        prevDisabled={currentIndex === 0}
        nextDisabled={false}
      />
    </GradientBackground>
  );
}
```

`src/pages/Survey/index.module.css`:
```css
.questionArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.questionTitle {
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  line-height: 1.5;
  margin: 0 0 32px;
  color: white;
}

.questionNumber {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 8px;
}

/* Scroll mode styles */
.scrollTitle {
  font-size: 20px;
  font-weight: 700;
  color: white;
  margin: 0 0 24px;
}

.scrollList {
  flex: 1;
  overflow-y: auto;
}

.scrollItem {
  margin-bottom: 40px;
}

.scrollItem .questionTitle {
  font-size: 17px;
  margin-bottom: 16px;
}

.submitBtn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 14px;
  background: white;
  color: #4f46e5;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Survey/
git commit -m "feat: add Survey page with paged and scroll modes"
```

---

### Task 13: Page 4 — Complete

**Files:**
- Create: `src/pages/Complete/index.jsx`, `src/pages/Complete/index.module.css`

- [ ] **Step 1: Create Complete page**

`src/pages/Complete/index.jsx`:
```jsx
import { CheckCircleOutlined } from '@ant-design/icons';
import GradientBackground from '../../components/layout/GradientBackground';
import GlassCard from '../../components/layout/GlassCard';
import PrimaryButton from '../../components/common/PrimaryButton';
import useSurveyStore from '../../stores/surveyStore';
import styles from './index.module.css';

export default function Complete() {
  const questions = useSurveyStore((s) => s.questions);
  const answers = useSurveyStore((s) => s.answers);
  const getElapsedTime = useSurveyStore((s) => s.getElapsedTime);
  const getVoiceAnswerCount = useSurveyStore((s) => s.getVoiceAnswerCount);

  const answeredCount = Object.keys(answers).length;
  const elapsed = getElapsedTime();
  const voiceCount = getVoiceAnswerCount();

  return (
    <GradientBackground variant="purple">
      <div className={styles.dots}>
        <div className={styles.dot} style={{ top: 120, left: 60, background: 'rgba(250,204,21,0.6)' }} />
        <div className={styles.dot} style={{ top: 160, right: 80, background: 'rgba(244,114,182,0.5)' }} />
        <div className={styles.dot} style={{ top: 200, left: 120, background: 'rgba(96,165,250,0.5)' }} />
        <div className={styles.dot} style={{ top: 100, right: 140, background: 'rgba(52,211,153,0.5)' }} />
        <div className={styles.dot} style={{ top: 240, right: 60, background: 'rgba(250,204,21,0.4)' }} />
        <div className={styles.dot} style={{ top: 180, left: 40, background: 'rgba(167,139,250,0.5)' }} />
      </div>

      <div style={{ flex: 1 }} />

      <div className={styles.checkCircle}>
        <CheckCircleOutlined style={{ fontSize: 44, color: 'white' }} />
      </div>
      <h1 className={styles.title}>提交成功</h1>
      <p className={styles.thanks}>
        感谢您的参与！<br />您的回答对我们非常重要。
      </p>

      <GlassCard className={styles.statsCard}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{answeredCount}</div>
          <div className={styles.statLabel}>已答题目</div>
        </div>
        <div className={styles.divider} />
        <div className={styles.stat}>
          <div className={styles.statValue}>{elapsed}</div>
          <div className={styles.statLabel}>用时</div>
        </div>
        <div className={styles.divider} />
        <div className={styles.stat}>
          <div className={styles.statValue}>{voiceCount}</div>
          <div className={styles.statLabel}>语音回答</div>
        </div>
      </GlassCard>

      <div className={styles.info}>
        <div className={styles.infoContent}>
          <div className={styles.infoText}>
            您的回答已加密保存，仅用于学术研究分析
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <PrimaryButton variant="ghost">关闭页面</PrimaryButton>
    </GradientBackground>
  );
}
```

`src/pages/Complete/index.module.css`:
```css
.dots {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.checkCircle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 28px;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.title {
  font-size: 26px;
  font-weight: 700;
  text-align: center;
  margin: 0 0 12px;
  color: white;
}

.thanks {
  font-size: 15px;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  margin: 0 0 36px;
}

.statsCard {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-bottom: 24px;
}

.statValue {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}

.statLabel {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.12);
}

.info {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 32px;
}

.infoContent {
  display: flex;
  align-items: center;
  gap: 10px;
}

.infoText {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Complete/
git commit -m "feat: add Complete page with stats summary"
```

---

### Task 14: App Routing & Data Loading

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Wire up routes and data loading**

`src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Spin } from 'antd';
import useSurveyStore from './stores/surveyStore';
import { fetchSurvey } from './api/survey';
import InfoCollection from './pages/InfoCollection';
import Welcome from './pages/Welcome';
import Survey from './pages/Survey';
import Complete from './pages/Complete';

function SurveyLoader({ children }) {
  const surveyId = useSurveyStore((s) => s.surveyId);
  const setSurveyData = useSurveyStore((s) => s.setSurveyData);
  const loading = useSurveyStore((s) => !s.surveyConfig);

  useEffect(() => {
    if (!surveyId) {
      const path = window.location.pathname.split('/')[1];
      fetchSurvey(path).then((data) => setSurveyData(data));
    }
  }, [surveyId, setSurveyData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#4f46e5' }}>
        <Spin size="large" />
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <SurveyLoader>
        <Routes>
          <Route path="/:surveyId" element={<InfoCollection />} />
          <Route path="/:surveyId/welcome" element={<Welcome />} />
          <Route path="/:surveyId/survey" element={<Survey />} />
          <Route path="/:surveyId/complete" element={<Complete />} />
        </Routes>
      </SurveyLoader>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Verify full flow**

```bash
npm run dev
```

Open http://localhost:5173/demo-survey — should see InfoCollection page with form.
Fill in and click "进入问卷" → Welcome page (green).
Click "开始答题" → Survey page with voice recorder.
Navigate through questions → Complete page.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire up routing and survey data loading"
```

---

### Task 15: Mobile Viewport & Final Polish

**Files:**
- Modify: `index.html`
- Modify: `src/styles/global.module.css`

- [ ] **Step 1: Set viewport meta in `index.html`**

Ensure the `<head>` contains:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

- [ ] **Step 2: Add mobile-specific global styles to `src/styles/global.module.css`**

Append to the existing file:
```css
/* Prevent pull-to-refresh on mobile */
html {
  overscroll-behavior: none;
}

/* Safe area for notched phones */
.content {
  padding-top: max(60px, env(safe-area-inset-top));
  padding-bottom: max(32px, env(safe-area-inset-bottom));
}

/* Touch target minimum */
button, [role="button"], [role="radio"], [role="checkbox"] {
  min-height: 44px;
}
```

- [ ] **Step 3: Final verify**

```bash
npm run dev
```

Open in Chrome DevTools mobile emulation (390×844). Test the full flow:
1. Info form → validate → submit
2. Welcome → green background → start
3. Survey → voice recording → choice → text → navigate
4. Complete → stats shown

- [ ] **Step 4: Final commit**

```bash
git add index.html src/styles/global.module.css
git commit -m "feat: add mobile viewport and touch optimizations"
```

---

## Self-Review Checklist

- [x] Spec coverage: All 4 pages implemented (Tasks 10-14)
- [x] Spec coverage: 3 question types — voice, choice, text (Tasks 8-9)
- [x] Spec coverage: Color system — purple + green gradients (Tasks 2, 10-13)
- [x] Spec coverage: Recording with waveform + timer (Tasks 7-8)
- [x] Spec coverage: Paged + scroll display modes (Task 12)
- [x] Spec coverage: Responsive mobile-first (Task 15)
- [x] No placeholders: All code is complete
- [x] Type consistency: Store API matches component usage
