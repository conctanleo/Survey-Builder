import client from './client';
import { mockSurvey } from './mock';

// mock 仅用于本地开发（npm run dev 且未配置 API 地址）；
// 生产构建（vite build）始终走真实 API，client 的 baseURL 默认 '/api'（由 nginx 反代）
const USE_MOCK = import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL;

export async function fetchSurvey(surveyId) {
  if (USE_MOCK) return { ...mockSurvey, surveyId };
  const { data } = await client.get(`/surveys/${surveyId}`);
  return data;
}

export async function submitSurvey(surveyId, payload) {
  // 不把 payload（含姓名/手机号等 PII）打进控制台日志
  if (USE_MOCK) { console.log('Mock submit:', surveyId, Object.keys(payload)); return { success: true }; }
  const { data } = await client.post(`/surveys/${surveyId}/submit`, payload);
  return data;
}

export async function uploadRecording(surveyId, questionId, blob) {
  if (USE_MOCK) { console.log('Mock upload:', questionId, blob.size, 'bytes'); return { success: true }; }
  const formData = new FormData();
  formData.append('recording', blob, `${questionId}.webm`);
  const { data } = await client.post(`/surveys/${surveyId}/recordings/${questionId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}
