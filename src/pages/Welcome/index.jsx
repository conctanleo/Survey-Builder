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
            <p className={styles.tipText}>请在安静环境中作答，确保语音清晰。部分题目需要语音回答，点击录音按钮即可开始。</p>
          </div>
        </div>
      </GlassCard>
      <div style={{ flex: 1 }} />
      <PrimaryButton onClick={handleStart} style={{ color: '#059669' }}>开始答题</PrimaryButton>
    </GradientBackground>
  );
}
