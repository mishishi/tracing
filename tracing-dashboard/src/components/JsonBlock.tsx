import { useState, useCallback, useMemo } from 'react';
import { useToast } from './ToastProvider';
import { ChevronDown, ChevronUp, Copy, Search, Code2, Braces, FileText } from 'lucide-react';
import { renderMarkdown } from '../utils/markdown';

interface JsonBlockProps {
  label: string;
  content: string;
  maxHeight?: number;
  defaultExpanded?: boolean;
  searchable?: boolean;
  defaultViewMode?: 'raw' | 'json' | 'md';
}

function tryParseJson(text: string): { ok: boolean; value: any } {
  try {
    const v = JSON.parse(text);
    return { ok: true, value: v };
  } catch {
    return { ok: false, value: null };
  }
}

function JsonNode({ value, depth = 0 }: { value: any; depth?: number }) {
  if (value === null || value === undefined) return <span className="text-gray-400 italic">null</span>;
  if (typeof value === 'boolean') return <span className="text-amber-500">{value ? 'true' : 'false'}</span>;
  if (typeof value === 'number') return <span className="text-emerald-500">{value}</span>;
  if (typeof value === 'string') {
    const display = value.length > 200 ? JSON.stringify(value.slice(0, 200)) + '...' : JSON.stringify(value);
    return <span className="text-indigo-400">{display}</span>;
  }
  if (Array.isArray(value)) return <JsonArray value={value} depth={depth} />;
  if (typeof value === 'object') return <JsonObject value={value} depth={depth} />;
  return <span>{String(value)}</span>;
}

function JsonArray({ value, depth }: { value: any[]; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const pad = '\u00A0\u00A0'.repeat(depth);
  if (collapsed) {
    return (
      <span className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => setCollapsed(false)}>
        [{value.length} items]...
      </span>
    );
  }
  return (
    <span>
      {'[\n'}
      {value.map((item, idx) => (
        <span key={idx}>
          {pad}  <JsonNode value={item} depth={depth + 1} />
          {idx < value.length - 1 ? ',' : ''}{'\n'}
        </span>
      ))}
      {pad}{']'}
    </span>
  );
}

function JsonObject({ value, depth }: { value: Record<string, any>; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const keys = Object.keys(value);
  const pad = '\u00A0\u00A0'.repeat(depth);
  if (collapsed) {
    return (
      <span className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => setCollapsed(false)}>
        {'{'}{keys.length} keys{'}'}...
      </span>
    );
  }
  return (
    <span>
      {'{\n'}
      {keys.map((key, idx) => (
        <span key={key}>
          {pad}  <span className="text-violet-400">"{key}"</span>: <JsonNode value={value[key]} depth={depth + 1} />
          {idx < keys.length - 1 ? ',' : ''}{'\n'}
        </span>
      ))}
      {pad}{'}'}
    </span>
  );
}

export function JsonBlock({ label, content, maxHeight = 160, defaultExpanded = false, searchable = false, defaultViewMode = 'raw' }: JsonBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'raw' | 'json' | 'md'>(defaultViewMode);
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
  const lineCount = content.split('\n').length;

  const parsed = useMemo(() => tryParseJson(content), [content]);
  const isJson = parsed.ok;
  const looksLikeMd = !isJson && (/^#{1,4}\s/m.test(content) || /\*\*/.test(content) || /^[-*]\s/m.test(content) || /^\|.*\|/m.test(content));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-400">
          {label && <span>{label}</span>}
          <span className="text-[10px] text-gray-400 ml-1">
            ({lineCount} 行, {(content.length / 1024).toFixed(1)} KB)
          </span>
        </span>
        <div className="flex items-center gap-1">
          {searchable && (
            <div className="relative">
              <Search className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..."
                className="w-24 text-[11px] pl-5 pr-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
          )}
          {isJson && (
            <button
              onClick={() => setViewMode(viewMode === 'raw' ? 'json' : 'raw')}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label={viewMode === 'raw' ? 'JSON 结构化' : '原始文本'}
              title={viewMode === 'raw' ? 'JSON 结构化视图' : '原始文本'}
            >
              {viewMode === 'raw' ? <Braces className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
            </button>
          )}
          {looksLikeMd && (
            <button
              onClick={() => setViewMode(viewMode === 'raw' ? 'md' : 'raw')}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label={viewMode === 'raw' ? 'Markdown 渲染' : '原始文本'}
              title={viewMode === 'raw' ? 'Markdown 渲染' : '原始文本'}
            >
              {viewMode === 'raw' ? <FileText className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
            </button>
          )}
          <button onClick={copy} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors" aria-label="复制">
            <Copy className="w-3 h-3" />
          </button>
          {needsExpand && (
            <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors" aria-label={expanded ? '收起' : '展开'}>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
      {viewMode === 'md' ? (
        <div className="text-[11px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 overflow-auto transition-all markdown-body"
          style={{ maxHeight: expanded ? 'none' : maxHeight }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      ) : isJson && viewMode === 'json' ? (
        <pre className="text-[11px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 overflow-auto font-mono text-gray-300 transition-all"
          style={{ maxHeight: expanded ? 'none' : maxHeight }}>
          <JsonNode value={parsed.value} />
        </pre>
      ) : (
        <pre className="text-[11px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 overflow-auto whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 transition-all"
          style={{ maxHeight: expanded ? 'none' : maxHeight }}
          onClick={needsExpand && !expanded ? () => setExpanded(true) : undefined}>
          {displayContent || '(空)'}
        </pre>
      )}
      {needsExpand && !expanded && (
        <button onClick={() => setExpanded(true)} className="w-full text-[11px] text-gray-400 hover:text-indigo-500 py-1 transition-colors">
          点击展开完整内容 ({lineCount} 行)...
        </button>
      )}
    </div>
  );
}
