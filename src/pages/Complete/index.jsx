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
      <p className={styles.thanks}>感谢您的参与！<br />您的回答对我们非常重要。</p>
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
        <div className={styles.infoText}>您的回答已加密保存，仅用于学术研究分析</div>
      </div>
      <div style={{ flex: 1 }} />
      <PrimaryButton variant="ghost">关闭页面</PrimaryButton>
    </GradientBackground>
  );
}
