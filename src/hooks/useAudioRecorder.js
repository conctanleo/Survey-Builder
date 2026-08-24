import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_MS = 5 * 60 * 1000;

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export default function useAudioRecorder() {
  const [status, setStatus] = useState('idle');
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const [analyserData, setAnalyserData] = useState(new Uint8Array(0));
  const [mimeType, setMimeType] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const startingRef = useRef(false);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startAnalyser = useCallback((audioContext, stream) => {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const update = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      setAnalyserData(data);
      animFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const start = useCallback(async () => {
    // 重入守卫：getUserMedia + 1 秒麦克风检测期间阻止二次点击并发启动
    // （否则会泄漏第一套 MediaStream/AudioContext，且两个 onstop 互相覆盖 blob）
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      setError(null);

      // Check HTTPS (getUserMedia requires secure context)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        setError('https_required');
        setStatus('idle');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Diagnostic: log selected mic device
      const audioTrack = stream.getAudioTracks()[0];
      console.log('[AudioRecorder] Mic:', audioTrack?.label, 'Settings:', audioTrack?.getSettings());

      // Create a single AudioContext for both mic check and waveform analyser
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();

      // Check mic volume for 1 second before starting recorder
      const checkSource = audioContext.createMediaStreamSource(stream);
      const checkAnalyser = audioContext.createAnalyser();
      checkAnalyser.fftSize = 2048;
      checkSource.connect(checkAnalyser);

      await new Promise(resolve => setTimeout(resolve, 1000));
      const checkData = new Float32Array(checkAnalyser.fftSize);
      checkAnalyser.getFloatTimeDomainData(checkData);
      const peak = Math.max(...checkData.map(Math.abs));
      checkSource.disconnect();
      checkAnalyser.disconnect();

      console.log('[AudioRecorder] Mic check peak level:', peak.toFixed(4), peak < 0.01 ? '(SILENT!)' : '(OK)');

      if (peak < 0.01) {
        setError('mic_silent');
        stream.getTracks().forEach(t => t.stop());
        audioContext.close();
        audioContextRef.current = null;
        setStatus('idle');
        return;
      }

      const detectedMimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, detectedMimeType ? { mimeType: detectedMimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const actualMime = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: actualMime });
        setBlob(audioBlob);
        setStatus('completed');
        stopAnalyser();
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(100);
      setMimeType(recorder.mimeType || detectedMimeType || 'audio/webm');
      setStatus('recording');
      setDuration(0);
      setBlob(null);
      startAnalyser(audioContext, stream);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setDuration(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_DURATION_MS) {
          // 到时自动停止：先清定时器，避免每秒对已停止的 recorder 重复调 stop() 抛错
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (recorder.state === 'recording') recorder.stop();
        }
      }, 1000);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'permission' : err.message);
      setStatus('idle');
    } finally {
      startingRef.current = false;
    }
  }, [startAnalyser, stopAnalyser]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setStatus('idle');
    setDuration(0);
    setBlob(null);
    setError(null);
    setAnalyserData(new Uint8Array(0));
  }, [stop]);

  // 设置已完成状态（用于从 store 恢复已有录音）
  const setCompletedState = useCallback((existingBlob, existingDuration) => {
    setBlob(existingBlob);
    setDuration(existingDuration);
    setStatus('completed');
  }, []);

  useEffect(() => {
    return () => {
      stop();
      stopAnalyser();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [stop, stopAnalyser]);

  return { status, duration, blob, error, analyserData, mimeType, start, stop, reset, setCompletedState };
}
