import axios from 'axios';
import useSurveyStore from '../stores/surveyStore';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

// 请求拦截器：添加 submissionId 到请求头
client.interceptors.request.use((config) => {
  const state = useSurveyStore.getState();
  if (state.submissionId) {
    config.headers['x-submission-id'] = state.submissionId;
  }
  return config;
});

export default client;
