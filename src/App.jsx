import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Spin, Button } from 'antd';
import useSurveyStore from './stores/surveyStore';
import { fetchSurvey } from './api/survey';
import InfoCollection from './pages/InfoCollection';
import Welcome from './pages/Welcome';
import Survey from './pages/Survey';
import Complete from './pages/Complete';

function SurveyLoader({ children }) {
  const location = useLocation();
  const surveyId = useSurveyStore((s) => s.surveyId);
  const setSurveyData = useSurveyStore((s) => s.setSurveyData);
  const reset = useSurveyStore((s) => s.reset);
  const loading = useSurveyStore((s) => !s.surveyConfig);
  const [loadError, setLoadError] = useState(null);
  const fetchingRef = useRef(null);

  useEffect(() => {
    const urlSurveyId = location.pathname.split('/')[1];
    if (!urlSurveyId || urlSurveyId === surveyId || fetchingRef.current === urlSurveyId) return;
    fetchingRef.current = urlSurveyId;
    // 切换问卷时清空旧状态（submissionId/answers 等），避免串卷
    reset();
    setLoadError(null);
    fetchSurvey(urlSurveyId)
      .then((data) => {
        setSurveyData(data);
        fetchingRef.current = null;
      })
      .catch(() => {
        // 404（二维码扫错/问卷已删除）或网络错误：给出明确提示，而不是无限转圈
        setLoadError(`问卷「${urlSurveyId}」加载失败，请检查链接是否正确或稍后重试`);
        fetchingRef.current = null;
      });
  }, [location.pathname, surveyId, reset, setSurveyData]);

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#4f46e5', color: 'white', gap: 16 }}>
        <p style={{ fontSize: 16 }}>{loadError}</p>
        <Button type="primary" onClick={() => window.location.reload()}>重试</Button>
      </div>
    );
  }

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
