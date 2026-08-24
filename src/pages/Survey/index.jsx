import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import GradientBackground from '../../components/layout/GradientBackground';
import ProgressBar from '../../components/layout/ProgressBar';
import NavigationBar from '../../components/common/NavigationBar';
import VoiceRecorder from '../../components/question/VoiceRecorder';
import ChoiceQuestion from '../../components/question/ChoiceQuestion';
import TextQuestion from '../../components/question/TextQuestion';
import useSurveyStore from '../../stores/surveyStore';
import { submitSurvey, uploadRecording } from '../../api/survey';
import styles from './index.module.css';

const TYPE_LABELS = { voice: '语音题', choice: '选择题', text: '填空题' };

export default function Survey() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const questions = useSurveyStore((s) => s.questions);
  const currentIndex = useSurveyStore((s) => s.currentIndex);
  const answers = useSurveyStore((s) => s.answers);
  const userInfo = useSurveyStore((s) => s.userInfo);
  const recordingDurations = useSurveyStore((s) => s.recordingDurations);
  const submissionId = useSurveyStore((s) => s.submissionId);
  const setAnswer = useSurveyStore((s) => s.setAnswer);
  const setRecordingBlob = useSurveyStore((s) => s.setRecordingBlob);
  const setRecordingDuration = useSurveyStore((s) => s.setRecordingDuration);
  const setSubmissionId = useSurveyStore((s) => s.setSubmissionId);
  const nextQuestion = useSurveyStore((s) => s.nextQuestion);
  const prevQuestion = useSurveyStore((s) => s.prevQuestion);
  const config = useSurveyStore((s) => s.surveyConfig);

  const question = questions[currentIndex];
  const isPaged = config?.displayMode !== 'scroll';
  const isLast = currentIndex === questions.length - 1;

  const isAnswered = (q) => {
    const a = answers[q.id];
    if (q.type === 'voice') return a === true;
    if (Array.isArray(a)) return a.length > 0;
    return typeof a === 'string' && a.trim() !== '';
  };

  const handleSubmit = async () => {
    // 必答题校验：scroll 模式检查全部，paged 模式由 handleNext 逐题拦截
    const missing = questions.filter(q => q.required && !isAnswered(q));
    if (missing.length > 0) {
      message.warning(`还有 ${missing.length} 道必答题未完成（${missing[0].title}${missing.length > 1 ? ' 等' : ''}）`);
      return;
    }
    try {
      console.log('Submitting with submissionId:', submissionId);
      await submitSurvey(surveyId, { userInfo, answers, recordingDurations, submissionId });
      navigate(`/${surveyId}/complete`);
    } catch (error) {
      message.error('提交失败，请重试');
      console.error('Submit error:', error);
    }
  };

  const handleNext = () => {
    // 分页模式：离开当前题前拦截未作答的必答题
    if (question?.required && !isAnswered(question)) {
      message.warning('请先完成本题再继续');
      return;
    }
    if (isLast) {
      handleSubmit();
    } else {
      nextQuestion();
    }
  };

  // scroll 模式下所有题目同时挂载，必须用传入的 questionId 定位，
  // 不能用 currentIndex 对应的题目（那是分页模式的概念）
  const handleVoiceComplete = async (questionId, blob, duration) => {
    setRecordingBlob(questionId, blob);
    setRecordingDuration(questionId, duration);
    setAnswer(questionId, true);

    try {
      const result = await uploadRecording(surveyId, questionId, blob);
      if (result.submissionId) {
        setSubmissionId(result.submissionId);
      }
    } catch (error) {
      // 上传失败不能静默：答案标记回退，告知用户重录（返回本页时会自动重试上传）
      console.error('Recording upload error:', error);
      message.error('录音上传失败，本题答案未保存，请点击重新录音后再试');
      setAnswer(questionId, null);
    }
  };

  const handleVoiceReset = (questionId) => {
    setRecordingBlob(questionId, null);
    setRecordingDuration(questionId, 0);
    setAnswer(questionId, null);
  };

  const renderQuestion = (q) => {
    switch (q.type) {
      case 'voice': return <VoiceRecorder questionId={q.id} onComplete={(blob, duration) => handleVoiceComplete(q.id, blob, duration)} onReset={() => handleVoiceReset(q.id)} />;
      case 'choice': return <ChoiceQuestion options={q.options} multiple={q.multiple} value={answers[q.id]} onChange={(val) => setAnswer(q.id, val)} />;
      case 'text': return <TextQuestion value={answers[q.id] || ''} onChange={(val) => setAnswer(q.id, val)} placeholder={q.placeholder} maxLength={q.maxLength} />;
      default: return null;
    }
  };

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
        <button className={styles.submitBtn} onClick={handleSubmit}>提交问卷</button>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground variant="purple">
      <ProgressBar current={currentIndex} total={questions.length} label={TYPE_LABELS[question?.type] || ''} />
      <div className={styles.questionArea}>
        <p className={styles.questionTitle}>{question?.title}</p>
        {renderQuestion(question)}
      </div>
      <div style={{ flex: 1 }} />
      <NavigationBar onPrev={prevQuestion} onNext={handleNext} prevDisabled={currentIndex === 0} />
    </GradientBackground>
  );
}
