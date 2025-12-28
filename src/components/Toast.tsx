import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertCircle,
  };

  const Icon = icons[type];

  if (type === 'success') {
    return (
      <div
        className="fixed top-4 right-4 z-50 flex items-center gap-3 min-w-80 max-w-md px-5 py-4 rounded-xl bg-white border border-gray-200 shadow-xl animate-slide-in"
        style={{
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
          <CheckCircle size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 text-sm font-medium text-gray-900">{message}</div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  const styles = {
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  };

  const iconColors = {
    error: 'text-red-600',
    info: 'text-blue-600',
    warning: 'text-yellow-600',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-start gap-3 min-w-80 max-w-md p-4 rounded-lg border shadow-lg ${styles[type as 'error' | 'info' | 'warning']} animate-slide-in`}
    >
      <Icon size={20} className={`flex-shrink-0 mt-0.5 ${iconColors[type as 'error' | 'info' | 'warning']}`} />
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button
        onClick={onClose}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
      >
        <X size={18} />
      </button>
    </div>
  );
}
