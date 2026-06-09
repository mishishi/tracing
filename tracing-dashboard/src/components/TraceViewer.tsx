import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  AlertCircle, Clock,
  BarChart3, Search, Server, Filter, X, Inbox,
  Minimize2, Maximize2, RefreshCw, Copy, Download, Share2,
  List, GanttChartSquare, Bell, FileDown, GitCompare,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
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
  } = useTraces({ endpoint });

  const [selected, setSelected] = useState<TraceData | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);
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
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {viewGroupBy === 'trace' ? `追踪列表 ${filteredTraces.length > 0 ? `(${filteredTraces.length})` : ''}` : viewGroupBy === 'summary' ? '项目汇总' : `会话 ${sessions.length > 0 ? `(${sessions.length})` : ''}`}
              </h2>
              <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg ml-1">
                <button onClick={() => setViewGroupBy('trace')}
                  className={'px-1.5 py-0.5 text-[9px] rounded ' + (viewGroupBy === 'trace' ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400')}>
                  追踪
                </button>
                <button onClick={() => setViewGroupBy('session')}
                  className={'px-1.5 py-0.5 text-[9px] rounded ' + (viewGroupBy === 'session' ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400')}>
                  会话
                </button>
              </div>
            </div>
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

        
            {compareMode && compareTraceA && (
              <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>选择第二个 Trace 进行对比 · A: <code className="font-mono bg-indigo-100 dark:bg-indigo-800 px-1 rounded text-[11px]">{compareTraceA.slice(0, 12)}...</code></span>
                </div>
                <button onClick={cancelCompare} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 font-medium">取消</button>
              </div>
            )}
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

        {/* Filter bar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {['', 'ok', 'error'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={'px-2 py-0.5 text-[9px] font-medium rounded transition-all ' +
                  (statusFilter === s ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                {s === '' ? '全部状态' : s === 'ok' ? '成功' : '失败'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {['', 'flow', 'agent', 'llm_call', 'tool_call'].map((k) => (
              <button key={k} onClick={() => setKindFilter(k)}
                className={'px-2 py-0.5 text-[9px] font-medium rounded transition-all ' +
                  (kindFilter === k ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                {k === '' ? '全部类型' : k === 'flow' ? '流程' : k === 'agent' ? '智能体' : k === 'llm_call' ? 'LLM' : '工具'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {['', '1h', '6h', '24h', '7d'].map((tr) => (
              <button key={tr} onClick={() => setTimeRange(tr)}
                className={'px-2 py-0.5 text-[9px] font-medium rounded transition-all ' +
                  (timeRange === tr ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                {tr === '' ? '全部时间' : tr === '1h' ? '1小时' : tr === '6h' ? '6小时' : tr === '24h' ? '24小时' : '7天'}
              </button>
            ))}
          </div>
          {(statusFilter || kindFilter || timeRange) && (
            <button onClick={() => { setStatusFilter(''); setKindFilter(''); setTimeRange(''); }}
              className="px-2 py-0.5 text-[9px] text-gray-400 hover:text-red-500 transition-colors">
              <X className="w-2.5 h-2.5 inline mr-0.5" />清除筛选
            </button>
          )}
        </div>

        {/* Summary view */}
        {viewGroupBy === 'summary' && !loadingList && (
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
            {(() => {
              const groups: Record<string, { traces: typeof filteredTraces; totalMs: number }> = {};
              filteredTraces.forEach((t) => {
                const p = t.project || 'default';
                if (!groups[p]) groups[p] = { traces: [], totalMs: 0 };
                groups[p].traces.push(t);
                groups[p].totalMs += t.total_duration_ms || 0;
              });
              return Object.entries(groups).map(([project, g]) => (
                <div
                  key={project}
                  onClick={() => { setProjectFilter(project); setViewGroupBy('trace'); }}
                  className="bento cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{project}</span>
                      <span className="tag text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500">{g.traces.length} 个追踪</span>
                    </div>
                    <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">点击查看 →</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 mb-0.5">平均耗时</p>
                      <p className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                        {g.traces.length > 0 ? fmtMs(g.totalMs / g.traces.length) : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 mb-0.5">最早</p>
                      <p className="text-[10px] font-mono text-gray-500">
                        {g.traces[g.traces.length - 1] ? fmtTime(g.traces[g.traces.length - 1].start_time) : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 mb-0.5">最新</p>
                      <p className="text-[10px] font-mono text-gray-500">
                        {g.traces[0] ? fmtTime(g.traces[0].start_time) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ));
            })()}
            {filteredTraces.length === 0 && (
              <div className="bento text-center py-8">
                <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">暂无追踪数据</p>
              </div>
            )}
          </div>
        )}

        {viewGroupBy === 'summary' && loadingList && (
          <div className="flex-1"><SkeletonTraceList /></div>
        )}

        {/* Trace list */}
        {(viewGroupBy === 'trace' || viewGroupBy === 'session') && (
          <>        {/* Trace list */}
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
                onClick={() => { if (compareMode && compareTraceA) { selectCompareB(t.trace_id); } else { loadTrace(t.trace_id); } }}
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
          </>
        )}

      </div>

      {viewGroupBy === 'session' && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 min-h-0">
          {sessionsLoading ? <SkeletonTraceList /> : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">暂无会话记录</p>
            </div>
          ) : (
            sessions.map((s: any) => (
              <button
                key={s.session_id}
                onClick={() => {
                  setViewGroupBy('trace');
                  // Auto-select first trace of this session
                  const stid = s.session_id;
                  if (stid) loadTrace(stid);
                }}
                className="w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate max-w-[160px]">
                    {s.session_id.slice(0, 16)}
                  </span>
                  <span className="text-[10px] text-gray-400">{s.trace_count || 0} 个追踪</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-gray-400">{s.span_count || 0} spans</span>
                  {s.project && s.project !== 'default' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      {s.project}
                    </span>
                  )}
                  {s.error_count > 0 && (
                    <span className="text-[9px] text-red-500">{s.error_count} 错误</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

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
                <WaterfallView trace={selected} selectedSpanId={selectedSpanId} onSelectSpan={setSelectedSpanId} highlightQuery={highlightQuery} />
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
