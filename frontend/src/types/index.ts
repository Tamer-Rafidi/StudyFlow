// TypeScript types for the application

export interface Course {
  code: string;
  name: string;
  document_count: number;
  flashcard_count: number;
}

export interface Document {
  id: number;
  filename: string;
  course: string;
  page_count: number | null;
  uploaded_at: string;
  flashcard_count: number;
  has_summary: boolean;
}

export interface Flashcard {
  id: number;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  mastered: boolean;
  times_reviewed: number;
}

export interface ExamQuestion {
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: { [key: string]: string }; // For multiple choice
  correct_answer?: string | boolean; // For MC and T/F
  explanation?: string;
  sample_answer?: string; // For short answer
  key_points?: string;
  difficulty?: string;
}

export interface Exam {
  id: string;
  title: string;
  course: string;
  exam_type: string;
  question_count: number;
  created_at: string;
  questions?: ExamQuestion[];
  best_score?: number;
  attempt_count?: number;
  average_score?: number;
  last_attempt?: string;
  completed?: boolean;
}

export interface ExamResults {
  score: number;
  total: number;
  percentage: number;
  results: Array<{
    question_index: number;
    correct: boolean;
    user_answer: string | boolean;
    correct_answer: string | boolean;
    explanation?: string;
  }>;
  // New fields
  best_score?: number;
  attempt_number?: number;
  improved?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: ChatSource[];
  suggestions?: string[];
}

export interface ChatSource {
  type: 'document' | 'flashcard' | 'summary';
  id: number;
  name: string;
  course?: string;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string | null;
  context?: {
    document_id?: number;
    page?: string;
  } | null;
}

export interface ChatResponse {
  message: string;
  sources: ChatSource[];
  suggestions: string[];
  conversation_id: string;
}

export interface Statistics {
  total_courses: number;
  total_documents: number;
  total_summaries: number;
  total_flashcards: number;
  mastered_flashcards: number;
  unmastered_flashcards: number;
}

export interface UploadProgress {
  stage: 'uploading' | 'extracting' | 'summarizing' | 'generating_flashcards' | 'complete';
  progress: number;
  message: string;
}