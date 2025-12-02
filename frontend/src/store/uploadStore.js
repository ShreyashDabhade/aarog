import { create } from 'zustand';

export const useUploadStore = create((set) => ({
  // State
  currentStep: 1,
  file: null,
  processedImage: null,
  rawText: "",
  anonymizedText: "",
  isProcessing: false,
  uploadStatus: "idle", // idle | encrypting | uploading | success | error
  reportId: null,

  // Actions
  setStep: (step) => set({ currentStep: step }),
  setFile: (file) => set({ file }),
  setProcessedImage: (url) => set({ processedImage: url }),
  setRawText: (text) => set({ rawText: text }),
  setAnonymizedText: (text) => set({ anonymizedText: text }),
  setIsProcessing: (status) => set({ isProcessing: status }),
  setUploadStatus: (status) => set({ uploadStatus: status }),
  setReportId: (id) => set({ reportId: id }),
  
  reset: () => set({
    currentStep: 1,
    file: null,
    processedImage: null,
    rawText: "",
    anonymizedText: "",
    isProcessing: false,
    uploadStatus: "idle",
    reportId: null
  })
}));