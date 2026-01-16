import { useState, useRef, useEffect } from 'react';
import type { FC } from 'react';
import { MessageCircle, X, Send, Minimize2, Sparkles, AlertCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types';

const ChatWidget: FC = () => {
  const { chatOpen, toggleChat, addChatMessage, chatMessages } = useStore();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current AI model from localStorage
  const aiModel = localStorage.getItem('ai_model') || 'openai';
  const openaiModel = localStorage.getItem('openai_model') || 'gpt-4o-mini';
  const modelDisplay = aiModel === 'openai' ? openaiModel : 'Llama (Local)';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSend = async () => {
    if (!message.trim() || isTyping) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    addChatMessage(userMessage);
    setMessage('');
    setIsTyping(true);

    try {
      console.log('💬 Sending chat message to backend...');
      
      const response = await sendChatMessage({
        message: message,
        conversation_id: null,
        context: null,
      });

      console.log('✅ Got chat response:', response);

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        sources: response.sources,
        suggestions: response.suggestions,
      };

      addChatMessage(botMessage);
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      let userFriendlyError = 'Sorry, I encountered an error. ';
      
      if (errorMsg.includes('fetch') || errorMsg.includes('NetworkError')) {
        userFriendlyError += 'Please make sure the backend server is running on port 8000.';
      } else if (errorMsg.includes('API key')) {
        userFriendlyError += 'Your OpenAI API key may be invalid. Check your settings.';
      } else if (errorMsg.includes('quota') || errorMsg.includes('billing')) {
        userFriendlyError += 'You may have run out of API credits. Check your OpenAI billing.';
      } else {
        userFriendlyError += errorMsg;
      }
      
      setError(userFriendlyError);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: userFriendlyError,
        timestamp: new Date(),
      };
      addChatMessage(errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setMessage(suggestion);
  };

  if (!chatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="
          fixed bottom-6 right-6 z-50
          w-14 h-14 bg-primary-600 rounded-full
          flex items-center justify-center
          shadow-glow-lg hover:scale-110
          transition-transform duration-200
          animate-pulse
        "
        title="Chat with Study Buddy"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] glass rounded-2xl border border-dark-700 flex flex-col animate-slide-in-right shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700 bg-dark-800/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-purple-600 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-900"></div>
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              Study Buddy
            </h3>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-gray-400">{modelDisplay}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleChat}
            className="p-1.5 hover:bg-dark-700 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={toggleChat}
            className="p-1.5 hover:bg-dark-700 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h4 className="font-semibold mb-2">Hi! I'm your Study Buddy 🎓</h4>
            <p className="text-sm text-gray-400 mb-4 px-4">
              I've analyzed all your study materials and I'm ready to help you learn!
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleSuggestionClick('What study materials do I have?')}
                className="w-full text-left px-4 py-3 text-sm bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <span>📚</span>
                <span>What study materials do I have?</span>
              </button>
              <button
                onClick={() => handleSuggestionClick('Quiz me on my recent documents')}
                className="w-full text-left px-4 py-3 text-sm bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <span>🎯</span>
                <span>Quiz me on my recent documents</span>
              </button>
              <button
                onClick={() => handleSuggestionClick('Create a study plan for my courses')}
                className="w-full text-left px-4 py-3 text-sm bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <span>📅</span>
                <span>Create a study plan for my courses</span>
              </button>
              <button
                onClick={() => handleSuggestionClick('What topics should I focus on?')}
                className="w-full text-left px-4 py-3 text-sm bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <span>💡</span>
                <span>What topics should I focus on?</span>
              </button>
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[85%] rounded-lg p-3
                ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-100'
                }
              `}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-700">
                  <p className="text-xs text-gray-400 mb-2 font-semibold">📚 Sources:</p>
                  <div className="space-y-1">
                    {msg.sources.map((source, idx) => (
                      <div key={idx} className="text-xs text-gray-400 bg-dark-900/50 px-2 py-1 rounded">
                        📄 {source.name} <span className="text-primary-400">({source.course})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-dark-800 rounded-lg p-3 flex items-center gap-2">
              <div className="typing-indicator flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </div>
              <span className="text-xs text-gray-400">Study Buddy is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-dark-700 bg-dark-800/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about your studies..."
            className="flex-1 input text-sm"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || isTyping}
            className="
              btn-primary px-4
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            "
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;