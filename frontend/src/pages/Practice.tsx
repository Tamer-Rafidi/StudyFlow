import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  GraduationCap,
  ChevronRight,
  RotateCw,
  CheckCircle,
  XCircle,
  BookOpen,
  Filter,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getFlashcards, markFlashcardMastered, getCourses } from '../services/api';
import type { Flashcard, Course } from '../types';

const Practice: FC = () => {
  const { showNotification } = useStore();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState({
    correct: 0,
    incorrect: 0,
    total: 0,
  });

  // Filters
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [showMastered, setShowMastered] = useState(false);
  const [difficulty, setDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');

  useEffect(() => {
    loadData();
  }, [selectedCourse, showMastered, difficulty]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load courses
      const coursesData = await getCourses();
      setCourses(coursesData);

      // Load flashcards with filters
      let cards = await getFlashcards(
        undefined,
        selectedCourse === 'all' ? undefined : selectedCourse,
        showMastered ? undefined : false
      );

      // Filter by difficulty
      if (difficulty !== 'all') {
        cards = cards.filter(card => card.difficulty === difficulty);
      }

      // Check if no cards found
      if (cards.length === 0) {
        // Show notification based on filters
        if (selectedCourse !== 'all') {
          showNotification('info', `No flashcards found for ${selectedCourse}`);
        } else if (difficulty !== 'all') {
          showNotification('info', `No ${difficulty} flashcards available`);
        } else if (!showMastered) {
          showNotification('info', 'No unmastered flashcards to review. Great job!');
        } else {
          showNotification('info', 'No flashcards available. Upload some documents to get started.');
        }
        setFlashcards([]);
        setLoading(false);
        return;
      }

      // Shuffle cards
      cards = cards.sort(() => Math.random() - 0.5);

      setFlashcards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (error) {
      console.error('Failed to load flashcards:', error);
      showNotification('error', 'Failed to load flashcards');
    } finally {
      setLoading(false);
    }
  };

  const currentCard = flashcards[currentIndex];

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleCorrect = async () => {
    if (!currentCard) return;

    try {
      await markFlashcardMastered(currentCard.id, true);
      setSessionStats(prev => ({
        ...prev,
        correct: prev.correct + 1,
        total: prev.total + 1,
      }));
      nextCard();
    } catch (error) {
      console.error('Failed to mark as mastered:', error);
      showNotification('error', 'Failed to update card');
    }
  };

  const handleIncorrect = () => {
    setSessionStats(prev => ({
      ...prev,
      incorrect: prev.incorrect + 1,
      total: prev.total + 1,
    }));
    nextCard();
  };

  const nextCard = () => {
    setIsFlipped(false);
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      showNotification('success', 'Session complete! Great work!');
      setCurrentIndex(0);
    }
  };

  const resetSession = () => {
    setSessionStats({ correct: 0, incorrect: 0, total: 0 });
    setCurrentIndex(0);
    setIsFlipped(false);
    loadData();
  };

  const accuracy = sessionStats.total > 0
    ? Math.round((sessionStats.correct / sessionStats.total) * 100)
    : 0;

  // Filter courses with documents
  const coursesWithDocs = courses.filter(c => c.document_count > 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  // Check for no flashcards AFTER loading is complete
  if (!loading && flashcards.length === 0) {
    return (
      <div className="p-8 animate-fade-in">
        <h1 className="text-3xl font-bold mb-2">Practice Flashcards</h1>
        <p className="text-gray-400 mb-8">Study with interactive flashcards</p>

        {/* Filters still visible */}
        <div className="glass rounded-xl p-4 border border-dark-800 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold">Filters</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Course</label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Courses</option>
                {coursesWithDocs.map((course) => (
                  <option key={course.code} value={course.code}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="input w-full"
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Show Mastered</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMastered}
                  onChange={(e) => setShowMastered(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-dark-800 text-primary-600 focus:ring-primary-600"
                />
                <span className="text-sm">Include mastered cards</span>
              </label>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="card text-center py-20">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Flashcards Available</h3>
          <p className="text-gray-400 mb-6">
            {selectedCourse !== 'all' 
              ? `No flashcards found for ${selectedCourse} with current filters.`
              : 'No flashcards match your current filters.'
            }
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setSelectedCourse('all');
                setDifficulty('all');
                setShowMastered(true);
              }}
              className="btn-secondary"
            >
              Reset Filters
            </button>
            <button
              onClick={() => window.location.href = '/upload'}
              className="btn-primary"
            >
              Upload Documents
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Practice Flashcards</h1>
          <p className="text-gray-400">
            Card {currentIndex + 1} of {flashcards.length}
          </p>
        </div>
        <button
          onClick={resetSession}
          className="btn-ghost flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4" />
          Reset Session
        </button>
      </div>

      {/* Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass rounded-xl p-4 border border-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Studied</span>
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold mt-2">{sessionStats.total}</p>
        </div>

        <div className="glass rounded-xl p-4 border border-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Correct</span>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-green-400">{sessionStats.correct}</p>
        </div>

        <div className="glass rounded-xl p-4 border border-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Incorrect</span>
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-red-400">{sessionStats.incorrect}</p>
        </div>

        <div className="glass rounded-xl p-4 border border-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Accuracy</span>
            <GraduationCap className="w-5 h-5 text-primary-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-primary-400">{accuracy}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 border border-dark-800 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Course</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Courses</option>
              {coursesWithDocs.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.code} - {course.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="input w-full"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Show Mastered</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showMastered}
                onChange={(e) => setShowMastered(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-dark-800 text-primary-600 focus:ring-primary-600"
              />
              <span className="text-sm">Include mastered cards</span>
            </label>
          </div>
        </div>
      </div>

      {/* Flashcard */}
      <div className="mb-8">
        <div
          className="relative h-96 cursor-pointer"
          onClick={handleFlip}
          style={{ 
            transformStyle: 'preserve-3d',
            perspective: '1000px'
          }}
        >
          {/* Front */}
          <div
            className={`
              absolute inset-0 glass rounded-2xl border border-dark-700
              flex flex-col items-center justify-center p-8
              transition-all duration-500
              ${isFlipped ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
            style={{ 
              backfaceVisibility: 'hidden',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            }}
          >
            <div className="text-center w-full">
              <div className="inline-block px-4 py-1 bg-primary-600/20 rounded-full text-primary-400 text-sm mb-6">
                Question
              </div>
              <p className="text-2xl font-semibold mb-4 text-white">{currentCard.question}</p>
              <p className="text-gray-400 text-sm">Click to reveal answer</p>
            </div>

            {/* Difficulty Badge */}
            <div className={`
              absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium
              ${currentCard.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' : ''}
              ${currentCard.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : ''}
              ${currentCard.difficulty === 'hard' ? 'bg-red-500/20 text-red-400' : ''}
            `}>
              {currentCard.difficulty}
            </div>
          </div>

          {/* Back */}
          <div
            className={`
              absolute inset-0 rounded-2xl border
              flex flex-col items-center justify-center p-8
              transition-all duration-500
              ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}
              bg-gradient-to-br from-green-600/10 to-emerald-600/10 border-green-600/30
            `}
            style={{ 
              backfaceVisibility: 'hidden',
              transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)'
            }}
          >
            <div className="text-center w-full">
              <div className="inline-block px-4 py-1 bg-green-600/30 rounded-full text-green-400 text-sm mb-6">
                Answer
              </div>
              <p className="text-xl mb-4 text-white font-medium">{currentCard.answer}</p>
            </div>

            {currentCard.mastered && (
              <div className="absolute top-4 right-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary-600 to-purple-600 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {isFlipped && (
        <div className="flex gap-4 justify-center animate-slide-in-up">
          <button
            onClick={handleIncorrect}
            className="btn-secondary flex items-center gap-2 px-8"
          >
            <XCircle className="w-5 h-5" />
            Need More Practice
          </button>
          <button
            onClick={handleCorrect}
            className="btn-primary flex items-center gap-2 px-8"
          >
            <CheckCircle className="w-5 h-5" />
            Got It!
          </button>
        </div>
      )}

      {!isFlipped && (
        <div className="flex justify-center">
          <button
            onClick={handleFlip}
            className="btn-ghost flex items-center gap-2"
          >
            Reveal Answer
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Practice;