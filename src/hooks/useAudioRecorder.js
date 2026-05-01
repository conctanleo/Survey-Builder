import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_MS = 5 * 60 * 1000;

export default function useAudioRecorder() {
  const [status, setStatus] = useState('idle');
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const [analyserData, setAnalyserData] = useState(new Uint8Array(0));

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const startAnalyser = useCallback((stream) => {
    const audioContext = new AudioContext();
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
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(audioBlob);
        setStatus('completed');
        stopAnalyser();
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(100);
      setStatus('recording');
      setDuration(0);
      setBlob(null);
      startAnalyser(stream);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setDuration(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_DURATION_MS) recorder.stop();
      }, 1000);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'permission' : err.message);
      setStatus('idle');
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

  useEffect(() => {
    return () => {
      stop();
      stopAnalyser();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [stop, stopAnalyser]);

  return { status, duration, blob, error, analyserData, start, stop, reset };
}
