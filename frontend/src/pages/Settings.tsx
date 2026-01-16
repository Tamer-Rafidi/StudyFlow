import { useState, useEffect } from 'react';
import type { FC } from 'react';
import packageJson from '../../../package.json';
import {
  User,
  Database,
  Trash2,
  Save,
  Cpu,
  Zap,
  ChevronDown,
  Key,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useStore } from '../store/useStore';

const Settings: FC = () => {
  const { showNotification, aiModel, setAiModel } = useStore();
  
  // User settings
  const [username, setUsername] = useState('');
  const [selectedOpenAIModel, setSelectedOpenAIModel] = useState('gpt-4o-mini');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  
  const [isClearing, setIsClearing] = useState(false);

  // Available OpenAI models
  const openAIModels = [
    { value: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Best overall — High accuracy for summaries, flashcards, and quizzes.' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano', description: 'Lowest cost — Great for quick tasks and simple responses.' },
    { value: 'gpt-4o-mini', label: 'GPT-4 Optimized Mini', description: 'Fast and cost-effective' },
  ];

  // Load settings on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('username') || 'Student';
    const savedOpenAIModel = localStorage.getItem('openai_model') || 'gpt-4o-mini';
    const savedApiKey = localStorage.getItem('openai_api_key') || '';
    
    setUsername(savedUsername);
    setSelectedOpenAIModel(savedOpenAIModel);
    setOpenaiApiKey(savedApiKey);
    
    // Check if API key is valid on load
    if (savedApiKey) {
      testApiKey(savedApiKey);
    }
  }, []);

  const testApiKey = async (apiKey: string) => {
    if (!apiKey || apiKey.length < 20) {
      setApiKeyValid(false);
      return;
    }

    setIsTestingApiKey(true);
    try {
      const response = await fetch('http://localhost:8000/api/test-openai-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      const result = await response.json();
      setApiKeyValid(result.valid);
      
      if (result.valid) {
        showNotification('success', 'OpenAI API key is valid!');
      } else {
        showNotification('error', 'Invalid OpenAI API key');
      }
    } catch (error) {
      console.error('Error testing API key:', error);
      setApiKeyValid(null);
      showNotification('error', 'Could not verify API key');
    } finally {
      setIsTestingApiKey(false);
    }
  };

  const handleSave = () => {
    // Save username
    localStorage.setItem('username', username);
    
    // Save OpenAI model selection
    localStorage.setItem('openai_model', selectedOpenAIModel);
    
    // Save OpenAI API key
    localStorage.setItem('openai_api_key', openaiApiKey);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('storage'));
    
    showNotification('success', 'Settings saved successfully!');
  };

  const handleClearData = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL your data including:\n• Courses, documents, flashcards, exams, and summaries\n• Your OpenAI API key and settings\n\nThis cannot be undone!\n\nAre you absolutely sure?')) {
      return;
    }
    
    if (!confirm('This is your final warning. Everything will be permanently deleted. Continue?')) {
      return;
    }
    
    setIsClearing(true);
    
    try {
      // Call backend API to clear all data first
      const response = await fetch('http://localhost:8000/api/clear-all-data', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear backend data');
      }
      
      // Clear ALL localStorage (including API key and settings)
      localStorage.clear();
      
      // Reset component state
      setOpenaiApiKey('');
      setApiKeyValid(null);
      setAiModel('openai'); // Reset to default
      
      showNotification('success', 'All data has been cleared! Redirecting to dashboard...');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
      
    } catch (error) {
      console.error('Clear data failed:', error);
      showNotification('error', 'Failed to clear all data. Please try again or contact support.');
      setIsClearing(false);
    }
  };

  const handleModelChange = (model: 'openai' | 'llama') => {
    setAiModel(model);
    showNotification('info', `Switched to ${model === 'openai' ? 'OpenAI' : 'Llama'} model`);
  };

  const handleOpenAIModelChange = (modelValue: string) => {
    setSelectedOpenAIModel(modelValue);
    const modelLabel = openAIModels.find(m => m.value === modelValue)?.label || modelValue;
    showNotification('info', `Selected ${modelLabel}`);
  };

  const handleApiKeyChange = (value: string) => {
    setOpenaiApiKey(value);
    setApiKeyValid(null); // Reset validation status when key changes
  };

  const handleTestApiKey = () => {
    testApiKey(openaiApiKey);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-400">Manage your preferences and account</p>
      </div>

      <div className="space-y-6">
        {/* AI Model Selection */}
        <div className="card border-2 border-primary-600/30">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-dark-700">
            <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-primary-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">AI Model Selection</h2>
              <p className="text-sm text-gray-400">Choose which AI model to use for processing</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenAI Option */}
            <div
              onClick={() => handleModelChange('openai')}
              className={`
                relative p-6 rounded-xl border-2 cursor-pointer transition-all
                ${aiModel === 'openai' 
                  ? 'border-primary-600 bg-primary-600/10' 
                  : 'border-dark-700 hover:border-dark-600'
                }
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-green-400" />
                </div>
                {aiModel === 'openai' && (
                  <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold mb-2">OpenAI</h3>
              <p className="text-sm text-gray-400 mb-3">
                GPT-4 powered AI for high-quality responses and better understanding
              </p>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Superior comprehension</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Better context awareness</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>More accurate summaries</span>
                </div>
              </div>
            </div>

            {/* Llama Option */}
            <div
              onClick={() => handleModelChange('llama')}
              className={`
                relative p-6 rounded-xl border-2 cursor-pointer transition-all
                ${aiModel === 'llama' 
                  ? 'border-primary-600 bg-primary-600/10' 
                  : 'border-dark-700 hover:border-dark-600'
                }
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-purple-400" />
                </div>
                {aiModel === 'llama' && (
                  <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold mb-2">Llama</h3>
              <p className="text-sm text-gray-400 mb-3">
                Open-source model for privacy-focused and cost-effective processing
              </p>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span>
                  <span>Privacy-focused</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span>
                  <span>Cost-effective</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span>
                  <span>Fast processing</span>
                </div>
              </div>
            </div>
          </div>

          {/* OpenAI Configuration - Only shown when OpenAI is selected */}
          {aiModel === 'openai' && (
            <div className="mt-6 space-y-4">
              {/* API Key Input */}
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  OpenAI API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={openaiApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 pr-24 text-white placeholder-gray-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-colors font-mono text-sm"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {apiKeyValid !== null && (
                      <div className="flex items-center">
                        {apiKeyValid ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1 hover:bg-dark-700 rounded transition-colors"
                    >
                      {showApiKey ? (
                        <EyeOff className="w-5 h-5 text-gray-400" />
                      ) : (
                        <Eye className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-start justify-between mt-3">
                  <p className="text-xs text-gray-500">
                    Get your API key from{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-400 hover:text-primary-300 underline"
                    >
                      platform.openai.com
                    </a>
                  </p>
                  <button
                    onClick={handleTestApiKey}
                    disabled={isTestingApiKey || !openaiApiKey}
                    className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-gray-500 rounded transition-colors"
                  >
                    {isTestingApiKey ? 'Testing...' : 'Test Key'}
                  </button>
                </div>
              </div>

              {/* Model Selection Dropdown */}
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  OpenAI Model
                </label>
                <div className="relative">
                  <select
                    value={selectedOpenAIModel}
                    onChange={(e) => handleOpenAIModelChange(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 pr-10 text-white appearance-none cursor-pointer hover:border-primary-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-colors"
                  >
                    {openAIModels.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} - {model.description}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Selected model: <span className="text-green-400 font-medium">{selectedOpenAIModel}</span>
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400 flex items-start gap-2">
              <span className="text-lg">ℹ️</span>
              <span>
                {aiModel === 'openai' 
                  ? 'Your API key is stored locally in your browser and sent securely to OpenAI for each request. It is never stored on our servers.'
                  : 'Llama runs locally on your machine and does not require an API key or internet connection.'
                }
              </span>
            </p>
          </div>
        </div>

        {/* Profile Settings */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-dark-700">
            <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-primary-400" />
            </div>
            <h2 className="text-xl font-semibold">Profile</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-2">
                This name will appear in your dashboard greetings
              </p>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {username.charAt(0).toUpperCase() || 'S'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium">Profile Avatar</p>
                <p className="text-xs text-gray-500">Based on your display name</p>
              </div>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-dark-700">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold">Data Management</h2>
          </div>

          <div className="space-y-3">
            <div className="">
              <button
                onClick={handleClearData}
                disabled={isClearing}
                className="w-full btn-ghost justify-start text-left text-red-400 hover:bg-red-500/10 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClearing ? (
                  <>
                    <div className="w-4 h-4 mr-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    <div>
                      <p className="font-medium">Clearing Data...</p>
                      <p className="text-xs text-gray-500">Please wait</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1" />
                    <div>
                      <p className="font-medium">Clear All Data</p>
                      <p className="text-xs text-gray-500">Delete ALL courses, documents, flashcards, and exams</p>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400 flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <span>
                <strong>Warning:</strong> "Clear All Data" will permanently delete everything from both your browser and the server database. 
                This includes all courses, documents, flashcards, summaries, and exams. Your API key will be preserved.
              </span>
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
          <button
            onClick={() => window.location.reload()}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>

        {/* App Info */}
        <div className="text-center pt-6 border-t border-dark-700">
          <p className="text-sm text-gray-500">StudyFlow AI Study Assistant</p>
          <p className="text-xs text-gray-600 mt-1">Version {packageJson.version}</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;