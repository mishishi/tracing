import { useMemo, memo, useState, useCallback, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { kindLabel, kindIcons, kindColor, type Span, type TraceData, buildTree, flattenTree, type TreeNode } from '../utils/trace-utils';

const kindBorder: Record<string, string> = {
  flow: 'border-l-purple-500',
  agent: 'border-l-blue-500',
  llm_call: 'border-l-amber-500',
  tool_call: 'border-l-emerald-500',
  phase: 'border-l-indigo-500',
};


/* ================================================
   Helpers
   ================================================ */

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return m + 'm ' + s + 's';
}

function statusIcon(status: string) {
  switch (status) {
    case 'ok': return <CheckCircle2 className="w-3 h-3 text-green-500" />;
    case 'error': return <AlertCircle className="w-3 h-3 text-red-500" />;
    case 'running': return <Clock className="w-3 h-3 text-gray-400 animate-pulse" />;
    default: return null;
  }
}

function timeOffset(span: Span, traceStart: number): number {
  return new Date(span.start_time).getTime() - traceStart;
}

/* ================================================
   Waterfall Row
   ================================================ */

function WaterfallRow({
  node,
  traceStart,
  traceDuration,
  maxDepth,
  selectedId,
  onSelect,
  isMatch = false,
}: {
  node: TreeNode;
  traceStart: number;
  traceDuration: number;
  maxDepth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isMatch?: boolean;
}) {
  const { span, depth } = node;
  const offset = timeOffset(span, traceStart);
  const leftPct = traceDuration > 0 ? (offset / traceDuration) * 100 : 0;
  const widthPct = traceDuration > 0 ? Math.max((span.duration_ms / traceDuration) * 100, 0.5) : 0;
  const indent = depth * 20;

  return (
    <button
      onClick={() => onSelect(span.id)}
      className={
        'w-full text-left flex items-center gap-0 transition-colors group ' +
        (selectedId === span.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : isMatch ? 'bg-amber-50/80 dark:bg-amber-900/30 ring-1 ring-amber-300/50 dark:ring-amber-500/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')
      }
      style={{ minHeight: '28px' }}
    >
      {/* Label column */}
      <div className="w-[100px] sm:w-[160px] lg:w-[220px] shrink-0 flex items-center gap-1 py-1.5 pl-1 sm:pl-2 pr-0.5 sm:pr-1">
        {/* Tree lines */}
        <div style={{ width: Math.min(indent, 40) + 'px', flexShrink: 0 }} className="relative h-full">
          {depth > 0 && (
            <div
              className="absolute bottom-1/2 left-2 w-px bg-gray-200 dark:bg-gray-700"
              style={{ top: 0, height: '50%' }}
            />
          )}
          {depth > 0 && (
            <div
              className="absolute top-1/2 left-2 h-px bg-gray-200 dark:bg-gray-700"
              style={{ width: '12px' }}
            />
          )}
          {node.children.length > 0 && (
            <div
              className="absolute left-2 w-px bg-gray-200 dark:bg-gray-700"
              style={{ top: '50%', bottom: 0 }}
            />
          )}
        </div>
        <span className="text-gray-400 shrink-0">{kindIcons[span.kind] || kindIcons.phase}</span>
        <span className="text-[10px] sm:text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 font-medium">
          {span.name || kindLabel[span.kind] || span.kind}
        </span>
      </div>

      {/* Bar area */}
      <div className="flex-1 relative py-1.5 pr-3">
        {/* Grid lines */}
        {[25, 50, 75].map((pct) => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
            style={{ left: pct + '%' }}
          />
        ))}

        {/* Bar */}
        <div
          className={
            'absolute top-1/2 -translate-y-1/2 h-4 sm:h-5 rounded-sm opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-1 min-w-[4px] ' +
            (span.status === 'error' ? '!bg-red-400' : (kindColor[span.kind] || 'bg-gray-400'))
          }
          style={{ left: leftPct + '%', width: Math.max(widthPct, 0.4) + '%' }}
        >
          {widthPct > 8 && (
            <span className="text-[8px] sm:text-[9px] text-white font-medium truncate leading-none mix-blend-difference">
              {fmtMs(span.duration_ms)}
            </span>
          )}
        </div>

        {/* Status indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {span.status === 'error' && (
            <span className="text-[9px] text-red-500 font-medium truncate max-w-[120px]">{span.error}</span>
          )}
          {statusIcon(span.status)}
        </div>
      </div>
    </button>
  );
}

/* ================================================
   Waterfall View Component
   ================================================ */

interface WaterfallViewProps {
  trace: TraceData;
  selectedSpanId: string | null;
  onSelectSpan: (id: string) => void;
  highlightQuery?: string;
  hideTools?: boolean;
}

export const WaterfallView = memo(function WaterfallViewInner({ trace, selectedSpanId, onSelectSpan, highlightQuery = '', hideTools = false }: WaterfallViewProps) {
  const tree = useMemo(() => buildTree(trace.spans), [trace.spans]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const maxDepth = useMemo(() => Math.max(...flat.map((n) => n.depth), 0), [flat]);

  const traceStart = useMemo(() => {
    if (trace.spans.length === 0) return Date.now();
    return Math.min(...trace.spans.map((s) => new Date(s.start_time).getTime()));
  }, [trace.spans]);

  const traceEnd = useMemo(() => {
    if (trace.spans.length === 0) return Date.now() + 1;
    return Math.max(...trace.spans.map((s) => new Date(s.end_time || s.start_time).getTime()));
  }, [trace.spans]);

  const traceDuration = traceEnd - traceStart;  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);

  /* Span-level filters */
  const [spanSearch, setSpanSearch] = useState('');
  const [spanKindFilter, setSpanKindFilter] = useState('all');
  const [spanStatusFilter, setSpanStatusFilter] = useState('all');
  const [spanTagFilter, setSpanTagFilter] = useState('');

  const filteredFlat = useMemo(() => {
    let r = flat;
    if (spanSearch.trim()) {
      const q = spanSearch.toLowerCase();
      r = r.filter((n) =>
        n.span.name.toLowerCase().includes(q) ||
        (n.span.metadata.model && n.span.metadata.model.toLowerCase().includes(q)) ||
        (n.span.metadata.agent && n.span.metadata.agent.toLowerCase().includes(q))
      );
    }
    if (spanKindFilter !== 'all') r = r.filter((n) => n.span.kind === spanKindFilter);
    if (hideTools) r = r.filter((n) => n.span.kind !== 'tool_call');
    if (spanStatusFilter !== 'all') r = r.filter((n) => n.span.status === spanStatusFilter);
    if (spanTagFilter.trim()) {
      const parts = spanTagFilter.split(':').map((s) => s.trim());
      const tagKey = parts[0].toLowerCase();
      const tagVal = parts[1]?.toLowerCase() || '';
      r = r.filter((n) => {
        const tags = n.span.metadata?.tags || {};
        if (tagVal) return String(tags[tagKey] || '').toLowerCase().includes(tagVal);
        return tagKey in tags || Object.keys(tags).some((k) => k.toLowerCase().includes(tagKey));
      });
    }
    return r;
  }, [flat, spanSearch, spanKindFilter, spanStatusFilter, spanTagFilter]);

  const waterfallRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = waterfallRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(20, z - e.deltaY * 0.005)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const visibleStart = traceDuration * (pan / 100);
  const visibleDuration = traceDuration / zoom;


  return (
    <div className="overflow-x-auto">
      {/* Time axis */}
      <div className="flex items-stretch border-b border-gray-100 dark:border-gray-800 mb-1">
        <div className="w-[100px] sm:w-[160px] lg:w-[220px] shrink-0 py-1 px-1 sm:px-2">
          <span className="text-[10px] text-gray-400 uppercase font-semibold">Span</span>
        </div>
        <div className="flex-1 relative py-1 pr-3">
          {[0, 25, 50, 75, 100].map((pct) => (
            <div key={pct} className="absolute top-0" style={{ left: pct + '%' }}>
              <span className="text-[9px] text-gray-400 font-mono -translate-x-1/2 block">
                {fmtMs(visibleStart + visibleDuration * pct / 100)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Zoom hint */}
        <span className="text-[9px] text-gray-300 dark:text-gray-600 mr-2 select-none">滚轮缩放</span>

        {/* Zoom controls */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 dark:border-gray-800">
        <span className="text-[9px] text-gray-400 mr-1">{zoom.toFixed(1)}x</span>
        <button onClick={() => setZoom((z) => Math.max(1, z - 1))}
          className="px-1.5 py-0.5 text-[9px] rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">-</button>
        <button onClick={() => setZoom((z) => Math.min(20, z + 1))}
          className="px-1.5 py-0.5 text-[9px] rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">+</button>
        <button onClick={() => { setZoom(1); setPan(0); }}
          className="px-1.5 py-0.5 text-[9px] rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 ml-1">reset</button>
      </div>
      {/* Span filters */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            placeholder="搜索 Span..."
            value={spanSearch}
            onChange={(e) => setSpanSearch(e.target.value)}
            className="w-full pl-6 pr-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder-gray-400"
          />
          {spanSearch && (
            <button onClick={() => setSpanSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
        <Dropdown
          value={spanKindFilter}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'flow', label: '流程' },
            { value: 'agent', label: '智能体' },
            { value: 'llm_call', label: 'LLM' },
            { value: 'tool_call', label: '工具' },
            { value: 'phase', label: '阶段' },
          ]}
          onChange={setSpanKindFilter}
          className="w-28"
        />
        <Dropdown
          value={spanStatusFilter}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'ok', label: '成功' },
            { value: 'error', label: '失败' },
            { value: 'running', label: '运行中' },
          ]}
          onChange={setSpanStatusFilter}
          className="w-28"
        />
        <div className="relative flex-1 min-w-[120px] max-w-[160px]">
          <input
            type="text"
            placeholder="标签 (key:value)"
            value={spanTagFilter}
            onChange={(e) => setSpanTagFilter(e.target.value)}
            className="w-full px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder-gray-400"
          />
          {spanTagFilter && (
            <button onClick={() => setSpanTagFilter('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600" aria-label="清除标签筛选">
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
        {(filteredFlat.length !== flat.length || hideTools) && (
          <span className="text-[10px] text-gray-400">{filteredFlat.length}/{flat.length}</span>
        )}
      </div>

      {/* Span rows */}
      <div ref={waterfallRef} className="max-h-[500px] overflow-y-auto">
        {filteredFlat.map((node) => (
          <WaterfallRow
            key={node.span.id}
            node={node}
            traceStart={traceStart + visibleStart}
            traceDuration={visibleDuration}
            maxDepth={maxDepth}
            selectedId={selectedSpanId}
            onSelect={onSelectSpan}
          />
        ))}
      </div>
    </div>
  );
});

