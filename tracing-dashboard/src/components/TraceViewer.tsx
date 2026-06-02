import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  CheckCircle2, AlertCircle, Clock, Loader2,
  BarChart3, Search, Server, Filter, X, Inbox,
  Minimize2, Maximize2, RefreshCw, Copy, Download,
  List, GanttChartSquare, Bell,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
import { WaterfallView } from './WaterfallView';

export interface SpanMeta {
  model?: string; agent?: string; agent_role?: string; task?: string;
  input_tokens?: number; output_tokens?: number; total_tokens?: number;
  tool_name?: string; tool_input?: string; tool_output?: string;
  prompt_preview?: string; response_preview?: string;
  [key: string]: unknown;
}

export interface Span {
  id: string; trace_id: string; parent_id: string; session_id: string;
  project: string; name: string;
  kind: 'flow' | 'agent' | 'llm_call' | 'tool_call' | 'phase';
  status: 'ok' | 'error' | 'running';
  start_time: string; end_time: string; duration_ms: number;
  metadata: SpanMeta; error: string;
}

export interface TraceData { trace_id: string; span_count: number; spans: Span[]; }

export interface TraceSummary {
  trace_id: string; session_id: string; project: string;
  span_count: number; total_duration_ms: number; start_time: string; status?: string;
}

export interface Stats {
  total_spans: number; total_input_tokens: number; total_output_tokens: number;
  total_tokens: number; by_kind: { kind: string; c: number; total_ms: number }[];
}

interface TraceViewerProps { endpoint: string; }

const kindLabel: Record<string, string> = {
  flow: '\u6d41\u7a0b', agent: '\u667a\u80fd\u4f53', llm_call: 'LLM',
  tool_call: '\u5de5\u5177', phase: '\u9636\u6bb5',
};

const kindIcons: Record<string, React.ReactNode> = {
  flow: <Layers className="w-3.5 h-3.5" />, agent: <Activity className="w-3.5 h-3.5" />,
  llm_call: <Zap className="w-3.5 h-3.5" />, tool_call: <Wrench className="w-3.5 h-3.5" />,
  phase: <Code2 className="w-3.5 h-3.5" />,
};

const kindColor: Record<string, string> = {
  flow: 'bg-purple-400', agent: 'bg-blue-400', llm_call: 'bg-amber-400',
  tool_call: 'bg-emerald-400', phase: 'bg-indigo-400',
};

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
};

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm ' + ((ms % 60000) / 1000).toFixed(0) + 's';
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '\u521a\u521a';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' \u5206\u949f\u524d';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' \u5c0f\u65f6\u524d';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function statusIcon(s: string) {
  switch (s) {
    case 'ok': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'running': return <Clock className="w-3.5 h-3.5 text-gray-400 animate-pulse" />;
    default: return null;
  }
}
function matchModelPrice(model: string | undefined) {
  if (!model) return null;
  const key = Object.keys(MODEL_PRICES).find((k) => model.toLowerCase().includes(k));
  return key ? MODEL_PRICES[key] : null;
}

function StatCard({ icon, label, value, valueClass }: {
  icon: React.ReactNode; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="stat-card"><div className="flex justify-center mb-1.5 text-gray-400">{icon}</div>
      <p className={'text-lg font-bold ' + (valueClass || 'text-gray-900 dark:text-gray-100')}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 font-medium">{label}</p></div>
  );
}

const PAGE_SIZE = 50;

export function TraceViewer({ endpoint }: TraceViewerProps) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [filteredTraces, setFilteredTraces] = useState<TraceSummary[]>([]);
  const [selected, setSelected] = useState<TraceData | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'waterfall'>('waterfall');
  const [timeRange, setTimeRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [prevTraceCount, setPrevTraceCount] = useState(0);
  const [newTraceCount, setNewTraceCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (!selected) return;
    if (allExpanded) { setExpanded(new Set()); setAllExpanded(false); }
    else { setExpanded(new Set<string>(selected.spans.map((s) => s.id))); setAllExpanded(true); }
  };

  const fetchData = useCallback(() => {
    fetch(endpoint + '/traces?limit=200').then((r) => r.json()).then((d) => {
      const items: TraceSummary[] = d.traces || [];
      if (items.length > prevTraceCount && prevTraceCount > 0) setNewTraceCount((c) => c + (items.length - prevTraceCount));
      setPrevTraceCount(items.length);
      setTraces(items);
      const p = new Set<string>(); items.forEach((t: TraceSummary) => { if (t.project) p.add(t.project); });
      setProjects(Array.from(p).sort());
    }).catch(() => {}).finally(() => setLoadingList(false));
    fetch(endpoint + '/stats').then((r) => r.json()).then(setStats).catch(() => {});
  }, [endpoint, prevTraceCount]);

  useEffect(() => { fetchData(); }, [endpoint]);
  useEffect(() => { const i = setInterval(fetchData, 5000); return () => clearInterval(i); }, [fetchData]);

  /* Deep link */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('trace_id');
    if (tid && traces.length > 0) {
      const found = traces.find((t) => t.trace_id === tid);
      if (found) loadTrace(tid);
    }
  }, [traces]);

  /* Keyboard */
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { setSelected(null); setSelectedSpanId(null); }
      if (!selected || filteredTraces.length < 2) return;
      const idx = filteredTraces.findIndex((t) => t.trace_id === selected.trace_id);
      if ((e.key === 'ArrowUp' || e.key === 'k') && idx > 0) { e.preventDefault(); loadTrace(filteredTraces[idx - 1].trace_id); }
      if ((e.key === 'ArrowDown' || e.key === 'j') && idx < filteredTraces.length - 1) { e.preventDefault(); loadTrace(filteredTraces[idx + 1].trace_id); }
      if (e.key === 'Enter' && selectedSpanId) { toggle(selectedSpanId); }
    }
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, filteredTraces, selectedSpanId]);

  /* Filters */
  useEffect(() => {
    let r = traces;
    if (projectFilter) r = r.filter((t) => t.project === projectFilter);
    if (statusFilter === 'error') r = r.filter((t) => t.status === 'error');
    if (statusFilter === 'running') r = r.filter((t) => t.status === 'running');
    if (timeRange !== 'all') {
      const now = Date.now();
      const ranges: Record<string, number> = { '1h': 3600_000, '6h': 21600_000, '24h': 86400_000, '7d': 604800_000 };
      const ms = ranges[timeRange] || 0;
      if (ms) r = r.filter((t) => now - new Date(t.start_time).getTime() < ms);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((t) => t.trace_id.toLowerCase().includes(q) || (t.session_id && t.session_id.toLowerCase().includes(q)) || (t.project && t.project.toLowerCase().includes(q)));
    }
    setFilteredTraces(r); setPage(0);
  }, [searchQuery, projectFilter, timeRange, statusFilter, traces]);

  const loadTrace = (id: string) => {
    setLoading(true);
    fetch(endpoint + '/traces/' + id).then((r) => r.json()).then((d) => {
      setSelected(d); setExpanded(new Set<string>((d.spans || []).map((s: Span) => s.id)));
      setAllExpanded(true); setSelectedSpanId(null);
      const url = new URL(window.location.href); url.searchParams.set('trace_id', id);
      window.history.replaceState({}, '', url.toString());
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const closeDetail = () => {
    setSelected(null); setSelectedSpanId(null);
    const url = new URL(window.location.href); url.searchParams.delete('trace_id');
    window.history.replaceState({}, '', url.toString());
  };

  const copyTraceId = (id: string) => { navigator.clipboard.writeText(id).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const exportTrace = () => {
    if (!selected) return;
    const b = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b); const a = document.createElement('a');
    a.href = u; a.download = selected.trace_id + '.json'; a.click(); URL.revokeObjectURL(u);
  };
  const dismissNotification = () => setNewTraceCount(0);

  const hasData = traces.length > 0;
  const paginatedTraces = filteredTraces.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredTraces.length / PAGE_SIZE);

  const traceTokens = selected ? selected.spans.filter((s) => s.kind === 'llm_call').reduce((acc, s) => ({
    input: acc.input + (s.metadata.input_tokens || 0), output: acc.output + (s.metadata.output_tokens || 0),
    total: acc.total + (s.metadata.total_tokens || 0),
  }), { input: 0, output: 0, total: 0 }) : { input: 0, output: 0, total: 0 };

  const traceCost = useMemo(() => {
    if (!selected) return null;
    let t = 0;
    for (const s of selected.spans) {
      if (s.kind !== 'llm_call') continue;
      const p = matchModelPrice(s.metadata.model); if (!p) continue;
      t += (s.metadata.input_tokens || 0) / 1000 * p.input + (s.metadata.output_tokens || 0) / 1000 * p.output;
    }
    return t > 0 ? t : null;
  }, [selected]);

  const maxDuration = selected ? Math.max(...selected.spans.map((s) => s.duration_ms), 1) : 1;
  const projOpts = [{ value: '', label: '\u5168\u90e8\u9879\u76ee' }, ...projects.map((p) => ({ value: p, label: p }))];
  const timeOpts = [{ value: 'all', label: '\u5168\u90e8\u65f6\u95f4' }, { value: '1h', label: '\u6700\u8fd1 1 \u5c0f\u65f6' }, { value: '6h', label: '\u6700\u8fd1 6 \u5c0f\u65f6' }, { value: '24h', label: '\u6700\u8fd1 24 \u5c0f\u65f6' }, { value: '7d', label: '\u6700\u8fd1 7 \u5929' }];
  const statOpts = [{ value: 'all', label: '\u5168\u90e8\u72b6\u6001' }, { value: 'error', label: '\u4ec5\u9519\u8bef' }, { value: 'running', label: '\u8fd0\u884c\u4e2d' }];

  return (
    <div className="space-y-5 animate-fade-in">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label={'\u603b Span \u6570'} value={String(stats.total_spans)} />
          <StatCard icon={<Zap className="w-4 h-4" />} label={'Token \u7528\u91cf'} value={fmtTokens(stats.total_tokens)} valueClass="text-indigo-600 dark:text-indigo-400" />
          <StatCard icon={<Activity className="w-4 h-4" />} label={'LLM \u8c03\u7528'} value={String(stats.by_kind.find((k) => k.kind === 'llm_call')?.c ?? 0)} valueClass="text-amber-600 dark:text-amber-400" />
          <StatCard icon={<Wrench className="w-4 h-4" />} label={'\u5de5\u5177\u8c03\u7528'} value={String(stats.by_kind.find((k) => k.kind === 'tool_call')?.c ?? 0)} valueClass="text-emerald-600 dark:text-emerald-400" />
        </div>
      )}

      {newTraceCount > 0 && (
        <button onClick={() => { dismissNotification(); fetchData(); }}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
          <Bell className="w-4 h-4" />
          {'\u6536\u5230 ' + newTraceCount + ' \u6761\u65b0\u8ffd\u8e2a\u6570\u636e\uff0c\u70b9\u51fb\u5237\u65b0'}
          <X className="w-3.5 h-3.5 ml-auto opacity-50" onClick={(e) => { e.stopPropagation(); dismissNotification(); }} />
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder={'\u641c\u7d22 trace ID\u3001\u4f1a\u8bdd\u6216\u9879\u76ee...'} value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-gray-400"
            aria-label={'\u641c\u7d22\u8ffd\u8e2a'} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded" aria-label={'\u6e05\u9664\u641c\u7d22'}>
              <X className="w-3.5 h-3.5" /></button>
          )}
        </div>
        <Dropdown value={timeRange} options={timeOpts} onChange={setTimeRange} className="w-36" />
        <Dropdown value={statusFilter} options={statOpts} onChange={setStatusFilter} className="w-32" />
        {projects.length > 0 && <Dropdown value={projectFilter} options={projOpts} icon={<Filter className="w-4 h-4" />} onChange={setProjectFilter} className="w-40" />}
        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0" aria-label={'\u5237\u65b0'}>
          <RefreshCw className="w-4 h-4" /></button>
      </div>

      {!loadingList && !hasData && (
        <div className="bento"><div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{'\u6682\u65e0\u8ffd\u8e2a\u6570\u636e'}</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">{'\u542f\u52a8 Agent \u5e76\u6267\u884c\u4efb\u52a1\u540e\uff0c\u8ffd\u8e2a\u6570\u636e\u5c06\u81ea\u52a8\u51fa\u73b0\u5728\u8fd9\u91cc\u3002'}</p>
        </div></div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <div className="bento max-h-[calc(100vh-300px)] min-h-[300px] overflow-y-auto !p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2"><Server className="w-3.5 h-3.5" />{'\u8ffd\u8e2a\u5217\u8868'}</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">{filteredTraces.length}</span>
            </div>
            {loadingList && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="skeleton h-[52px] rounded-lg" />))}</div>}
            {!loadingList && filteredTraces.length === 0 && <p className="text-center py-8 text-xs text-gray-400">{'\u65e0\u5339\u914d\u7ed3\u679c'}</p>}
            <div className="space-y-1">
              {paginatedTraces.map((t) => {
                const isActive = selected?.trace_id === t.trace_id;
                return (
                  <button key={t.trace_id} onClick={() => loadTrace(t.trace_id)}
                    className={'trace-item w-full text-left group ' + (isActive ? 'active' : '')} aria-current={isActive ? 'true' : undefined}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium truncate text-gray-900 dark:text-gray-100">{t.session_id || t.trace_id.slice(0, 12)}</p>
                          {t.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {t.project && <span className="tag bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{t.project}</span>}
                          <span className="text-[11px] text-gray-400">{t.span_count} spans</span>
                          <span className="text-[11px] text-gray-400">{fmtMs(t.total_duration_ms)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-gray-400">{fmtTime(t.start_time)}</span>
                        <button onClick={(e) => { e.stopPropagation(); copyTraceId(t.trace_id); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-opacity" aria-label={'\u590d\u5236 Trace ID'}>
                          <Copy className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-[10px] text-gray-400">{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredTraces.length)} / {filteredTraces.length}</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-2 py-1 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700">{'\u4e0a\u4e00\u9875'}</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-500 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700">{'\u4e0b\u4e00\u9875'}</button>
                </div>
              </div>
            )}
          </div>

          <div className="bento max-h-[calc(100vh-300px)] min-h-[300px] overflow-y-auto !p-4">
            {loading && <div className="flex flex-col items-center justify-center py-16 gap-3"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /><p className="text-xs text-gray-400">{'\u52a0\u8f7d\u4e2d...'}</p></div>}
            {!loading && !selected && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{'\u9009\u62e9\u4e00\u4e2a\u8ffd\u8e2a\u8bb0\u5f55'}</p>
                <p className="text-xs text-gray-400 mt-1">{'\u70b9\u51fb\u5de6\u4fa7\u5217\u8868\u6216\u4f7f\u7528 \u2191\u2193 \u952e\u5207\u6362\u8ffd\u8e2a\u9879'}</p>
              </div>
            )}
            {!loading && selected && (
              <>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{'\u8ffd\u8e2a\u8be6\u60c5'}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-xs text-gray-400">{selected.span_count} {'\u4e2a Span'}</p>
                      {traceTokens.total > 0 && <span className="text-[10px] text-indigo-500 font-mono">{fmtTokens(traceTokens.total)} tokens {'\u00b7'} {'\u5165'}{fmtTokens(traceTokens.input)} / {'\u51fa'}{fmtTokens(traceTokens.output)}</span>}
                      {traceCost !== null && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">~${traceCost.toFixed(4)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setViewMode(viewMode === 'list' ? 'waterfall' : 'list')}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={viewMode === 'list' ? '\u7011\u5e03\u56fe\u89c6\u56fe' : '\u5217\u8868\u89c6\u56fe'}>
                      {viewMode === 'list' ? <GanttChartSquare className="w-4 h-4" /> : <List className="w-4 h-4" />}
                    </button>
                    <button onClick={toggleAll} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={allExpanded ? '\u6298\u53e0\u5168\u90e8' : '\u5c55\u5f00\u5168\u90e8'}>
                      {allExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={exportTrace} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={'\u5bfc\u51fa JSON'}>
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => copyTraceId(selected.trace_id)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={'\u590d\u5236 Trace ID'}>
                      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={closeDetail} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={'\u5173\u95ed'}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {viewMode === 'waterfall' && <WaterfallView trace={selected} selectedSpanId={selectedSpanId} onSelectSpan={setSelectedSpanId} />}

                {viewMode === 'list' && (
                  <div className="space-y-1">
                    {selected.spans.map((span) => (
                      <div key={span.id}>
                        <button onClick={() => toggle(span.id)}
                          className={'span-row w-full text-left ' + (span.kind === 'flow' ? 'border-kind-flow' : span.kind === 'agent' ? 'border-kind-agent' : span.kind === 'llm_call' ? 'border-kind-llm' : span.kind === 'tool_call' ? 'border-kind-tool' : 'border-kind-phase')}
                          aria-expanded={expanded.has(span.id)}>
                          <div className="flex items-center gap-2.5">
                            <span className="text-gray-400">{kindIcons[span.kind] || kindIcons.phase}</span>
                            <span className="flex-1 text-[13px] font-medium truncate text-gray-900 dark:text-gray-100">{span.name || kindLabel[span.kind] || span.kind}</span>
                            <span className={'kind-badge ' + (span.kind === 'flow' ? 'kind-badge-flow' : span.kind === 'agent' ? 'kind-badge-agent' : span.kind === 'llm_call' ? 'kind-badge-llm' : span.kind === 'tool_call' ? 'kind-badge-tool' : 'kind-badge-phase')}>{kindLabel[span.kind] || span.kind}</span>
                            {statusIcon(span.status)}
                            <span className="text-[11px] text-gray-400 font-mono w-12 text-right">{fmtMs(span.duration_ms)}</span>
                          </div>
                          <div className="mt-1.5 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className={'h-full rounded-full ' + (kindColor[span.kind] || 'bg-gray-400')} style={{ width: Math.max((span.duration_ms / maxDuration) * 100, 2) + '%' }} />
                          </div>
                          {span.kind === 'llm_call' && span.metadata.total_tokens ? (
                            <div className="mt-1 text-[10px] text-gray-400">{fmtTokens(span.metadata.total_tokens)} tokens {'\u00b7'} {'\u5165'} {fmtTokens(span.metadata.input_tokens || 0)} / {'\u51fa'} {fmtTokens(span.metadata.output_tokens || 0)}</div>
                          ) : null}
                          {span.metadata.task && <div className="mt-1 text-[10px] text-gray-400 truncate">Task: {span.metadata.task}</div>}
                          {span.error && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 truncate">{span.error}</p>}
                        </button>
                        {expanded.has(span.id) && (
                          <div className="span-detail space-y-1.5">
                            {span.metadata.agent && <div className="flex gap-2 text-[12px]"><span className="text-gray-400 shrink-0">Agent</span><span className="text-gray-700 dark:text-gray-300 font-medium">{span.metadata.agent}</span></div>}
                            {span.metadata.agent_role && !span.metadata.agent && <div className="flex gap-2 text-[12px]"><span className="text-gray-400 shrink-0">Agent</span><span className="text-gray-700 dark:text-gray-300">{span.metadata.agent_role}</span></div>}
                            {span.metadata.task && <div className="flex gap-2 text-[12px]"><span className="text-gray-400 shrink-0">Task</span><span className="text-gray-700 dark:text-gray-300">{span.metadata.task}</span></div>}
                            {span.metadata.model && <div className="flex gap-2 text-[12px]"><span className="text-gray-400 shrink-0">{'\u6a21\u578b'}</span><span className="font-mono text-gray-700 dark:text-gray-300">{span.metadata.model}</span></div>}
                            {span.metadata.prompt_preview && <details className="mt-1"><summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium">{'\u8f93\u5165'}</summary><pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">{span.metadata.prompt_preview}</pre></details>}
                            {span.metadata.response_preview && <details className="mt-1"><summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium">{'\u8f93\u51fa'}</summary><pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">{span.metadata.response_preview}</pre></details>}
                            {span.metadata.tool_input && <details className="mt-1"><summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{'\u5de5\u5177\u8f93\u5165'}</summary><pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-32 font-mono leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">{span.metadata.tool_input}</pre></details>}
                            {span.metadata.tool_output && <details className="mt-1"><summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{'\u5de5\u5177\u8f93\u51fa'}</summary><pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-32 font-mono leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">{span.metadata.tool_output}</pre></details>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
