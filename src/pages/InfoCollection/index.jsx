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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
        </div>
        <h1 className={styles.title}>开始之前</h1>
        <p className={styles.subtitle}>请填写以下信息，以便我们更好地了解您</p>
      </div>
      <GlassCard>
        {infoFields.map((field) => (
          <div key={field.id} className={styles.field}>
            <label className={styles.label}>
              {field.label}
              {!field.required && <span className={styles.optional}>（选填）</span>}
            </label>
            <input
              className={styles.input}
              type={field.type}
              placeholder={field.placeholder}
              value={userInfo[field.id] || ''}
              onChange={(e) => setUserInfo(field.id, e.target.value)}
            />
            {errors[field.id] && <p className={styles.error}>{errors[field.id]}</p>}
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
