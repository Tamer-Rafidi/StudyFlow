import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  FileText,
  Plus,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  Loader,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getExams, generateExam, submitExamAnswers, deleteExam, getCourses, getDocuments, resetExamAttempts } from '../services/api';
import type { Exam, Course, Document } from '../types';

const Exams: FC = () => {
  const { showNotification } = useStore();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<{ [key: number]: string | boolean }>({});
  const [results, setResults] = useState<any>(null);

  // Generator state
  const [selectedCourse, setSelectedCourse] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [questionConfig, setQuestionConfig] = useState({
    multiple_choice: { enabled: false, count: 5 },
    true_false: { enabled: false, count: 5 },
    short_answer: { enabled: false, count: 2 },
  });
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadDocuments();
    }
  }, [selectedCourse]);

  // Debug logging
  useEffect(() => {
    console.log('📊 Current exams state:', exams.map(e => ({ id: e.id, title: e.title, course: e.course })));
  }, [exams]);

  useEffect(() => {
    if (activeExam) {
      console.log('🎯 Active exam set:', { id: activeExam.id, title: activeExam.title });
    } else {
      console.log('🎯 No active exam');
    }
  }, [activeExam]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [examsData, coursesData] = await Promise.all([
        getExams(),
        getCourses(),
      ]);
      console.log('✅ Loaded exams:', examsData.length);
      setExams(examsData);
      setCourses(coursesData);
    } catch (error) {
      console.error('Failed to load exams:', error);
      showNotification('error', 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const docs = await getDocuments(selectedCourse);
      setDocuments(docs);
      setSelectedDocuments([]);
    } catch (error) {
      console.error('Failed to load documents:', error);
      showNotification('error', 'Failed to load documents');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const toggleDocumentSelection = (docId: number) => {
    setSelectedDocuments(prev => 
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const selectAllDocuments = () => {
    if (selectedDocuments.length === documents.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(documents.map(d => d.id));
    }
  };

  const handleResetAttempts = async (examId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!confirm('Reset all attempts for this exam? This will clear your best score and attempt history. This cannot be undone.')) {
      return;
    }

    try {
      console.log('🔄 Resetting attempts for:', examId);
      await resetExamAttempts(examId);
      
      // Update the exam in state to reflect reset
      setExams(prevExams => prevExams.map(exam => 
        exam.id === examId 
          ? { 
              ...exam, 
              best_score: undefined, 
              attempt_count: 0, 
              average_score: undefined,
              completed: false 
            }
          : exam
      ));
      
      showNotification('success', 'Exam attempts reset successfully');
    } catch (error) {
      console.error('Failed to reset attempts:', error);
      showNotification('error', 'Failed to reset attempts');
    }
  };

  const updateQuestionType = (type: keyof typeof questionConfig, field: string, value: any) => {
    setQuestionConfig(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      }
    }));
  };

  const getTotalQuestions = () => {
    return Object.values(questionConfig).reduce(
      (sum, config) => sum + (config.enabled ? config.count : 0),
      0
    );
  };

  const getEnabledQuestionTypes = () => {
    return Object.entries(questionConfig)
      .filter(([_, config]) => config.enabled && config.count > 0)
      .map(([type, config]) => ({ type, count: config.count }));
  };

  const canProceedToStep = (step: number) => {
    if (step === 2) return selectedCourse !== '';
    if (step === 3) return selectedDocuments.length > 0;
    return true;
  };

  const handleGenerate = async () => {
    const enabledTypes = getEnabledQuestionTypes();
    
    if (enabledTypes.length === 0) {
      showNotification('error', 'Please enable at least one question type');
      return;
    }

    if (selectedDocuments.length === 0) {
      showNotification('error', 'Please select at least one document');
      return;
    }

    setGenerating(true);
    try {
      console.log('🎯 Generating exam:', { course: selectedCourse, document_ids: selectedDocuments, question_types: enabledTypes });
      
      const exam = await generateExam({
        course: selectedCourse,
        document_ids: selectedDocuments,
        question_types: enabledTypes,
      });

      console.log('✅ Exam generated:', exam.id);
      
      // Add new exam to the beginning of the list
      setExams(prevExams => [exam, ...prevExams]);
      resetGenerator();
      showNotification('success', 'Exam generated successfully! 🎉');
    } catch (error) {
      console.error('Failed to generate exam:', error);
      showNotification('error', 'Failed to generate exam');
    } finally {
      setGenerating(false);
    }
  };

  const resetGenerator = () => {
    setShowGenerator(false);
    setCurrentStep(1);
    setSelectedCourse('');
    setDocuments([]);
    setSelectedDocuments([]);
    setQuestionConfig({
      multiple_choice: { enabled: true, count: 5 },
      true_false: { enabled: true, count: 5 },
      short_answer: { enabled: false, count: 0 },
    });
  };

  const handleStartExam = (exam: Exam, event?: React.MouseEvent) => {
    
    if (event) {
      event.stopPropagation();
    }
    
    console.log('🎯 Starting exam:', exam.id, exam.title);
    setActiveExam(exam);
    setAnswers({});
    setResults(null);
  };

  const handleAnswerChange = (questionIndex: number, answer: string | boolean) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmit = async () => {
    if (!activeExam) return;

    try {
      console.log('📝 Submitting exam:', activeExam.id);
      const result = await submitExamAnswers(activeExam.id, answers);
      
      
      setResults(result);
      
      console.log('🔄 Refreshing exam list...');
      const updatedExams = await getExams();
      setExams(updatedExams);
      
      console.log('✅ Exams refreshed with new scores');
      
      showNotification('success', `You scored ${result.percentage}%! 🎉`);
    } catch (error) {
      console.error('Failed to submit exam:', error);
      showNotification('error', 'Failed to submit exam');
    }
  };

  const handleDelete = async (examId: string, event: React.MouseEvent) => {
    // Prevent event bubbling to parent elements
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this exam?')) return;

    try {
      console.log('🗑️ Deleting exam:', examId);
      await deleteExam(examId);
      
      setExams(prevExams => {
        const filtered = prevExams.filter(e => e.id !== examId);
        console.log('Exams after deletion:', filtered.length);
        return filtered;
      });
      
      showNotification('success', 'Exam deleted successfully');
    } catch (error) {
      console.error('Failed to delete exam:', error);
      showNotification('error', 'Failed to delete exam');
    }
  };

  const handleCancelExam = (event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    console.log('Cancelling exam');
    setActiveExam(null);
    setAnswers({});
    setResults(null);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading exams...</p>
        </div>
      </div>
    );
  }

  // Taking an exam
  if (activeExam && !results) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <div className="glass rounded-2xl p-8 border border-primary-500/20 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{activeExam.title}</h1>
              <p className="text-gray-400">{activeExam.course} • {activeExam.question_count} questions</p>
            </div>
            <button
            onClick={(e) => handleCancelExam(e)}
            className="btn-ghost"
          >
            Cancel
          </button>
          </div>
        </div>

        <div className="space-y-6">
          {activeExam.questions?.map((question, idx) => (
            <div key={idx} className="glass rounded-xl p-6 border border-dark-800">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-primary-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-400">{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-lg mb-4">{question.question}</p>

                  {question.type === 'multiple_choice' && question.options && (
                    <div className="space-y-3">
                      {Object.entries(question.options).map(([key, value]) => (
                        <label
                          key={key}
                          className={`flex items-center gap-3 p-4 bg-dark-900 rounded-lg cursor-pointer transition-all ${
                            answers[idx] === key
                              ? 'border-2 border-primary-500 bg-primary-500/10'
                              : 'border-2 border-transparent hover:border-primary-500/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${idx}`}
                            value={key}
                            checked={answers[idx] === key}
                            onChange={() => handleAnswerChange(idx, key)}
                            className="w-5 h-5 text-primary-600"
                          />
                          <span className="flex-1">{key}. {value}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {question.type === 'true_false' && (
                    <div className="grid grid-cols-2 gap-4">
                      <label className={`flex items-center justify-center gap-3 p-4 bg-dark-900 rounded-lg cursor-pointer transition-all ${
                        answers[idx] === true
                          ? 'border-2 border-primary-500 bg-primary-500/10'
                          : 'border-2 border-transparent hover:border-primary-500/50'
                      }`}>
                        <input
                          type="radio"
                          name={`question-${idx}`}
                          checked={answers[idx] === true}
                          onChange={() => handleAnswerChange(idx, true)}
                          className="w-5 h-5 text-primary-600"
                        />
                        <span className="font-semibold">True</span>
                      </label>
                      <label className={`flex items-center justify-center gap-3 p-4 bg-dark-900 rounded-lg cursor-pointer transition-all ${
                        answers[idx] === false
                          ? 'border-2 border-primary-500 bg-primary-500/10'
                          : 'border-2 border-transparent hover:border-primary-500/50'
                      }`}>
                        <input
                          type="radio"
                          name={`question-${idx}`}
                          checked={answers[idx] === false}
                          onChange={() => handleAnswerChange(idx, false)}
                          className="w-5 h-5 text-primary-600"
                        />
                        <span className="font-semibold">False</span>
                      </label>
                    </div>
                  )}

                  {question.type === 'short_answer' && (
                    <textarea
                      value={(answers[idx] as string) || ''}
                      onChange={(e) => handleAnswerChange(idx, e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all min-h-[120px]"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={Object.keys(answers).length < (activeExam.questions?.length || 0)}
            className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Exam
          </button>
        </div>
      </div>
    );
  }

  // Exam results
  if (results && activeExam) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <div className="glass rounded-2xl p-8 border border-primary-500/20 text-center mb-8">
          <div className={`w-32 h-32 mx-auto mb-4 rounded-full flex items-center justify-center ${
            results.percentage >= 70 ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            <span className={`text-5xl font-bold ${
              results.percentage >= 70 ? 'text-green-400' : 'text-red-400'
            }`}>
              {results.percentage}%
            </span>
          </div>
          
          <h1 className="text-3xl font-bold mb-2">
            {results.improved ? '🎉 New Best Score!' : 'Exam Complete!'}
          </h1>
          
          <p className="text-gray-400 mb-2">
            You scored {results.score} out of {results.total} questions
          </p>
          
          {/* Show attempt info and best score */}
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
            <span>Attempt #{results.attempt_number || 1}</span>
            {results.best_score !== undefined && (
              <>
                <span>•</span>
                <span>Best Score: <span className="text-primary-400 font-semibold">{results.best_score}%</span></span>
              </>
            )}
          </div>
          
          {/* Improvement message */}
          {results.improved && results.attempt_number > 1 && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 text-sm font-medium">
                You improved your score! Keep up the great work!
              </p>
            </div>
          )}
          
          {/* No improvement message */}
          {!results.improved && results.attempt_number > 1 && results.percentage < results.best_score && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-amber-400 text-sm font-medium">
                Keep practicing! Your best score is {results.best_score}%
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card text-center">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Correct</p>
            <p className="text-2xl font-bold text-green-400">{results.score}</p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Incorrect</p>
            <p className="text-2xl font-bold text-red-400">{results.total - results.score}</p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-6 h-6 text-primary-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Score</p>
            <p className="text-2xl font-bold text-primary-400">{results.percentage}%</p>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {results.results?.map((result: any, idx: number) => (
            <div key={idx} className={`glass rounded-xl p-6 border-l-4 ${
              result.correct ? 'border-green-500' : 'border-red-500'
            }`}>
              <div className="flex items-start gap-3">
                {result.correct ? (
                  <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                )}
                <div className="flex-1">
                  <p className="font-medium mb-2">{activeExam.questions?.[idx].question}</p>
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-400">
                      Your answer: <span className={result.correct ? 'text-green-400' : 'text-red-400'}>
                        {String(result.user_answer)}
                      </span>
                    </p>
                    {!result.correct && (
                      <p className="text-gray-400">
                        Correct answer: <span className="text-green-400">
                          {String(result.correct_answer)}
                        </span>
                      </p>
                    )}
                    {result.explanation && (
                      <p className="text-gray-300 mt-2 pt-2 border-t border-dark-700">{result.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={(e) => {
            e.stopPropagation();
            setActiveExam(null);
            setResults(null);
            }}
            className="btn-primary"
          >
            Back to Exams
          </button>
          <button
            onClick={() => handleStartExam(activeExam)}
            className="btn-secondary"
          >
            Retake Exam
          </button>
        </div>
      </div>
    );
  }

  const coursesWithDocs = courses.filter(c => c.document_count > 0);

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="glass rounded-2xl p-8 border border-primary-500/20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Practice Exams 📝</h1>
            <p className="text-gray-400">Generate custom exams from your study materials</p>
          </div>
          <button
            onClick={() => setShowGenerator(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Generate Exam
          </button>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="glass rounded-xl p-12 border border-dark-800 text-center">
          <div className="w-20 h-20 bg-primary-600/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-float">
            <FileText className="w-10 h-10 text-primary-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No Exams Yet</h3>
          <p className="text-gray-400 mb-6">
            Generate your first practice exam to test your knowledge
          </p>
          <button
            onClick={() => setShowGenerator(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Create Your First Exam
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => (
            <div key={exam.id} className="card group hover:border-primary-600/50 transition-all relative overflow-hidden">
              
              <div className="mb-4 pb-4 border-b border-dark-800">
                <div className="flex items-center justify-between">
                  
                      <span className={`font-semibold ${
                        (exam.best_score ?? 0) >= 90 ? 'text-green-400' :
                        (exam.best_score ?? 0) >= 70 ? 'text-blue-400' :
                        (exam.best_score ?? 0) >= 50 ? 'text-amber-400' :
                        (exam.best_score ?? 0) >= 1 ? 'text-red-400' :
                        'text-gray-500'
                      }`}>
                        Best: {exam.best_score ?? '-- '}%
                      </span>
                      
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {(exam.attempt_count ?? 0) > 0 && (
                      <button
                        onClick={(e) => handleResetAttempts(exam.id, e)}
                        className="p-2 hover:bg-amber-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Reset attempts"
                      >
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                    
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(exam.id, e)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Icon */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6 text-primary-400" />
                </div>
              </div>

              {/* Title and Course */}
              <h3 className="font-semibold mb-2 text-lg line-clamp-2">{exam.title}</h3>
              <p className="text-sm text-gray-400 mb-4">{exam.course}</p>

              {/* Question Count */}
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {exam.question_count} questions
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="bg-dark-900 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Attempts</p>
                  <p className="text-lg font-bold text-white">{exam.attempt_count ?? 0}</p>
                </div>
                <div className="bg-dark-900 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Average</p>
                  <p className={`text-lg font-bold ${
                    exam.average_score ? 'text-primary-400' : 'text-gray-600'
                  }`}>
                    {exam.average_score ?? '--'}%
                  </p>
                </div>
              </div>

              {/* Start/Retake Button */}
              <button
                onClick={(e) => handleStartExam(exam, e)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                {exam.completed ? 'Retake Exam' : 'Start Exam'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generator Modal */}
      {showGenerator && (
        <div
          className="fixed z-[9999] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={resetGenerator}
          style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          margin: 0,
        }}
        >
          <div
            className="glass rounded-2xl border border-primary-500/20 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            
          >
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-6">Generate New Exam</h2>

              {/* Progress Steps */}
              <div className="flex items-center justify-between mb-8">
                {[
                  { num: 1, label: 'Course' },
                  { num: 2, label: 'Documents' },
                  { num: 3, label: 'Questions' },
                ].map((step, idx) => (
                  <div key={step.num} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
                        currentStep >= step.num
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 text-gray-500'
                      }`}>
                        {step.num}
                      </div>
                      <span className="text-xs text-gray-400 mt-1">{step.label}</span>
                    </div>
                    {idx < 2 && (
                      <div className={`flex-1 h-1 mx-2 transition-all ${
                        currentStep > step.num
                          ? 'bg-primary-600'
                          : 'bg-dark-800'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Step 1: Course Selection */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Select Course</h3>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Choose a course with documents
                    </label>
                    <select
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    >
                      <option value="">Select a course</option>
                      {coursesWithDocs.map((course) => (
                        <option key={course.code} value={course.code}>
                          {course.code} - {course.name} ({course.document_count} documents)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetGenerator();
                      }}
                      className="btn-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setCurrentStep(2)}
                      disabled={!canProceedToStep(2)}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Select Documents</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Choose one or more documents to include in the exam
                    </p>

                    {loadingDocuments ? (
                      <div className="text-center py-8">
                        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm text-gray-400">
                            {selectedDocuments.length} of {documents.length} selected
                          </span>
                          <button
                            onClick={selectAllDocuments}
                            className="text-sm text-primary-400 hover:text-primary-300 font-medium"
                          >
                            {selectedDocuments.length === documents.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {documents.map((doc) => (
                            <label
                              key={doc.id}
                              className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-all ${
                                selectedDocuments.includes(doc.id)
                                  ? 'bg-primary-500/10 border-2 border-primary-500'
                                  : 'bg-dark-900 border-2 border-transparent hover:border-primary-500/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedDocuments.includes(doc.id)}
                                onChange={() => toggleDocumentSelection(doc.id)}
                                className="w-5 h-5 text-primary-600 rounded"
                              />
                              <FileText className="w-5 h-5 text-gray-500" />
                              <span className="flex-1">{doc.filename}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-between gap-4">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="btn-ghost"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      disabled={!canProceedToStep(3)}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Question Configuration */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Configure Questions</h3>
                    <p className="text-sm text-gray-400 mb-6">
                      Choose question types and quantities
                    </p>

                    <div className="space-y-4">
                      {/* Multiple Choice */}
                      <div className="bg-dark-900 rounded-lg p-4">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input
                            type="checkbox"
                            checked={questionConfig.multiple_choice.enabled}
                            onChange={(e) => updateQuestionType('multiple_choice', 'enabled', e.target.checked)}
                            className="w-5 h-5 text-primary-600 rounded"
                          />
                          <span className="font-medium">Multiple Choice</span>
                        </label>
                        {questionConfig.multiple_choice.enabled && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm text-gray-400">
                                Questions
                              </label>
                              <span className="text-primary-400 font-semibold">
                                {questionConfig.multiple_choice.count}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              value={questionConfig.multiple_choice.count}
                              onChange={(e) => updateQuestionType('multiple_choice', 'count', Number(e.target.value))}
                              className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                            />
                          </div>
                        )}
                      </div>

                      {/* True/False */}
                      <div className="bg-dark-900 rounded-lg p-4">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input
                            type="checkbox"
                            checked={questionConfig.true_false.enabled}
                            onChange={(e) => updateQuestionType('true_false', 'enabled', e.target.checked)}
                            className="w-5 h-5 text-primary-600 rounded"
                          />
                          <span className="font-medium">True/False</span>
                        </label>
                        {questionConfig.true_false.enabled && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm text-gray-400">
                                Questions
                              </label>
                              <span className="text-primary-400 font-semibold">
                                {questionConfig.true_false.count}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              value={questionConfig.true_false.count}
                              onChange={(e) => updateQuestionType('true_false', 'count', Number(e.target.value))}
                              className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                            />
                          </div>
                        )}
                      </div>

                      {/* Short Answer */}
                      <div className="bg-dark-900 rounded-lg p-4">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input
                            type="checkbox"
                            checked={questionConfig.short_answer.enabled}
                            onChange={(e) => updateQuestionType('short_answer', 'enabled', e.target.checked)}
                            className="w-5 h-5 text-primary-600 rounded"
                          />
                          <span className="font-medium">Short Answer</span>
                        </label>
                        {questionConfig.short_answer.enabled && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-sm text-gray-400">
                                Questions
                              </label>
                              <span className="text-primary-400 font-semibold">
                                {questionConfig.short_answer.count}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="20"
                              value={questionConfig.short_answer.count}
                              onChange={(e) => updateQuestionType('short_answer', 'count', Number(e.target.value))}
                              className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 glass rounded-lg p-3 border border-primary-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-400">Total Questions</span>
                        <span className="text-2xl font-bold text-primary-400">{getTotalQuestions()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between gap-4">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="btn-ghost"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating || getTotalQuestions() === 0}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {generating ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Generate Exam
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exams;