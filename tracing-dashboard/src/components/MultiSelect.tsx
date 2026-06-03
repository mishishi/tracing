import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  color: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = '\u9009\u62e9\u9879\u76ee', className = '' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={ref} className={'relative ' + className}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors cursor-pointer min-h-[44px]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            <span className="flex items-center gap-1 flex-wrap">
              {selected.map((v) => {
                const opt = options.find((o) => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: (opt?.color || '#888') + '20', color: opt?.color || '#888' }}>
                    {opt?.label || v}
                  </span>
                );
              })}
            </span>
          )}
        </span>
        <ChevronDown className={'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ' + (open ? 'rotate-180' : '')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg max-h-60 overflow-y-auto py-1 animate-fade-in" role="listbox">
          {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">暂无项目</p>}
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                role="option"
                aria-selected={isSelected}
              >
                <span className="w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors" style={{ borderColor: isSelected ? opt.color : 'var(--border)', backgroundColor: isSelected ? opt.color : 'transparent' }}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                <span className="flex-1 truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
