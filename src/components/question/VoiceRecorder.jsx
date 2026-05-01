import { useMemo, useRef, useEffect } from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import styles from './VoiceRecorder.module.css';

export default function VoiceRecorder({ onComplete, onReset }) {
  const recorder = useAudioRecorder();
  const notifiedRef = useRef(false);

  const handleClick = () => {
    if (recorder.status === 'idle') {
      recorder.start();
      notifiedRef.current = false;
    } else if (recorder.status === 'recording') {
      recorder.stop();
    } else if (recorder.status === 'completed') {
      recorder.reset();
      notifiedRef.current = false;
      onReset?.();
    }
  };

  const formattedTime = useMemo(() => {
    const min = String(Math.floor(recorder.duration / 60)).padStart(2, '0');
    const sec = String(recorder.duration % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }, [recorder.duration]);

  useEffect(() => {
    if (recorder.status === 'completed' && recorder.blob && !notifiedRef.current) {
      notifiedRef.current = true;
      onComplete?.(recorder.blob, recorder.duration);
    }
  }, [recorder.status, recorder.blob, recorder.duration, onComplete]);

  return (
    <div className={styles.container}>
      <div
        className={`${styles.button} ${styles[recorder.status]}`}
        onClick={handleClick}
        role="button"
        aria-label={
          recorder.status === 'idle' ? '点击开始录音'
          : recorder.status === 'recording' ? '点击停止录音'
          : '点击重新录音'
        }
      >
        {recorder.status === 'recording' && (
          <>
            <div className={styles.pulse1} />
            <div className={styles.pulse2} />
          </>
        )}
        <div className={styles.icon}>
          {recorder.status === 'completed' ? (
            <CheckCircleOutlined style={{ fontSize: 32, color: 'white' }} />
          ) : recorder.status === 'recording' ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
          )}
        </div>
      </div>

      <p className={styles.statusText}>
        {recorder.status === 'idle' && '点击开始录音'}
        {recorder.status === 'recording' && '录音中...'}
        {recorder.status === 'completed' && '点击重新录音'}
      </p>

      {(recorder.status === 'recording' || recorder.status === 'completed') && (
        <p className={styles.timer}>{formattedTime}</p>
      )}

      {recorder.status === 'recording' && (
        <div className={styles.waveform}>
          {Array.from(recorder.analyserData).slice(0, 15).map((value, i) => (
            <div
              key={i}
              className={styles.bar}
              style={{ height: `${Math.max(4, (value / 255) * 32)}px`, opacity: 0.3 + (value / 255) * 0.4 }}
            />
          ))}
        </div>
      )}

      {recorder.error === 'permission' && (
        <p className={styles.error}>请允许麦克风权限以使用语音功能</p>
      )}
    </div>
  );
}
