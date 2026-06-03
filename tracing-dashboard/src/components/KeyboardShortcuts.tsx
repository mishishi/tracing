import { useEffect, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';

interface Shortcut {
  keys: string[];
  label: string;
}

const shortcuts: Shortcut[] = [
  { keys: ['?'], label: '显示/隐藏快捷键面板' },
  { keys: ['1'], label: '切换到追踪标签' },
  { keys: ['2'], label: '切换到成本标签' },
  { keys: ['3'], label: '切换到错误标签' },
  { keys: ['4'], label: '切换到对比标签' },
  { keys: ['R'], label: '刷新当前数据' },
  { keys: ['D'], label: '切换紧凑/舒适密度' },
  { keys: ['Esc'], label: '关闭面板/弹窗' },
  { keys: ['Ctrl', 'K'], label: '聚焦搜索框' },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 p-6 rounded-2xl shadow-2xl animate-slide-up"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">键盘快捷键</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="关闭快捷键面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="space-y-1.5">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-xs text-gray-600 dark:text-gray-400">{shortcut.label}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <span className="text-[10px] text-gray-300">+</span>}
                    <kbd className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="mt-4 text-[10px] text-gray-400 text-center">
          按 <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">?</kbd> 随时打开此面板
        </p>
      </div>
    </div>
  );
}

export { shortcuts };
