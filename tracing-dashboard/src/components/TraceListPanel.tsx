import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Bell, RefreshCw, Minimize2, Maximize2, Inbox, Filter, X, GitCompare, Activity, Zap, Star, Clock, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Dropdown } from './Dropdown';
import { SkeletonTraceList } from './Skeleton';
import type { TraceSummary } from '../utils/trace-utils';
import { StatCard, fmtMs, fmtTokens, fmtTime, kindLabel } from '../utils/trace-utils';

interface SessionSummary {
  session_id: string;
  project: string;
  first_time: string;
  last_time: string;
  span_count: number;
  trace_count: number;
  error_count: number;
  total_duration_ms: number;
}

interface TraceListPanelProps {
  // Data
  filteredTraces: TraceSummary[];
  projects: string[];
  projectFilter: string;
  setProjectFilter: (p: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  kindFilter: string;
  setKindFilter: (k: string) => void;
  timeRange: string;
  setTimeRange: (t: string) => void;
  page: number;
  setPage: (p: number) => void;
  hasMore: boolean;
  loadingList: boolean;
  newTraceCount: number;
  sseConnected: boolean;
  dismissNotification: () => void;
  viewGroupBy: string;
  setViewGroupBy: (v: 'trace' | 'session' | 'summary') => void;
  showList: boolean;
  setShowList: (s: boolean) => void;
  stats: any;
  
  // Sessions
  sessions: SessionSummary[];
  sessionsLoading: boolean;
  
  // Trace selection
  selected: any;
  paginatedTraces: TraceSummary[];
  loadTrace: (id: string) => void;
  
  // Compare mode
  compareMode: boolean;
  compareTraceA: string | null;
  selectCompareB: (id: string) => void;
  cancelCompare: () => void;
  mobileView?: string;
  setMobileView?: (v: 'list' | 'detail') => void;
}

function groupByProject(traces: TraceSummary[]) {
  const groups: Record<string, { traces: TraceSummary[]; totalMs: number; errorCount: number; totalTokens: number }> = {};
  for (const t of traces) {
    const key = t.project || '(default)';
    if (!groups[key]) groups[key] = { traces: [], totalMs: 0, errorCount: 0, totalTokens: 0 };
    groups[key].traces.push(t);
    groups[key].totalMs += t.total_duration_ms;
    if ((t as any).error_count) groups[key].errorCount += (t as any).error_count;
    if ((t as any).total_tokens) groups[key].totalTokens += (t as any).total_tokens;
  }
  // Sort traces within each group
  for (const k of Object.keys(groups)) {
    groups[k].traces.sort((a, b) => (b.total_duration_ms || 0) - (a.total_duration_ms || 0));
  }
  return groups;
}

export function TraceListPanel({
  filteredTraces, projects, projectFilter, setProjectFilter,
  searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  kindFilter, setKindFilter, timeRange, setTimeRange,
  page, setPage, hasMore, loadingList,
  newTraceCount, sseConnected, dismissNotification,
  viewGroupBy, setViewGroupBy, showList, setShowList, stats,
  sessions, sessionsLoading,
  selected, paginatedTraces, loadTrace,
  compareMode, compareTraceA, selectCompareB, cancelCompare,
  mobileView, setMobileView,
}: TraceListPanelProps) {
  const projOpts = [...new Set(projects.filter(Boolean).sort())].map((p) => ({ value: p, label: p }));
  const grouped = viewGroupBy === 'summary' ? groupByProject(filteredTraces) : {};
  const [sessionSearch, setSessionSearch] = useState('');
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (!sessionSearch.trim()) return true;
      const q = sessionSearch.toLowerCase();
      return s.session_id.toLowerCase().includes(q)
        || (s.project && s.project.toLowerCase().includes(q));
    });
  }, [sessions, sessionSearch]);
  const [showFilterPopover, setShowFilterPopover] = useState(false);

  const statusOpts = [
    { value: '', label: '全部状态' },
    { value: 'ok', label: '成功' },
    { value: 'error', label: '失败' },
  ];
  const kindOpts = [
    { value: '', label: '全部类型' },
    { value: 'llm_call', label: 'LLM' },
    { value: 'tool_call', label: '工具' },
    { value: 'agent', label: '智能体' },
    { value: 'flow', label: '流程' },
  ];
  const timeOpts = [
    { value: '', label: '全部时间' },
    { value: '1h', label: '最近1小时' },
    { value: '6h', label: '最近6小时' },
    { value: '24h', label: '最近24小时' },
    { value: '7d', label: '最近7天' },
  ];

  const activeFilters = (projectFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (kindFilter ? 1 : 0) + (timeRange ? 1 : 0);

  return (
    <div className={`w-full lg:w-80 shrink-0 h-full flex-col gap-3 min-h-0 ${showList ? (mobileView === 'detail' ? 'hidden lg:flex' : 'flex') : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {viewGroupBy === 'trace' ? `追踪列表 ${filteredTraces.length > 0 ? `(${filteredTraces.length})` : ''}` : viewGroupBy === 'summary' ? '项目汇总' : `会话 ${sessions.length > 0 ? `(${sessions.length})` : ''}`}
            </h2>
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg ml-1">
              <button onClick={() => setViewGroupBy('trace')}
                className={'px-1.5 py-0.5 text-[11px] rounded ' + (viewGroupBy === 'trace' ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400')}>
                追踪
              </button>
              <button onClick={() => setViewGroupBy('session')}
                className={'px-1.5 py-0.5 text-[11px] rounded ' + (viewGroupBy === 'session' ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 shadow-sm' : 'text-gray-400')}>
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
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-gray-400"
          />
        </div>
        <Dropdown
          options={projOpts}
          value={projectFilter}
          onChange={setProjectFilter}
          placeholder="项目"
          className="w-24"
        />
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={<Activity className="w-4 h-4" />} label="Spans" value={String(stats.total_spans)} />
          <StatCard icon={<Zap className="w-4 h-4" />} label="Tokens" value={fmtTokens(stats.total_tokens)} />
        </div>
      )}

      {/* Filter popover */}
      <div className="relative">
        <button
          onClick={() => setShowFilterPopover(!showFilterPopover)}
          className={"w-full flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors " +
            (activeFilters > 0
              ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600")}
        >
          <Filter className="w-3 h-3" />
          <span>筛选{activeFilters > 0 ? " (" + activeFilters + ")" : ""}</span>
          {activeFilters > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); setProjectFilter(""); setStatusFilter(""); setKindFilter(""); setTimeRange(""); setSearchQuery(""); }}
              className="ml-auto p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setProjectFilter(""); setStatusFilter(""); setKindFilter(""); setTimeRange(""); setSearchQuery(""); } }}
              aria-label="清除筛选"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>

        {showFilterPopover && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowFilterPopover(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-3">
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] text-gray-400 uppercase font-semibold mb-1.5 block">状态</span>
                  <div className="flex flex-wrap gap-1">
                    {statusOpts.map((o) => (
                      <button key={o.value}
                        onClick={() => { setStatusFilter(o.value); setShowFilterPopover(false); }}
                        className={"px-2.5 py-1 text-[11px] rounded-md transition-colors " +
                          (statusFilter === o.value ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium" : "bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-gray-400 uppercase font-semibold mb-1.5 block">类型</span>
                  <div className="flex flex-wrap gap-1">
                    {kindOpts.map((o) => (
                      <button key={o.value}
                        onClick={() => { setKindFilter(o.value); setShowFilterPopover(false); }}
                        className={"px-2.5 py-1 text-[11px] rounded-md transition-colors " +
                          (kindFilter === o.value ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium" : "bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-gray-400 uppercase font-semibold mb-1.5 block">时间</span>
                  <div className="flex flex-wrap gap-1">
                    {timeOpts.map((o) => (
                      <button key={o.value}
                        onClick={() => { setTimeRange(o.value); setShowFilterPopover(false); }}
                        className={"px-2.5 py-1 text-[11px] rounded-md transition-colors " +
                          (timeRange === o.value ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium" : "bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Summary view */}
      {viewGroupBy === 'summary' && !loadingList && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {Object.entries(grouped).length === 0 ? (
            <EmptyState icon={<Inbox className="w-10 h-10" />} title="暂无追踪数据" description="还没有上报任何 Span，请先接入 SDK" showQuickStart />
          ) : (
            Object.entries(grouped).map(([project, g]) => (
              <div key={project} className="bento cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors" onClick={() => setProjectFilter(project)}>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{project}</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-[11px] text-gray-400">追踪数</p>
                    <p className="text-xs font-mono font-semibold">{g.traces.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">错误</p>
                    <p className="text-xs font-mono font-semibold text-red-500">{g.errorCount}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-[11px] text-gray-400 mb-0.5">平均耗时</p>
                    <p className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                      {g.traces.length > 0 ? fmtMs(g.totalMs / g.traces.length) : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-gray-400 mb-0.5">最早</p>
                    <p className="text-[11px] font-mono text-gray-500">
                      {g.traces[g.traces.length - 1] ? fmtTime(g.traces[g.traces.length - 1].start_time) : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-gray-400 mb-0.5">最新</p>
                    <p className="text-[11px] font-mono text-gray-500">
                      {g.traces[0] ? fmtTime(g.traces[0].start_time) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {viewGroupBy === 'summary' && loadingList && (
        <div className="flex-1"><SkeletonTraceList /></div>
      )}

      {/* Trace list */}
      {(viewGroupBy === 'trace' || viewGroupBy === 'session') && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 min-h-0">
          {loadingList ? (
            <SkeletonTraceList />
          ) : paginatedTraces.length === 0 ? (
            <EmptyState icon={<Inbox className="w-8 h-8" />} title="暂无追踪记录" className="py-8" />
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
                  <span className="text-[11px] text-gray-400">{fmtTime(t.start_time)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-gray-400">{t.span_count} spans</span>
                  {(t as any).avg_rating > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span className="text-[11px] text-amber-500">{(t as any).avg_rating}</span>
                    </span>
                  )}
                  {t.project && t.project !== 'default' && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      {t.project}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400">{fmtMs(t.total_duration_ms)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Session view */}
      {viewGroupBy === 'session' && (
        <>
          {/* Session search bar */}
          <div className="px-2 pt-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                type="text"
                placeholder="搜索会话 ID 或项目..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full pl-7 pr-7 py-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder-gray-400"
              />
              {sessionSearch && (
                <button onClick={() => setSessionSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
          {sessionsLoading ? <SkeletonTraceList /> : filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">{sessions.length === 0 ? '暂无会话数据' : '无匹配的会话'}</p>
            </div>
          ) : (
            filteredSessions.map((s: SessionSummary) => {
              const durationSec = s.total_duration_ms ? Math.round(s.total_duration_ms / 1000) : 0;
              const durationStr = durationSec >= 3600 ? Math.round(durationSec / 3600) + 'h ' + Math.round((durationSec % 3600) / 60) + 'm' :
                durationSec >= 60 ? Math.round(durationSec / 60) + 'm ' + (durationSec % 60) + 's' : durationSec + 's';
              const badgeColor = s.error_count > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400';
              return (
                <div
                  key={s.session_id}
                  onClick={() => {
                    setViewGroupBy('trace');
                    setSearchQuery(s.session_id || '');
                    if (s.project) setProjectFilter(s.project);
                  }}
                  className="bento p-3 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-200 truncate">
                          {s.session_id.length > 36 ? s.session_id.slice(0, 36) + '...' : s.session_id}
                        </span>
                        {s.project && (
                          <span className="tag bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0">{s.project}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          {s.trace_count} 个 Trace
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {s.span_count} 个 Span
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {durationStr}
                        </span>
                        <span className={badgeColor + ' text-[10px] px-1.5 py-px rounded-full font-medium'}>
                          {s.error_count > 0 ? s.error_count + ' 错误' : '正常'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                        <span>{fmtTime(s.first_time)}</span>
                        <span>→</span>
                        <span>{fmtTime(s.last_time)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 shrink-0 mt-1" />
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
      )}

      {/* Infinite scroll removed — pagination via virtual scroll */}
    </div>
  );
}


function InfiniteScrollSentinel({ hasMore, onLoadMore, loading }: {
  hasMore: boolean; onLoadMore: () => void; loading: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoadMoreRef.current(); },
      { rootMargin: "100px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-3 shrink-0">
      {loading ? (
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="text-[11px] text-gray-400">加载更多...</span>
      )}
    </div>
  );
}
