import { useState, useCallback } from 'react';
import { useToast } from './ToastProvider';
import { ChevronDown, ChevronUp, Copy, Search } from 'lucide-react';

interface JsonBlockProps {
  label: string;
  content: string;
  maxHeight?: number;
  defaultExpanded?: boolean;
  searchable?: boolean;
}

export function JsonBlock({ label, content, maxHeight = 160, defaultExpanded = false, searchable = false }: JsonBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState('');
  const { success } = useToast();

  const copy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      success('已复制到剪贴板', 2000);
    }).catch(() => {});
  }, [content, success]);

  const displayContent = search
    ? content.split('\n').filter((l) => l.toLowerCase().includes(search.toLowerCase())).join('\n')
    : content;

  const needsExpand = content.length > 300;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          {searchable && (
            <div className="relative">
              <Search className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..."
                className="w-24 text-[10px] pl-5 pr-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
          )}
          <button
            onClick={copy}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            aria-label="复制"
          >
            <Copy className="w-3 h-3" />
          </button>
          {needsExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label={expanded ? '收起' : '展开'}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
      <pre
        className="text-[10px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 overflow-auto whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 transition-all"
        style={{ maxHeight: expanded ? 'none' : maxHeight }}
        onClick={needsExpand && !expanded ? () => setExpanded(true) : undefined}
      >
        {displayContent || '(空)'}
      </pre>
      {needsExpand && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-[10px] text-gray-400 hover:text-indigo-500 py-1 transition-colors"
        >
          点击展开完整内容...
        </button>
      )}
    </div>
  );
}
