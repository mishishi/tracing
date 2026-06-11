import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity, ChevronRight,
  AlertCircle, Clock,
  BarChart3, Search, Server, Filter, X, Inbox,
  Minimize2, Maximize2, RefreshCw, Copy, Download, Share2,
  List, GanttChartSquare, Bell, FileDown, GitCompare,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
import { TraceListPanel } from './TraceListPanel';
import { WaterfallView } from './WaterfallView';
import { SpanDetailPanel } from './SpanDetailPanel';
import { TimelineView } from './TimelineView';
import { TraceCompareView } from './TraceCompareView';
import { SkeletonTraceList } from './Skeleton';
import { useToast } from './ToastProvider';
import { useTraces } from '../hooks/useTraces';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { exportToCSV } from '../utils/exportCsv';
import {
  kindLabel, kindIcons, kindColor, StatCard,
  fmtMs, fmtTokens, fmtTime, statusIcon, matchModelPrice,
  PAGE_SIZE, type TraceSummary, type TraceData,
} from '../utils/trace-utils';

interface TraceViewerProps { endpoint: string; initialTraceId?: string; highlightQuery?: string; }

export function TraceViewer({ endpoint, initialTraceId, highlightQuery = '' }: TraceViewerProps) {
  const { success: toastSuccess, info: toastInfo } = useToast();
  const {
    traces, filteredTraces, stats, projects, loadingList,
    newTraceCount, sseConnected,
    searchQuery, setSearchQuery,
    projectFilter, setProjectFilter,
    statusFilter, setStatusFilter,
    kindFilter, setKindFilter,
    timeRange, setTimeRange,
    page, setPage, totalPages,
    dismissNotification,
    fetchError,
  } = useTraces({ endpoint });

  const [selected, setSelected] = useState<TraceData | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);
  const [collapseTools, setCollapseTools] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'waterfall' | 'timeline'>('waterfall');
  const [showList, setShowList] = useState(true);
  const [viewGroupBy, setViewGroupBy] = useState<'trace' | 'session' | 'summary'>('trace');
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareTraceA, setCompareTraceA] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<any>(null);
  const [compareLoading, setCompareLoading] = useState(false);

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

  const closeDetail = () => { setSelected(null); setSelectedSpanId(null); setCompareMode(false); };

  const startCompare = () => {
    if (!selected) return;
    setCompareMode(true);
    setCompareTraceA(selected.trace_id);
    setCompareData(null);
  };

  const cancelCompare = () => {
    setCompareMode(false);
    setCompareTraceA(null);
    setCompareData(null);
  };

  const spanMatchesQuery = (span: { name?: string; kind?: string; metadata?: Record<string, unknown>; error?: string }) => {
    if (!highlightQuery) return false;
    const q = highlightQuery.toLowerCase();
    return (span.name || '').toLowerCase().includes(q) ||
           (span.kind || '').toLowerCase().includes(q) ||
           (span.error || '').toLowerCase().includes(q) ||
           JSON.stringify(span.metadata || {}).toLowerCase().includes(q);
  };

  const selectCompareB = (id: string) => {
    if (!compareTraceA || id === compareTraceA) return;
    setCompareLoading(true);
    fetch(endpoint + '/traces/compare?trace_a=' + compareTraceA + '&trace_b=' + id)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { console.warn('Compare failed:', d.error); cancelCompare(); }
        else setCompareData(d);
      })
      .catch((err) => { console.warn('Compare failed:', err); cancelCompare(); })
      .finally(() => setCompareLoading(false));
  };
  const copyTraceId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      toastSuccess('已复制 Trace ID', 2000);
    }).catch(() => {});
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
        navigator.clipboard.writeText(url).then(() => {
          toastSuccess('分享链接已复制到剪贴板', 3000);
        }).catch(() => {});
      }
    } catch (err) { console.warn('Share failed:', err); toastInfo('分享失败，请重试'); }
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

  // Fetch sessions
  useEffect(() => {
    if (viewGroupBy !== 'session') return;
    setSessionsLoading(true);
    fetch(endpoint + '/sessions?project=' + (projectFilter || '') + '&limit=50')
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [viewGroupBy, endpoint, projectFilter, loadingList]);

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
        cost += (s.metadata.input_tokens || 0) / 1_000_000 * price.input;
        cost += (s.metadata.output_tokens || 0) / 1_000_000 * price.output;
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
        {fetchError && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <span className="text-xs text-amber-700 dark:text-amber-400">{fetchError}</span>
            <button onClick={() => {/* will clear on next success */}} className="text-xs text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 underline">关闭</button>
          </div>
        )}
        <TraceListPanel
          filteredTraces={filteredTraces}
          projects={projects}
          projectFilter={projectFilter}
          setProjectFilter={setProjectFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          kindFilter={kindFilter}
          setKindFilter={setKindFilter}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          loadingList={loadingList}
          newTraceCount={newTraceCount}
          sseConnected={sseConnected}
          dismissNotification={dismissNotification}
          viewGroupBy={viewGroupBy}
          setViewGroupBy={setViewGroupBy}
          showList={showList}
          setShowList={setShowList}
          stats={stats}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          selected={selected}
          paginatedTraces={paginatedTraces}
          loadTrace={loadTrace}
          compareMode={compareMode}
          compareTraceA={compareTraceA}
          selectCompareB={selectCompareB}
          cancelCompare={cancelCompare}
        />

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
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1 mb-1">
                  <button onClick={() => closeDetail()} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">追踪列表</button>
                  <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                  {(() => {
                    const traceInfo = filteredTraces.find(t => t.trace_id === selected.trace_id);
                    const proj = traceInfo?.project;
                    return proj && proj !== 'default' ? (
                      <>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{proj}</span>
                        <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                      </>
                    ) : null;
                  })()}
                  <span className="text-[10px] font-mono text-indigo-500 truncate max-w-[160px]">{selected.trace_id.slice(0, 16)}...</span>
                </nav>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">追踪详情</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-xs text-gray-400">{selected.span_count} 个 Span</p>
                  {traceTokens.total > 0 && (
                    <span className="text-[10px] text-indigo-500 font-mono">
                      {fmtTokens(traceTokens.total)} tokens · 入{fmtTokens(traceTokens.input)} / 出{fmtTokens(traceTokens.output)}
                    </span>
                  )}
                  {traceCost !== null && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">~¥{traceCost.toFixed(4)}</span>
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
                {!compareMode && selected && (
                  <button onClick={startCompare} className="p-1.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors" aria-label="对比">
                    <GitCompare className="w-4 h-4" />
                  </button>
                )}

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
                  <Copy className="w-4 h-4" />
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
                <WaterfallView trace={selected} selectedSpanId={selectedSpanId} onSelectSpan={setSelectedSpanId} highlightQuery={highlightQuery} hideTools={collapseTools} />
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

            {compareData && (
              <div className="mt-4">
                <TraceCompareView data={compareData} onClose={() => setCompareData(null)} />
              </div>
            )}

            {compareLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-2 text-xs text-gray-400">正在对比...</span>
              </div>
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
