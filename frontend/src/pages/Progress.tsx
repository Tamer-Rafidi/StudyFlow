import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle,
  FileText,
  Brain,
  GraduationCap,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getStatistics, getCourses, getFlashcards } from '../services/api';
import type { Course } from '../types';

interface CourseWithStats extends Course {
  masteredCount: number;
  masteryPercentage: number;
}

const Progress: FC = () => {
  const { statistics, setStatistics, showNotification } = useStore();
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [difficultyBreakdown, setDifficultyBreakdown] = useState({
    easy: 0,
    medium: 0,
    hard: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load statistics first
      const stats = await getStatistics();
      setStatistics(stats);
      
      // Load courses data
      const coursesData = await getCourses();
      
      // Fetch real mastery data for each course
      const coursesWithStats = await Promise.all(
        coursesData.map(async (course) => {
          try {
            // Get all flashcards for this course
            const flashcards = await getFlashcards(undefined, course.code);
            const masteredCount = flashcards.filter(f => f.mastered).length;
            const masteryPercentage = flashcards.length > 0
              ? Math.round((masteredCount / flashcards.length) * 100)
              : 0;
            
            return {
              ...course,
              masteredCount,
              masteryPercentage,
            };
          } catch (error) {
            console.error(`Failed to load stats for ${course.code}:`, error);
            return {
              ...course,
              masteredCount: 0,
              masteryPercentage: 0,
            };
          }
        })
      );
      
      setCourses(coursesWithStats);
      
      // Calculate difficulty breakdown from all flashcards
      try {
        const allFlashcards = await getFlashcards();
        const breakdown = {
          easy: allFlashcards.filter(f => f.difficulty === 'easy').length,
          medium: allFlashcards.filter(f => f.difficulty === 'medium').length,
          hard: allFlashcards.filter(f => f.difficulty === 'hard').length,
        };
        setDifficultyBreakdown(breakdown);
      } catch (error) {
        console.error('Failed to load difficulty breakdown:', error);
      }
      
    } catch (error) {
      console.error('Failed to load progress:', error);
      showNotification('error', 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const overallProgress = statistics && statistics.total_flashcards > 0
    ? Math.round((statistics.mastered_flashcards / statistics.total_flashcards) * 100)
    : 0;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'from-green-500 to-emerald-500';
    if (percentage >= 60) return 'from-blue-500 to-cyan-500';
    if (percentage >= 40) return 'from-yellow-500 to-amber-500';
    return 'from-red-500 to-orange-500';
  };

  const getDifficultyStats = () => {
    const total = (difficultyBreakdown.easy + difficultyBreakdown.medium + difficultyBreakdown.hard) || 1;
    return {
      easy: Math.round((difficultyBreakdown.easy / total) * 100) || 0,
      medium: Math.round((difficultyBreakdown.medium / total) * 100) || 0,
      hard: Math.round((difficultyBreakdown.hard / total) * 100) || 0,
    };
  };

  const difficultyStats = getDifficultyStats();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading progress...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-primary-400" />
          Progress Overview
        </h1>
        <p className="text-gray-400">Track your learning across all courses</p>
      </div>

      {/* Overall Statistics */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-400" />
          Overall Statistics
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Courses */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Courses</p>
                <p className="text-3xl font-bold">{statistics?.total_courses || 0}</p>
              </div>
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">Active courses with content</p>
          </div>

          {/* Total Documents */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-400 text-sm mb-1">Documents</p>
                <p className="text-3xl font-bold">{statistics?.total_documents || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">Uploaded and processed</p>
          </div>

          {/* Total Flashcards */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Flashcards</p>
                <p className="text-3xl font-bold">{statistics?.total_flashcards || 0}</p>
              </div>
              <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <Brain className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">Generated from documents</p>
          </div>

          {/* Mastered Flashcards */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-400 text-sm mb-1">Mastered</p>
                <p className="text-3xl font-bold text-green-400">
                  {statistics?.mastered_flashcards || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {overallProgress}% of total flashcards
            </p>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Overall Mastery Progress</h3>
            <span className="text-2xl font-bold text-primary-400">{overallProgress}%</span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-4 overflow-hidden">
            <div
              className={`bg-gradient-to-r ${getProgressColor(overallProgress)} h-full transition-all duration-500 rounded-full`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
            <div>
              <p className="text-gray-500">Mastered</p>
              <p className="font-semibold text-green-400">{statistics?.mastered_flashcards || 0}</p>
            </div>
            <div>
              <p className="text-gray-500">In Progress</p>
              <p className="font-semibold text-yellow-400">
                {(statistics?.total_flashcards || 0) - (statistics?.mastered_flashcards || 0)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Total</p>
              <p className="font-semibold">{statistics?.total_flashcards || 0}</p>
            </div>
          </div>
        </div>

        {/* Difficulty Breakdown */}
        <div className="card mt-6">
          <h3 className="text-lg font-semibold mb-4">Flashcard Difficulty Distribution</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="text-3xl font-bold text-green-400 mb-1">
                {difficultyBreakdown.easy}
              </div>
              <p className="text-sm text-gray-400 mb-2">Easy</p>
              <p className="text-xs text-gray-500">{difficultyStats.easy}% of total</p>
            </div>
            <div className="text-center p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <div className="text-3xl font-bold text-yellow-400 mb-1">
                {difficultyBreakdown.medium}
              </div>
              <p className="text-sm text-gray-400 mb-2">Medium</p>
              <p className="text-xs text-gray-500">{difficultyStats.medium}% of total</p>
            </div>
            <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="text-3xl font-bold text-red-400 mb-1">
                {difficultyBreakdown.hard}
              </div>
              <p className="text-sm text-gray-400 mb-2">Hard</p>
              <p className="text-xs text-gray-500">{difficultyStats.hard}% of total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Course-Specific Statistics */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-400" />
          Course Statistics
        </h2>

        {courses.length === 0 ? (
          <div className="card text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Courses Yet</h3>
            <p className="text-gray-400">
              Upload your first document to get started tracking your progress
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {courses.map((course) => {
              const courseProgress = course.masteryPercentage;
              const masteredCount = course.masteredCount;

              return (
                <div key={course.code} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold mb-1">{course.code}</h3>
                      <p className="text-sm text-gray-400">{course.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary-400 mb-1">
                        {courseProgress}%
                      </div>
                      <p className="text-xs text-gray-500">Mastery</p>
                    </div>
                  </div>

                  {/* Course Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-dark-800 rounded-full h-3 overflow-hidden">
                      <div
                        className={`bg-gradient-to-r ${getProgressColor(courseProgress)} h-full transition-all duration-500 rounded-full`}
                        style={{ width: `${courseProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Course Stats Grid */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-3 bg-dark-800 rounded-lg">
                      <div className="flex items-center justify-center mb-1">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <p className="text-xl font-bold mb-1">{course.document_count}</p>
                      <p className="text-gray-500 text-xs">Documents</p>
                    </div>
                    <div className="text-center p-3 bg-dark-800 rounded-lg">
                      <div className="flex items-center justify-center mb-1">
                        <Brain className="w-4 h-4 text-cyan-400" />
                      </div>
                      <p className="text-xl font-bold mb-1">{course.flashcard_count}</p>
                      <p className="text-gray-500 text-xs">Flashcards</p>
                    </div>
                    <div className="text-center p-3 bg-dark-800 rounded-lg">
                      <div className="flex items-center justify-center mb-1">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      </div>
                      <p className="text-xl font-bold text-green-400 mb-1">
                        {masteredCount}
                      </p>
                      <p className="text-gray-500 text-xs">Mastered</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Progress;