import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Spin } from 'antd';
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
  const loading = useSurveyStore((s) => !s.surveyConfig);

  useEffect(() => {
    const urlSurveyId = location.pathname.split('/')[1];
    if (!urlSurveyId) return;
    if (!surveyId || surveyId !== urlSurveyId) {
      fetchSurvey(urlSurveyId).then((data) => setSurveyData(data));
    }
  }, [location.pathname, surveyId, setSurveyData]);

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
