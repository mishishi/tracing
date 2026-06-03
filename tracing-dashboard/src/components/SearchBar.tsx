import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, AlertCircle, Loader2 } from 'lucide-react';

interface SearchResult {
  id: string;
  trace_id: string;
  name: string;
  kind: string;
  status: string;
  project: string;
  error: string;
  start_time: string;
  tags: Record<string, string>;
}

const kindLabel: Record<string, string> = {
  flow: '流程', agent: '智能体', llm_call: 'LLM', tool_call: '工具', phase: '阶段',
};

interface SearchBarProps {
  endpoint: string;
  onSelectTrace: (traceId: string) => void;
}

export function SearchBar({ endpoint, onSelectTrace }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const doSearch = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(endpoint + '/search?q=' + encodeURIComponent(q) + '&limit=20')
      .then((r) => r.json())
      .then((d) => { setResults(d.results || []); setOpen(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint]);

  const handleInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (traceId: string) => {
    setOpen(false);
    setQuery('');
    onSelectTrace(traceId);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="搜索 Span... (Ctrl+K)"
          className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-xs rounded-lg border bg-white/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 placeholder-gray-400 transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-80 sm:w-96 rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xl max-h-80 overflow-y-auto py-1 animate-fade-in">
          <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {results.length} 条结果
          </div>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.trace_id)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-start gap-2.5"
            >
              {r.status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{r.name || r.id.slice(0, 12)}</span>
                  <span className="tag text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-500 shrink-0">{kindLabel[r.kind] || r.kind}</span>
                  {r.project && <span className="tag text-[9px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 shrink-0">{r.project}</span>}
                </div>
                {r.error && <p className="text-[10px] text-red-400 mt-0.5 truncate">{r.error}</p>}
                <p className="text-[9px] text-gray-400 mt-0.5">{r.start_time?.slice(0, 16)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-80 rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xl py-4 text-center animate-fade-in">
          <p className="text-xs text-gray-400">未找到匹配结果</p>
        </div>
      )}
    </div>
  );
}
