import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownProps {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  icon?: React.ReactNode;
  onChange: (value: string) => void;
  className?: string;
}

export function Dropdown({
  value,
  options,
  placeholder = '请选择',
  icon,
  onChange,
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const display = selected ? selected.label : placeholder;

  /* Click outside to close */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  /* Keyboard: Escape to close */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [open]);

  return (
    <div ref={ref} className={'relative ' + className}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border
                   bg-white dark:bg-gray-800
                   border-gray-200 dark:border-gray-700
                   text-gray-900 dark:text-gray-100
                   hover:border-gray-300 dark:hover:border-gray-600
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                   transition-colors cursor-pointer"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
        <span className={'flex-1 text-left truncate ' + (!selected ? 'text-gray-400' : '')}>
          {display}
        </span>
        <ChevronDown
          className={'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ' +
            (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border bg-white dark:bg-gray-800
                     border-gray-200 dark:border-gray-700 shadow-lg
                     max-h-60 overflow-y-auto py-1 animate-fade-in"
          role="listbox"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ' +
                  (isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50')
                }
                role="option"
                aria-selected={isSelected}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {isSelected && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
