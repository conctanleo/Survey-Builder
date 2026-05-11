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

  const handleNext = async () => {
    if (isLast) {
      try {
        console.log('Submitting with submissionId:', submissionId);
        await submitSurvey(surveyId, { userInfo, answers, recordingDurations, submissionId });
        navigate(`/${surveyId}/complete`);
      } catch (error) {
        message.error('提交失败，请重试');
        console.error('Submit error:', error);
      }
    } else {
      nextQuestion();
    }
  };

  const handleVoiceComplete = async (blob, duration) => {
    setRecordingBlob(question.id, blob);
    setRecordingDuration(question.id, duration);
    setAnswer(question.id, true);

    try {
      const result = await uploadRecording(surveyId, question.id, blob);
      console.log('Recording upload result:', result);
      if (result.submissionId) {
        setSubmissionId(result.submissionId);
        console.log('Set submissionId:', result.submissionId);
      }
    } catch (error) {
      console.error('Recording upload error:', error);
    }
  };

  const handleVoiceReset = () => {
    setRecordingBlob(question.id, null);
    setRecordingDuration(question.id, 0);
    setAnswer(question.id, null);
  };

  const renderQuestion = (q) => {
    switch (q.type) {
      case 'voice': return <VoiceRecorder questionId={q.id} onComplete={handleVoiceComplete} onReset={handleVoiceReset} />;
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
        <button className={styles.submitBtn} onClick={handleNext}>提交问卷</button>
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
