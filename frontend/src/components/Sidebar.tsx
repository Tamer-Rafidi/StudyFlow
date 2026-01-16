import type { FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Home,
  Upload,
  Library,
  GraduationCap,
  FileText,
  BarChart3,
  Settings,
} from 'lucide-react';

const Sidebar: FC = () => {
  const location = useLocation();
  const [username, setUsername] = useState('Student');

  useEffect(() => {
    // Load username from localStorage
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

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/upload', icon: Upload, label: 'Upload' },
    { path: '/library', icon: Library, label: 'Library' },
    { path: '/practice', icon: GraduationCap, label: 'Practice' },
    { path: '/exams', icon: FileText, label: 'Exams' },
    { path: '/progress', icon: BarChart3, label: 'Progress' },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Get first letter of username for avatar
  const avatarLetter = username.charAt(0).toUpperCase();

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-800 flex flex-col h-full z-[1]">
      {/* Logo */}
      <div className="p-6 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">StudyFlow</h1>
            <p className="text-xs text-gray-500">AI Study Assistant</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg
                transition-all duration-200
                ${
                  active
                    ? 'bg-primary-600 text-white shadow-glow'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
              {active && (
                <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-dark-800 space-y-2">
        {/* Settings */}
        <Link
          to="/settings"
          className={`
            flex items-center gap-3 px-4 py-3 rounded-lg
            transition-all duration-200
            ${
              isActive('/settings')
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }
          `}
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </Link>

        {/* User Info */}
        <div className="pt-2 mt-2 border-t border-dark-800">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-white">{avatarLetter}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {username}
              </p>
              <p className="text-xs text-gray-500 truncate">Local User</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;