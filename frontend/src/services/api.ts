// API service for communicating with the backend

import type {
  Course,
  Document,
  Flashcard,
  Exam,
  Statistics,
  ChatRequest,
  ChatResponse,
  UploadProgress,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Helper function for making API requests
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get AI model preference from localStorage
  const aiModel = localStorage.getItem('ai_model') || 'openai';
  const openaiModel = localStorage.getItem('openai_model') || 'gpt-4o-mini';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Model': aiModel,
      'X-OpenAI-Model': openaiModel,
      'X-OpenAI-API-Key': openaiApiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An error occurred',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Courses API
export async function getCourses(): Promise<Course[]> {
  return fetchAPI<Course[]>('/courses');
}

export async function getCourse(courseCode: string): Promise<Course> {
  return fetchAPI<Course>(`/courses/${courseCode}`);
}

export async function createCourse(courseCode: string, courseName?: string): Promise<Course> {
  const params = new URLSearchParams();
  params.append('course_code', courseCode);
  if (courseName) {
    params.append('course_name', courseName);
  }

  const aiModel = localStorage.getItem('ai_model') || 'openai';
  const openaiModel = localStorage.getItem('openai_model') || 'gpt-4o-mini';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/courses`, {
    method: 'POST',
    headers: {
      'X-AI-Model': aiModel,
      'X-OpenAI-Model': openaiModel,
      'X-OpenAI-API-Key': openaiApiKey,
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'Failed to create course',
    }));
    throw new Error(error.message || 'Failed to create course');
  }

  const result = await response.json();
  return result.course;
}

export async function deleteCourse(courseCode: string): Promise<void> {
  return fetchAPI<void>(`/courses/${courseCode}`, {
    method: 'DELETE',
  });
}

// Documents API
export async function getDocuments(courseCode?: string): Promise<Document[]> {
  const endpoint = courseCode ? `/documents?course=${courseCode}` : '/documents';
  return fetchAPI<Document[]>(endpoint);
}

export async function getDocument(documentId: number): Promise<Document> {
  return fetchAPI<Document>(`/documents/${documentId}`);
}

export async function deleteDocument(documentId: number): Promise<void> {
  return fetchAPI<void>(`/documents/${documentId}`, {
    method: 'DELETE',
  });
}

// Upload API
export async function uploadDocument(
  file: File,
  course: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('course', course.trim());
  formData.append('cards_per_difficulty', '5');

  const aiModel = localStorage.getItem('ai_model') || 'openai';
  const openaiModel = localStorage.getItem('openai_model') || 'gpt-4o-mini';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';

  console.log('📤 Uploading:', { file: file.name, course: course.trim(), aiModel, openaiModel });

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        'X-AI-Model': aiModel,
        'X-OpenAI-Model': openaiModel,
        'X-OpenAI-API-Key': openaiApiKey,
      },
      body: formData,
    });

    console.log('✅ Got response:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ Response not OK:', response.status);
      
      let errorMessage = 'Upload failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || 'Upload failed';
        console.error('❌ Error details:', errorData);
      } catch (e) {
        console.error('❌ Could not parse error response');
      }
      
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    const isSSE = contentType?.includes('text/event-stream');

    console.log('📡 Response type:', contentType);
    console.log('📡 Is SSE?', isSSE);

    if (isSSE) {
      console.log('🔄 Starting SSE stream processing...');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        console.error('❌ Response body is not readable');
        throw new Error('Response body is not readable');
      }

      let result: any = null;
      let buffer = '';
      let updateCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('✅ SSE stream ended');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                updateCount++;
                
                console.log(`📊 Progress update #${updateCount}:`, data);
                
                if (data.stage || data.progress !== undefined) {
                  if (onProgress) {
                    onProgress({
                      stage: data.stage as any,
                      progress: data.progress,
                      message: data.message,
                    });
                  }
                } else if (data.status === 'success') {
                  console.log('✅ Got final result:', data);
                  result = data;
                }
              } catch (e) {
                console.error('❌ Failed to parse SSE data:', e, line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!result) {
        console.error('❌ No result received from SSE stream');
        throw new Error('Upload completed but no result received');
      }

      console.log('✅ Upload complete with SSE');
      return result;
    } else {
      console.warn('⚠️ Backend not streaming progress, using simulation');
      console.log('📦 Starting simulated progress...');
      
      if (onProgress) {
        const stages: UploadProgress[] = [
          { stage: 'uploading', progress: 20, message: 'Uploading file...' },
          { stage: 'extracting', progress: 40, message: 'Extracting text...' },
          { stage: 'summarizing', progress: 60, message: 'Generating summary...' },
          { stage: 'generating_flashcards', progress: 80, message: 'Creating flashcards...' },
        ];

        for (let i = 0; i < stages.length; i++) {
          console.log(`📊 Simulated progress ${i + 1}/${stages.length}:`, stages[i]);
          onProgress(stages[i]);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log('📦 Getting final result...');
      const result = await response.json();
      
      console.log('✅ Got result:', result);
      
      if (onProgress) {
        console.log('📊 Sending final progress update');
        onProgress({
          stage: 'complete',
          progress: 100,
          message: 'Processing complete!',
        });
      }

      console.log('✅ Upload complete with simulation');
      return result;
    }
  } catch (error) {
    console.error('❌ Upload error:', error);
    throw error;
  }
}

// Flashcards API
export async function getFlashcards(
  documentId?: number,
  courseCode?: string,
  masteredOnly?: boolean
): Promise<Flashcard[]> {
  const params = new URLSearchParams();
  if (documentId) params.append('document_id', documentId.toString());
  if (courseCode) params.append('course', courseCode);
  if (masteredOnly !== undefined) params.append('mastered', masteredOnly.toString());

  const query = params.toString();
  const endpoint = `/flashcards${query ? `?${query}` : ''}`;
  
  return fetchAPI<Flashcard[]>(endpoint);
}

export async function getFlashcard(flashcardId: number): Promise<Flashcard> {
  return fetchAPI<Flashcard>(`/flashcards/${flashcardId}`);
}

export async function updateFlashcard(
  flashcardId: number,
  updates: Partial<Flashcard>
): Promise<Flashcard> {
  return fetchAPI<Flashcard>(`/flashcards/${flashcardId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function markFlashcardMastered(
  flashcardId: number,
  mastered: boolean
): Promise<Flashcard> {
  return updateFlashcard(flashcardId, { mastered });
}

export async function deleteFlashcard(flashcardId: number): Promise<void> {
  return fetchAPI<void>(`/flashcards/${flashcardId}`, {
    method: 'DELETE',
  });
}

// Exams API
export async function getExams(): Promise<Exam[]> {
  return fetchAPI<Exam[]>('/exams');
}

export async function getExam(examId: string): Promise<Exam> {
  return fetchAPI<Exam>(`/exams/${examId}`);
}

export async function generateExam(options: {
  course?: string;
  document_ids?: number[];
  question_types?: Array<{ type: string; count: number }>;
  question_count?: number;
}): Promise<Exam> {
  console.log('📝 Generating exam with options:', options);
  
  return fetchAPI<Exam>('/exams/generate', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function submitExamAnswers(
  examId: string,
  answers: { [questionIndex: number]: string | boolean }
): Promise<{
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
}> {
  return fetchAPI(`/exams/${examId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export async function deleteExam(examId: string): Promise<void> {
  return fetchAPI<void>(`/exams/${examId}`, {
    method: 'DELETE',
  });
}

export async function resetExamAttempts(examId: string): Promise<void> {
  return fetchAPI<void>(`/exams/${examId}/attempts`, {
    method: 'DELETE',
  });
}

export async function getExamAttempts(examId: string): Promise<any> {
  return fetchAPI(`/exams/${examId}/attempts`);
}

// Chat API - FIXED to use fetchAPI helper
export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  console.log('💬 Sending chat message:', request.message);
  
  return fetchAPI<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getChatHistory(
  conversationId: string
): Promise<ChatResponse[]> {
  return fetchAPI<ChatResponse[]>(`/chat/history/${conversationId}`);
}

export async function clearChatHistory(conversationId: string): Promise<void> {
  return fetchAPI<void>(`/chat/history/${conversationId}`, {
    method: 'DELETE',
  });
}

// Statistics API
export async function getStatistics(): Promise<Statistics> {
  return fetchAPI<Statistics>('/statistics');
}

export async function getCourseStatistics(courseCode: string): Promise<{
  course: Course;
  flashcard_stats: {
    total: number;
    mastered: number;
    unmastered: number;
    by_difficulty: {
      easy: number;
      medium: number;
      hard: number;
    };
  };
  recent_activity: Array<{
    type: 'upload' | 'practice' | 'exam';
    timestamp: string;
    details: string;
  }>;
}> {
  return fetchAPI(`/statistics/course/${courseCode}`);
}

// Summary API
export async function getDocumentSummary(documentId: number): Promise<{
  summary: string;
  key_points: string[];
  topics: string[];
}> {
  return fetchAPI(`/documents/${documentId}/summary`);
}

export async function regenerateSummary(documentId: number): Promise<{
  summary: string;
  key_points: string[];
  topics: string[];
}> {
  return fetchAPI(`/documents/${documentId}/summary/regenerate`, {
    method: 'POST',
  });
}

// Search API
export async function searchDocuments(query: string): Promise<{
  documents: Document[];
  flashcards: Flashcard[];
  highlights: Array<{
    document_id: number;
    page: number;
    excerpt: string;
  }>;
}> {
  return fetchAPI(`/search?q=${encodeURIComponent(query)}`);
}

// Health check
export async function healthCheck(): Promise<{ status: string; version: string }> {
  return fetchAPI('/health');
}

// Test OpenAI API key
export async function testOpenAIKey(apiKey: string): Promise<{
  valid: boolean;
  error?: string;
  message?: string;
}> {
  return fetchAPI('/test-openai-key', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  });
}