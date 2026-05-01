import { create } from 'zustand';

const useSurveyStore = create((set, get) => ({
  surveyId: null,
  surveyConfig: null,
  questions: [],
  infoFields: [],
  userInfo: {},
  answers: {},
  recordingBlobs: {},
  recordingDurations: {},
  currentIndex: 0,
  startTime: null,

  setSurveyData: (data) => set({
    surveyId: data.surveyId,
    surveyConfig: data.config,
    questions: data.questions,
    infoFields: data.infoFields,
  }),

  setUserInfo: (fieldId, value) => set((state) => ({
    userInfo: { ...state.userInfo, [fieldId]: value },
  })),

  setAnswer: (questionId, value) => set((state) => ({
    answers: { ...state.answers, [questionId]: value },
  })),

  setRecordingBlob: (questionId, blob) => set((state) => ({
    recordingBlobs: { ...state.recordingBlobs, [questionId]: blob },
  })),

  setRecordingDuration: (questionId, seconds) => set((state) => ({
    recordingDurations: { ...state.recordingDurations, [questionId]: seconds },
  })),

  setCurrentIndex: (index) => set({ currentIndex: index }),
  nextQuestion: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.questions.length - 1),
  })),
  prevQuestion: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0),
  })),

  startTimer: () => set({ startTime: Date.now() }),

  getElapsedTime: () => {
    const { startTime } = get();
    if (!startTime) return '00:00';
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    return `${min}:${sec}`;
  },

  getVoiceAnswerCount: () => Object.keys(get().recordingBlobs).length,

  reset: () => set({
    surveyId: null, surveyConfig: null, questions: [], infoFields: [],
    userInfo: {}, answers: {}, recordingBlobs: {}, recordingDurations: {},
    currentIndex: 0, startTime: null,
  }),
}));

export default useSurveyStore;
