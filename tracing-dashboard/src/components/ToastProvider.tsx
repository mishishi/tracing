import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

/* ================================================
   Types
   ================================================ */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
  exiting: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ================================================
   Config
   ================================================ */

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 3000;

const iconMap: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <AlertCircle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
};

const colorMap: Record<ToastType, string> = {
  success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  info: 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

/* ================================================
   Provider
   ================================================ */

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const timer = timersRef.current.get(id);
      if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    }, 300);
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = DEFAULT_DURATION) => {
    const id = nextId++;
    setToasts((prev) => {
      const next = [...prev, { id, message, type, duration, exiting: false }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    const timer = setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  const contextValue: ToastContextValue = {
    toast: addToast,
    success: useCallback((msg: string, dur?: number) => addToast(msg, 'success', dur), [addToast]),
    error: useCallback((msg: string, dur?: number) => addToast(msg, 'error', dur), [addToast]),
    info: useCallback((msg: string, dur?: number) => addToast(msg, 'info', dur), [addToast]),
    warning: useCallback((msg: string, dur?: number) => addToast(msg, 'warning', dur), [addToast]),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Toast Container */}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="通知"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg text-xs font-medium max-w-sm ' +
              colorMap[t.type] +
              (t.exiting ? ' animate-slide-out-right opacity-0' : ' animate-slide-in-up')
            }
            role="alert"
          >
            <span className="shrink-0">{iconMap[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="关闭通知"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ================================================
   Hook
   ================================================ */

const noopToastBase = (_message: string, _type?: ToastType, _duration?: number) => {};
const noopToastShort = (message: string, duration?: number) => {};

const noopContext: ToastContextValue = {
  toast: noopToastBase,
  success: noopToastShort,
  error: noopToastShort,
  info: noopToastShort,
  warning: noopToastShort,
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return noopContext;
  return ctx;
}
