import { create } from 'zustand';

export const useChatStore = create((set) => ({
  history: [],
  addToHistory: (msg) => set((state) => ({ history: [...state.history, msg] })),
  setHistory: (history) => set({ history }),
  clearHistory: () => set({ history: [] })
}));