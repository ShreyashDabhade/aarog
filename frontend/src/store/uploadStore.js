import { create } from 'zustand';

export const useUploadStore = create((set) => ({
  step: 1, // 1: Drop, 2: OCR, 3: Anonymize, 4: Encrypt
  file: null,
  processedImage: null,
  rawText: "",
  anonymizedText: "",
  isProcessing: false,
  uploadStatus: 'idle', // idle, encrypting, uploading, success, error
  reportId: null,

  setStep: (step) => set({ step }),
  setFile: (file) => set({ file }),
  setProcessedImage: (img) => set({ processedImage: img }),
  setRawText: (text) => set({ rawText: text }),
  setAnonymizedText: (text) => set({ anonymizedText: text }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setUploadStatus: (status) => set({ uploadStatus: status }),
  setReportId: (id) => set({ reportId: id }),
  
  reset: () => set({ 
    step: 1, 
    file: null, 
    processedImage: null, 
    rawText: "", 
    anonymizedText: "", 
    isProcessing: false, 
    uploadStatus: 'idle', 
    reportId: null 
  })
}));