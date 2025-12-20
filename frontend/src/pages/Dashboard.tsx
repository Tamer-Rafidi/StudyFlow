import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  GraduationCap,
  CheckCircle,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getStatistics, getDocuments, getCourses } from '../services/api';
import type { Document } from '../types';

const Dashboard: FC = () => {
  const navigate = useNavigate();
  const { statistics, setStatistics, showNotification } = useStore();
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('Student');

  useEffect(() => {
    loadDashboardData();
    
    // Load username
    const savedUsername = localStorage.getItem('username') || 'Student';
    setUsername(savedUsername);
    
    // Listen for storage changes
    const handleStorageChange = () => {
      const newUsername = localStorage.getItem('username') || 'Student';
      setUsername(newUsername);
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load courses first to get accurate count
      const coursesData = await getCourses();
      
      // Count only courses that have documents
      const coursesWithDocs = coursesData.filter(c => c.document_count > 0).length;
      
      // Load statistics
      const stats = await getStatistics();
      
      // Load recent documents
      const docs = await getDocuments();
      setRecentDocs(docs.slice(0, 5)); // Latest 5
      
      // Override the course count with accurate count (only courses with docs)
      setStatistics({
        ...stats,
        total_courses: coursesWithDocs
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      showNotification('error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const unmastered = statistics
    ? statistics.total_flashcards - statistics.mastered_flashcards
    : 0;

  const progressPercentage = statistics
    ? Math.round(
        (statistics.mastered_flashcards / statistics.total_flashcards) * 100
      ) || 0
    : 0;

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="skeleton h-32 w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-32"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="glass rounded-2xl p-8 border border-primary-500/20">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {getGreeting()}, {username}! 👋
            </h1>
            <p className="text-gray-400 text-lg">
              {unmastered > 0 ? (
                <>
                  You have <span className="text-primary-400 font-semibold">{unmastered} cards</span> to review today
                </>
              ) : (
                "You're all caught up! Great work! 🎉"
              )}
            </p>
          </div>
          <div className="hidden md:block">
            <div className="w-20 h-20 bg-primary-600/20 rounded-full flex items-center justify-center animate-float">
              <GraduationCap className="w-10 h-10 text-primary-400" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => navigate('/practice')}
            className="btn-primary flex items-center gap-2"
          >
            <GraduationCap className="w-4 h-4" />
            Quick Review
          </button>
          <button
            onClick={() => navigate('/exams')}
            className="btn-secondary flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Generate Exam
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="btn-ghost flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Upload PDF
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Courses */}
        <div className="card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Courses</p>
              <p className="text-3xl font-bold">{statistics?.total_courses || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">With documents</p>
        </div>

        {/* Total Flashcards */}
        <div className="card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Flashcards</p>
              <p className="text-3xl font-bold">{statistics?.total_flashcards || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <GraduationCap className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Total study cards</p>
        </div>

        {/* Mastered */}
        <div className="card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Mastered</p>
              <p className="text-3xl font-bold text-green-400">
                {statistics?.mastered_flashcards || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {progressPercentage}% completion
          </p>
        </div>

        {/* To Review */}
        <div className="card group cursor-pointer">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">To Review</p>
              <p className="text-3xl font-bold text-amber-400">{unmastered}</p>
            </div>
            <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Needs practice</p>
        </div>
      </div>

      {/* Progress Bar */}
      {statistics && statistics.total_flashcards > 0 && (
        <div className="glass rounded-xl p-6 border border-dark-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-400" />
              Overall Progress
            </h3>
            <span className="text-2xl font-bold text-primary-400">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary-600 to-purple-600 h-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {statistics.mastered_flashcards} of {statistics.total_flashcards} cards mastered
          </p>
        </div>
      )}

      {/* Recent Activity */}
      <div className="glass rounded-xl p-6 border border-dark-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Documents</h3>
          <button
            onClick={() => navigate('/library')}
            className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {recentDocs.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">No documents yet</p>
            <button
              onClick={() => navigate('/upload')}
              className="btn-primary"
            >
              Upload Your First PDF
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 bg-dark-900 rounded-lg hover:bg-dark-800 transition-colors cursor-pointer"
                onClick={() => navigate('/library')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <p className="font-medium">{doc.filename}</p>
                    <p className="text-sm text-gray-500">
                      {doc.course} • {doc.flashcard_count} cards
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-600" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;