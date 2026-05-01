import client from './client';
import { mockSurvey } from './mock';

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;

export async function fetchSurvey(surveyId) {
  if (USE_MOCK) return { ...mockSurvey, surveyId };
  const { data } = await client.get(`/surveys/${surveyId}`);
  return data;
}

export async function submitSurvey(surveyId, payload) {
  if (USE_MOCK) { console.log('Mock submit:', surveyId, payload); return { success: true }; }
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
