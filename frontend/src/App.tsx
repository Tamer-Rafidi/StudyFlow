import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { getCourses, getStatistics } from './services/api';

// Layout components
import Sidebar from './components/Sidebar';
import ChatWidget from './components/ChatWidget';
import Notification from './components/Notification';

// Pages
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Library from './pages/Library';
import Practice from './pages/Practice';
import Exams from './pages/Exams';
import Progress from './pages/Progress';
import Settings from './pages/Settings';

function App() {
  const { darkMode, setCourses, setStatistics, showNotification } = useStore();

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load courses
      const courses = await getCourses();
      setCourses(courses);

      // Load statistics
      const stats = await getStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      showNotification('error', 'Failed to load data from server');
    }
  };

  return (
    <Router>
      <div className={`${darkMode ? 'dark' : ''} min-h-screen bg-dark-950`}>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar Navigation */}
          <Sidebar />

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/library" element={<Library />} />
              <Route path="/practice" element={<Practice />} />
              <Route path="/exams" element={<Exams />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>

          {/* Chat Widget (floating) */}
          <ChatWidget />

          {/* Notification Toast */}
          <Notification />
        </div>
      </div>
    </Router>
  );
}

export default App;