import { useMemo, memo, useState, useCallback } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  CheckCircle2, AlertCircle, Clock,
} from 'lucide-react';
import type { Span, TraceData } from './TraceViewer';

/* ================================================
   Constants
   ================================================ */

const kindColor: Record<string, string> = {
  flow: 'bg-purple-400',
  agent: 'bg-blue-400',
  llm_call: 'bg-amber-400',
  tool_call: 'bg-emerald-400',
  phase: 'bg-indigo-400',
};

const kindBorder: Record<string, string> = {
  flow: 'border-l-purple-500',
  agent: 'border-l-blue-500',
  llm_call: 'border-l-amber-500',
  tool_call: 'border-l-emerald-500',
  phase: 'border-l-indigo-500',
};

const kindLabel: Record<string, string> = {
  flow: '流程',
  agent: '智能体',
  llm_call: 'LLM',
  tool_call: '工具',
  phase: '阶段',
};

const kindIcons: Record<string, React.ReactNode> = {
  flow: <Layers className="w-3 h-3" />,
  agent: <Activity className="w-3 h-3" />,
  llm_call: <Zap className="w-3 h-3" />,
  tool_call: <Wrench className="w-3 h-3" />,
  phase: <Code2 className="w-3 h-3" />,
};

/* ================================================
   Tree Node
   ================================================ */

interface TreeNode {
  span: Span;
  children: TreeNode[];
  depth: number;
}

function buildTree(spans: Span[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const span of spans) {
    map.set(span.id, { span, children: [], depth: 0 });
  }

  for (const span of spans) {
    const node = map.get(span.id)!;
    if (span.parent_id && map.has(span.parent_id)) {
      map.get(span.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function setDepth(nodes: TreeNode[], d: number) {
    for (const n of nodes) {
      n.depth = d;
      setDepth(n.children, d + 1);
    }
  }
  setDepth(roots, 0);

  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

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
}: {
  node: TreeNode;
  traceStart: number;
  traceDuration: number;
  maxDepth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
        (selectedId === span.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')
      }
      style={{ minHeight: '32px' }}
    >
      {/* Label column */}
      <div className="w-[220px] shrink-0 flex items-center gap-1.5 py-1.5 pl-2 pr-1">
        {/* Tree lines */}
        <div style={{ width: indent + 'px', flexShrink: 0 }} className="relative h-full">
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
        <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 font-medium">
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
            'absolute top-1/2 -translate-y-1/2 h-5 rounded-sm opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-1.5 min-w-[4px] ' +
            (span.status === 'error' ? '!bg-red-400' : (kindColor[span.kind] || 'bg-gray-400'))
          }
          style={{ left: leftPct + '%', width: Math.max(widthPct, 0.4) + '%' }}
        >
          {widthPct > 8 && (
            <span className="text-[9px] text-white font-medium truncate leading-none mix-blend-difference">
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
}

export const WaterfallView = memo(function WaterfallViewInner({ trace, selectedSpanId, onSelectSpan }: WaterfallViewProps) {
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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(20, z - e.deltaY * 0.005)));
  }, []);

  const visibleStart = traceDuration * (pan / 100);
  const visibleDuration = traceDuration / zoom;


  return (
    <div className="overflow-x-auto">
      {/* Time axis */}
      <div className="flex items-stretch border-b border-gray-100 dark:border-gray-800 mb-1">
        <div className="w-[220px] shrink-0 py-1 px-2">
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
      {/* Span rows */}
      <div className="max-h-[500px] overflow-y-auto" onWheel={handleWheel}>
        {flat.map((node) => (
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

