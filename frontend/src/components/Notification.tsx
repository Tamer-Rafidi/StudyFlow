import { useEffect } from 'react';
import type { FC } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useStore } from '../store/useStore';

const Notification: FC = () => {
  const { notification, clearNotification } = useStore();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        clearNotification();
      }, 5000); 

      return () => clearTimeout(timer);
    }
  }, [notification, clearNotification]);

  if (!notification) return null;

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
  };

  const colors = {
    success: 'bg-green-500/10 border-green-500/50 text-green-400',
    error: 'bg-red-500/10 border-red-500/50 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
  };

  const Icon = icons[notification.type];

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in-right">
      <div
        className={`
          ${colors[notification.type]}
          border rounded-lg p-4 pr-12
          glass backdrop-blur-lg
          shadow-lg
          max-w-md
        `}
      >
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{notification.message}</p>
        </div>

        <button
          onClick={clearNotification}
          className="
            absolute top-3 right-3
            text-gray-400 hover:text-white
            transition-colors
          "
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Notification;