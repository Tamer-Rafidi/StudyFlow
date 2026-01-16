// Global state management with Zustand

import { create } from 'zustand';
import type { Course, Document, Statistics, ChatMessage } from '../types';

interface AppState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // AI Model Selection
  aiModel: 'openai' | 'llama';
  setAiModel: (model: 'openai' | 'llama') => void;

  // Courses
  courses: Course[];
  setCourses: (courses: Course[]) => void;

  // Documents
  documents: Document[];
  setDocuments: (documents: Document[]) => void;
  currentDocument: Document | null;
  setCurrentDocument: (doc: Document | null) => void;

  // Statistics
  statistics: Statistics | null;
  setStatistics: (stats: Statistics) => void;

  // Chat
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  chatOpen: boolean;
  toggleChat: () => void;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;

  // Loading states
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // Notifications
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;
  showNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  clearNotification: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Theme
  darkMode: true, // Default to dark mode
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

  // AI Model Selection - Load from localStorage or default to openai
  aiModel: (localStorage.getItem('ai_model') as 'openai' | 'llama') || 'openai',
  setAiModel: (model) => {
    localStorage.setItem('ai_model', model);
    set({ aiModel: model });
  },

  // Courses
  courses: [],
  setCourses: (courses) => set({ courses }),

  // Documents
  documents: [],
  setDocuments: (documents) => set({ documents }),
  currentDocument: null,
  setCurrentDocument: (doc) => set({ currentDocument: doc }),

  // Statistics
  statistics: null,
  setStatistics: (stats) => set({ statistics: stats }),

  // Chat
  chatMessages: [],
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),
  clearChatMessages: () => set({ chatMessages: [] }),
  chatOpen: false,
  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
  conversationId: null,
  setConversationId: (id) => set({ conversationId: id }),

  // Loading
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Notifications
  notification: null,
  showNotification: (type, message) =>
    set({ notification: { type, message } }),
  clearNotification: () => set({ notification: null }),
}));