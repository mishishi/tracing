import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  CheckCircle2, AlertCircle, Clock,
  BarChart3, Search, Server, Filter, X, Inbox,
  Minimize2, Maximize2, RefreshCw, Copy, Download, Share2,
  List, GanttChartSquare, Bell, FileDown,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
import { WaterfallView } from './WaterfallView';
import { SpanDetailPanel } from './SpanDetailPanel';
import { TimelineView } from './TimelineView';
import { SkeletonTraceList } from './Skeleton';
import { useTraces } from '../hooks/useTraces';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { exportToCSV } from '../utils/exportCsv';
import {
  kindLabel, kindIcons, kindColor, StatCard,
  fmtMs, fmtTokens, fmtTime, statusIcon, matchModelPrice,
  PAGE_SIZE, type TraceSummary, type TraceData,
} from '../utils/trace-utils';

interface TraceViewerProps { endpoint: string; initialTraceId?: string; }

export function TraceViewer({ endpoint, initialTraceId }: TraceViewerProps) {
  const {
    traces, filteredTraces, stats, projects, loadingList,
    newTraceCount, sseConnected,
    searchQuery, setSearchQuery,
    projectFilter, setProjectFilter,
    page, setPage, totalPages,
    dismissNotification,
  } = useTraces({ endpoint });

  const [selected, setSelected] = useState<TraceData | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'waterfall' | 'timeline'>('waterfall');
  const [timeRange, setTimeRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(true);
  const [shareUrl, setShareUrl] = useState('');

  const toggle = (id: string) => setExpanded((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => {
    if (!selected) return;
    if (allExpanded) { setExpanded(new Set()); setAllExpanded(false); }
    else { setExpanded(new Set<string>(selected.spans.map((s) => s.id))); setAllExpanded(true); }
  };

  const loadTrace = (id: string) => {
    setLoading(true);
    setSelectedSpanId(null);
    fetch(endpoint + '/traces/' + id)
      .then((r) => r.json())
      .then((d) => {
        setSelected(d);
        if (d.spans) {
          setExpanded(new Set<string>(d.spans.map((s: { id: string }) => s.id)));
          setAllExpanded(true);
        }
      })
      .catch((err) => console.warn('Load trace failed:', err))
      .finally(() => setLoading(false));
  };

  const closeDetail = () => { setSelected(null); setSelectedSpanId(null); };
  const copyTraceId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareTrace = async () => {
    if (!selected) return;
    try {
      const res = await fetch(endpoint + '/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trace_id: selected.trace_id, project: selected.spans[0]?.project || 'default', view_state: {}, expires_in_hours: 24 }),
      });
      const data = await res.json();
      if (data.share_id) {
        const url = window.location.origin + '/s/' + data.share_id;
        setShareUrl(url);
        navigator.clipboard.writeText(url).catch(() => {});
      }
    } catch (err) { console.warn('Share failed:', err); }
  };

  const exportTrace = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'trace-' + selected.trace_id + '.json';
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!selected) return;
    exportToCSV(selected);
  };

  useKeyboardNav({ selected, filteredTraces, setSelected, setSelectedSpanId, loadTrace });

  // Deep link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('trace_id');
    if (tid && traces.length > 0) {
      const found = traces.find((t) => t.trace_id === tid);
      if (found) loadTrace(tid);
    }
  }, [traces]);

  // Initial trace
  useEffect(() => {
    if (initialTraceId) loadTrace(initialTraceId);
  }, [initialTraceId]);

  // Computed
  const traceTokens = useMemo(() => {
    if (!selected) return { input: 0, output: 0, total: 0 };
    return selected.spans.filter((s) => s.kind === 'llm_call').reduce(
      (acc, s) => ({
        input: acc.input + (s.metadata.input_tokens || 0),
        output: acc.output + (s.metadata.output_tokens || 0),
        total: acc.total + (s.metadata.total_tokens || 0),
      }),
      { input: 0, output: 0, total: 0 }
    );
  }, [selected]);

  const traceCost = useMemo(() => {
    if (!selected) return null;
    let cost = 0;
    selected.spans.filter((s) => s.kind === 'llm_call').forEach((s) => {
      const price = matchModelPrice(s.metadata.model);
      if (price) {
        cost += (s.metadata.input_tokens || 0) / 1000 * price.input;
        cost += (s.metadata.output_tokens || 0) / 1000 * price.output;
      }
    });
    return cost > 0 ? cost : null;
  }, [selected]);

  const maxDuration = selected ? Math.max(...selected.spans.map((s) => s.duration_ms), 1) : 1;
  const projOpts = [
    { value: '', label: '全部项目' },
    ...projects.map((p) => ({ value: p, label: p })),
  ];

  const paginatedTraces = filteredTraces.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Render ──
  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: 'calc(100vh - 190px)' }}>
      {/* ── Left panel ── */}
      <div className={`w-full lg:w-80 shrink-0 flex-col gap-3 min-h-0 ${showList ? 'flex' : 'hidden lg:flex'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              追踪列表 {filteredTraces.length > 0 && `(${filteredTraces.length})`}
            </h2>
            <button
              onClick={() => setShowList(!showList)}
              className="lg:hidden p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              aria-label={showList ? '隐藏列表' : '显示列表'}
            >
              {showList ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {sseConnected && <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="SSE 已连接" />}
            {newTraceCount > 0 && (
              <button onClick={dismissNotification} className="relative p-1 text-amber-500 hover:text-amber-600 transition-colors" aria-label="新追踪通知">
                <Bell className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                  {newTraceCount > 9 ? '9+' : newTraceCount}
                </span>
              </button>
            )}
            <button onClick={() => { setSearchQuery(''); setProjectFilter(''); }} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" aria-label="刷新">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索 Trace ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-gray-400"
            />
          </div>
          <Dropdown
            options={projOpts}
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="项目"
            className="w-32"
          />
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-1.5">
            <StatCard icon={<Server className="w-4 h-4" />} label="Spans" value={String(stats.total_spans)} />
            <StatCard icon={<Zap className="w-4 h-4" />} label="Tokens" value={fmtTokens(stats.total_tokens)} valueClass="text-indigo-600 dark:text-indigo-400" />
            <StatCard icon={<Activity className="w-4 h-4" />} label="LLM" value={String(stats.by_kind.find(k => k.kind === 'llm_call')?.c || 0)} valueClass="text-amber-600 dark:text-amber-400" />
            <StatCard icon={<Wrench className="w-4 h-4" />} label="工具" value={String(stats.by_kind.find(k => k.kind === 'tool_call')?.c || 0)} valueClass="text-emerald-600 dark:text-emerald-400" />
          </div>
        )}

        {/* Trace list */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 min-h-0">
          {loadingList ? (
            <SkeletonTraceList />
          ) : paginatedTraces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">暂无追踪记录</p>
            </div>
          ) : (
            paginatedTraces.map((t) => (
              <button
                key={t.trace_id}
                onClick={() => loadTrace(t.trace_id)}
                className={
                  'w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ' +
                  (selected?.trace_id === t.trace_id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500' : '')
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate max-w-[160px]">
                    {t.session_id || t.trace_id.slice(0, 12)}
                  </span>
                  <span className="text-[10px] text-gray-400">{fmtTime(t.start_time)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-gray-400">{t.span_count} spans</span>
                  {t.project && t.project !== 'default' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      {t.project}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{fmtMs(t.total_duration_ms)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-400">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="disabled:opacity-30 hover:text-gray-600">上一页</button>
            <span>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="disabled:opacity-30 hover:text-gray-600">下一页</button>
          </div>
        )}
      </div>

      {/* ── Right panel: detail ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {!loading && !selected && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">选择一个追踪记录</p>
            <p className="text-xs text-gray-400 mt-1">点击左侧列表或使用 ↑↓ 键切换追踪项</p>
          </div>
        )}
        {!loading && selected && (
          <>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">追踪详情</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-xs text-gray-400">{selected.span_count} 个 Span</p>
                  {traceTokens.total > 0 && (
                    <span className="text-[10px] text-indigo-500 font-mono">
                      {fmtTokens(traceTokens.total)} tokens · 入{fmtTokens(traceTokens.input)} / 出{fmtTokens(traceTokens.output)}
                    </span>
                  )}
                  {traceCost !== null && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">~${traceCost.toFixed(4)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* View mode toggle */}
                <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  {(['timeline', 'waterfall', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={
                        'p-1 rounded-md transition-colors ' +
                        (viewMode === mode
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')
                      }
                      aria-label={mode === 'timeline' ? '时间线' : mode === 'waterfall' ? '瀑布图' : '列表'}
                    >
                      {mode === 'timeline' ? <Clock className="w-3.5 h-3.5" /> :
                       mode === 'waterfall' ? <GanttChartSquare className="w-3.5 h-3.5" /> :
                       <List className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
                <button onClick={toggleAll} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label={allExpanded ? '折叠全部' : '展开全部'}>
                  {allExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={shareTrace} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="分享">
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={exportTrace} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="导出 JSON">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={exportCSV} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="导出 CSV">
                  <FileDown className="w-4 h-4" />
                </button>
                <button onClick={() => copyTraceId(selected.trace_id)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="复制 Trace ID">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={closeDetail} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="关闭">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {viewMode === 'timeline' && selected && (
              <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 p-4">
                <TimelineView spans={selected.spans} />
              </div>
            )}
            {viewMode === 'waterfall' && (
              <>
                <WaterfallView trace={selected} selectedSpanId={selectedSpanId} onSelectSpan={setSelectedSpanId} />
                {selectedSpanId && (() => {
                  const span = selected.spans.find((s) => s.id === selectedSpanId);
                  if (!span) return null;
                  return (
                    <div className="mt-4">
                      <SpanDetailPanel
                        span={span}
                        onClose={() => setSelectedSpanId(null)}
                      />
                    </div>
                  );
                })()}
              </>
            )}
            {viewMode === 'list' && (
              <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {selected.spans.map((s) => (
                  <div key={s.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <button
                      onClick={() => toggle(s.id)}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="shrink-0">{kindIcons[s.kind] || <Code2 className="w-3.5 h-3.5" />}</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{s.name || kindLabel[s.kind]}</span>
                      <span className="text-[10px] text-gray-400">{fmtMs(s.duration_ms)}</span>
                      {statusIcon(s.status)}
                      <span className={kindColor[s.kind] + ' w-1.5 h-1.5 rounded-full'} />
                    </button>
                    {expanded.has(s.id) && (
                      <div className="px-3 pb-3">
                        <SpanDetailPanel span={s} onClose={() => toggle(s.id)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
