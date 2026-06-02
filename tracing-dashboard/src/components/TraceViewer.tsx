import { useState, useEffect } from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  CheckCircle2, AlertCircle, Clock, Loader2,
  BarChart3, Search, Server, Filter, X, Inbox,
  Minimize2, Maximize2, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Dropdown } from './Dropdown';

/* ================================================
   Types
   ================================================ */

export interface SpanMeta {
  model?: string;
  agent?: string;
  agent_role?: string;
  task?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  prompt_preview?: string;
  response_preview?: string;
  [key: string]: unknown;
}

export interface Span {
  id: string;
  trace_id: string;
  parent_id: string;
  session_id: string;
  project: string;
  name: string;
  kind: 'flow' | 'agent' | 'llm_call' | 'tool_call' | 'phase';
  status: 'ok' | 'error' | 'running';
  start_time: string;
  end_time: string;
  duration_ms: number;
  metadata: SpanMeta;
  error: string;
}

export interface TraceData {
  trace_id: string;
  span_count: number;
  spans: Span[];
}

export interface TraceSummary {
  trace_id: string;
  session_id: string;
  project: string;
  span_count: number;
  total_duration_ms: number;
  start_time: string;
}

export interface Stats {
  total_spans: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  by_kind: { kind: string; c: number; total_ms: number }[];
}

/* ================================================
   Props
   ================================================ */

interface TraceViewerProps {
  endpoint: string;
}

/* ================================================
   Constants
   ================================================ */

const kindLabel: Record<string, string> = {
  flow: '流程',
  agent: '智能体',
  llm_call: 'LLM',
  tool_call: '工具',
  phase: '阶段',
};

const kindIcons: Record<string, React.ReactNode> = {
  flow: <Layers className="w-3.5 h-3.5" />,
  agent: <Activity className="w-3.5 h-3.5" />,
  llm_call: <Zap className="w-3.5 h-3.5" />,
  tool_call: <Wrench className="w-3.5 h-3.5" />,
  phase: <Code2 className="w-3.5 h-3.5" />,
};

const kindColor: Record<string, string> = {
  flow: 'bg-purple-400',
  agent: 'bg-blue-400',
  llm_call: 'bg-amber-400',
  tool_call: 'bg-emerald-400',
  phase: 'bg-indigo-400',
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return '刚刚';
  if (diffMs < 3600_000) return Math.floor(diffMs / 60_000) + ' 分钟前';
  if (diffMs < 86400_000) return Math.floor(diffMs / 3600_000) + ' 小时前';
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusIcon(status: string) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'running':
      return <Clock className="w-3.5 h-3.5 text-gray-400 animate-pulse" />;
    default:
      return null;
  }
}

/* ================================================
   Stat Card Component
   ================================================ */

function StatCard({
  icon, label, value, valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex justify-center mb-1.5 text-gray-400">{icon}</div>
      <p className={'text-lg font-bold ' + (valueClass || 'text-gray-900 dark:text-gray-100')}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 font-medium">{label}</p>
    </div>
  );
}

/* ================================================
   Main Component
   ================================================ */

export function TraceViewer({ endpoint }: TraceViewerProps) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [filteredTraces, setFilteredTraces] = useState<TraceSummary[]>([]);
  const [selected, setSelected] = useState<TraceData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(true);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!selected) return;
    if (allExpanded) {
      setExpanded(new Set());
      setAllExpanded(false);
    } else {
      setExpanded(new Set<string>(selected.spans.map((s) => s.id)));
      setAllExpanded(true);
    }
  };

  /* Fetch trace list */
  const fetchData = () => {
    fetch(endpoint + '/traces?limit=50')
      .then((r) => r.json())
      .then((d) => {
        const items: TraceSummary[] = d.traces || [];
        setTraces(items);
        const projSet = new Set<string>();
        items.forEach((t: TraceSummary) => { if (t.project) projSet.add(t.project); });
        setProjects(Array.from(projSet).sort());
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));

    fetch(endpoint + '/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, [endpoint]);

  /* Auto-poll every 5 seconds */
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [endpoint]);

  /* Search + project filter */
  useEffect(() => {
    let result = traces;
    if (projectFilter) {
      result = result.filter((t) => t.project === projectFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.trace_id.toLowerCase().includes(q) ||
          (t.session_id && t.session_id.toLowerCase().includes(q)) ||
          (t.project && t.project.toLowerCase().includes(q))
      );
    }
    setFilteredTraces(result);
  }, [searchQuery, projectFilter, traces]);

  /* Load trace detail */
  const loadTrace = (id: string) => {
    setLoading(true);
    fetch(endpoint + '/traces/' + id)
      .then((r) => r.json())
      .then((d) => {
        setSelected(d);
        const ids = new Set<string>((d.spans || []).map((s: Span) => s.id));
        setExpanded(ids);
        setAllExpanded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const closeDetail = () => { setSelected(null); };

  const hasData = traces.length > 0;

  /* Compute trace totals */
  const traceTokens = selected
    ? selected.spans
        .filter((s) => s.kind === 'llm_call')
        .reduce(
          (acc, s) => ({
            input: acc.input + (s.metadata.input_tokens || 0),
            output: acc.output + (s.metadata.output_tokens || 0),
            total: acc.total + (s.metadata.total_tokens || 0),
          }),
          { input: 0, output: 0, total: 0 }
        )
    : { input: 0, output: 0, total: 0 };

  const maxDuration = selected
    ? Math.max(...selected.spans.map((s) => s.duration_ms), 1)
    : 1;

  /* Build dropdown options */
  const projectOptions = [
    { value: '', label: '全部项目' },
    ...projects.map((p) => ({ value: p, label: p })),
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ===== Stats Bar ========================= */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="总 Span 数" value={String(stats.total_spans)} />
          <StatCard icon={<Zap className="w-4 h-4" />} label="Token 用量" value={fmtTokens(stats.total_tokens)} valueClass="text-indigo-600 dark:text-indigo-400" />
          <StatCard icon={<Activity className="w-4 h-4" />} label="LLM 调用" value={String(stats.by_kind.find((k) => k.kind === 'llm_call')?.c ?? 0)} valueClass="text-amber-600 dark:text-amber-400" />
          <StatCard icon={<Wrench className="w-4 h-4" />} label="工具调用" value={String(stats.by_kind.find((k) => k.kind === 'tool_call')?.c ?? 0)} valueClass="text-emerald-600 dark:text-emerald-400" />
        </div>
      )}

      {/* ===== Filters =========================== */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索 trace ID、会话或项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800
                       border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                       placeholder-gray-400"
            aria-label="搜索追踪"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded" aria-label="清除搜索">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0" aria-label="刷新" title="刷新">
          <RefreshCw className="w-4 h-4" />
        </button>
        {projects.length > 0 && (
          <Dropdown value={projectFilter} options={projectOptions} icon={<Filter className="w-4 h-4" />} onChange={setProjectFilter} className="sm:w-44" />
        )}
      </div>

      {/* ===== Empty State ======================= */}
      {!loadingList && !hasData && (
        <div className="bento">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">暂无追踪数据</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">启动 Agent 并执行任务后，追踪数据将自动出现在这里。确保 SDK 已正确配置并连接到当前服务器。</p>
          </div>
        </div>
      )}

      {/* ===== Main Panel ======================== */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          {/* Trace list */}
          <div className="bento max-h-[calc(100vh-300px)] min-h-[300px] overflow-y-auto !p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Server className="w-3.5 h-3.5" />追踪列表
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">{filteredTraces.length}</span>
            </div>

            {loadingList && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (<div key={i} className="skeleton h-[52px] rounded-lg" />))}
              </div>
            )}

            {!loadingList && filteredTraces.length === 0 && (
              <p className="text-center py-8 text-xs text-gray-400">无匹配结果</p>
            )}

            <div className="space-y-1">
              {filteredTraces.map((t) => {
                const isActive = selected?.trace_id === t.trace_id;
                return (
                  <button key={t.trace_id} onClick={() => loadTrace(t.trace_id)}
                    className={'trace-item w-full text-left ' + (isActive ? 'active' : '')}
                    aria-current={isActive ? 'true' : undefined}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate text-gray-900 dark:text-gray-100">
                          {t.session_id || t.trace_id.slice(0, 12)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {t.project && (
                            <span className="tag bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{t.project}</span>
                          )}
                          <span className="text-[11px] text-gray-400">{t.span_count} spans</span>
                          <span className="text-[11px] text-gray-400">{fmtMs(t.total_duration_ms)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{fmtTime(t.start_time)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trace detail */}
          <div className="bento max-h-[calc(100vh-300px)] min-h-[300px] overflow-y-auto !p-4">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <p className="text-xs text-gray-400">加载中...</p>
              </div>
            )}

            {/* Empty prompt */}
            {!loading && !selected && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">选择一个追踪记录</p>
                <p className="text-xs text-gray-400 mt-1">点击左侧列表中的追踪项查看详细信息</p>
              </div>
            )}

            {/* Detail */}
            {!loading && selected && (
              <>
                {/* Header bar */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">追踪详情</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-400">{selected.span_count} 个 Span</p>
                      {traceTokens.total > 0 && (
                        <span className="text-[10px] text-indigo-500 font-mono">
                          {fmtTokens(traceTokens.total)} tokens
                          {' · '}入{fmtTokens(traceTokens.input)} / 出{fmtTokens(traceTokens.output)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={toggleAll}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label={allExpanded ? '折叠全部' : '展开全部'} title={allExpanded ? '折叠全部' : '展开全部'}>
                      {allExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={closeDetail}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      aria-label="关闭" title="关闭">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Span list */}
                <div className="space-y-1">
                  {selected.spans.map((span) => (
                    <div key={span.id}>
                      <button
                        onClick={() => toggle(span.id)}
                        className={
                          'span-row w-full text-left ' +
                          (span.kind === 'flow' ? 'border-kind-flow' :
                           span.kind === 'agent' ? 'border-kind-agent' :
                           span.kind === 'llm_call' ? 'border-kind-llm' :
                           span.kind === 'tool_call' ? 'border-kind-tool' : 'border-kind-phase')
                        }
                        aria-expanded={expanded.has(span.id)}
                      >
                        {/* Top row: icon + name + badge + status + duration */}
                        <div className="flex items-center gap-2.5">
                          <span className="text-gray-400">{kindIcons[span.kind] || kindIcons.phase}</span>
                          <span className="flex-1 text-[13px] font-medium truncate text-gray-900 dark:text-gray-100">
                            {span.name || kindLabel[span.kind] || span.kind}
                          </span>
                          <span className={
                            'kind-badge ' +
                            (span.kind === 'flow' ? 'kind-badge-flow' :
                             span.kind === 'agent' ? 'kind-badge-agent' :
                             span.kind === 'llm_call' ? 'kind-badge-llm' :
                             span.kind === 'tool_call' ? 'kind-badge-tool' : 'kind-badge-phase')
                          }>
                            {kindLabel[span.kind] || span.kind}
                          </span>
                          {statusIcon(span.status)}
                          <span className="text-[11px] text-gray-400 font-mono w-12 text-right">{fmtMs(span.duration_ms)}</span>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-1.5 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={'h-full rounded-full ' + (kindColor[span.kind] || 'bg-gray-400')}
                            style={{ width: Math.max((span.duration_ms / maxDuration) * 100, 2) + '%' }}
                          />
                        </div>

                        {/* Inline token info for LLM calls */}
                        {span.kind === 'llm_call' && span.metadata.total_tokens ? (
                          <div className="mt-1 text-[10px] text-gray-400">
                            {fmtTokens(span.metadata.total_tokens)} tokens
                            {' · '}入 {fmtTokens(span.metadata.input_tokens || 0)} / 出 {fmtTokens(span.metadata.output_tokens || 0)}
                          </div>
                        ) : null}

                        {/* Task preview inline */}
                        {span.metadata.task && (
                          <div className="mt-1 text-[10px] text-gray-400 truncate">
                            Task: {span.metadata.task}
                          </div>
                        )}

                        {span.error && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 truncate">{span.error}</p>
                        )}
                      </button>

                      {/* Expanded detail */}
                      {expanded.has(span.id) && (
                        <div className="span-detail space-y-1.5">
                          {/* Agent */}
                          {span.metadata.agent && (
                            <div className="flex gap-2 text-[12px]">
                              <span className="text-gray-400 shrink-0">Agent</span>
                              <span className="text-gray-700 dark:text-gray-300 font-medium">{span.metadata.agent}</span>
                            </div>
                          )}
                          {span.metadata.agent_role && !span.metadata.agent && (
                            <div className="flex gap-2 text-[12px]">
                              <span className="text-gray-400 shrink-0">Agent</span>
                              <span className="text-gray-700 dark:text-gray-300">{span.metadata.agent_role}</span>
                            </div>
                          )}

                          {/* Task */}
                          {span.metadata.task && (
                            <div className="flex gap-2 text-[12px]">
                              <span className="text-gray-400 shrink-0">Task</span>
                              <span className="text-gray-700 dark:text-gray-300">{span.metadata.task}</span>
                            </div>
                          )}

                          {/* Model */}
                          {span.metadata.model && (
                            <div className="flex gap-2 text-[12px]">
                              <span className="text-gray-400 shrink-0">模型</span>
                              <span className="font-mono text-gray-700 dark:text-gray-300">{span.metadata.model}</span>
                            </div>
                          )}

                          {/* Input / Prompt Preview */}
                          {span.metadata.prompt_preview && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors font-medium">输入</summary>
                              <pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap
                                              bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                                {span.metadata.prompt_preview}
                              </pre>
                            </details>
                          )}

                          {/* Output / Response Preview */}
                          {span.metadata.response_preview && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors font-medium">输出</summary>
                              <pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap
                                              bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                                {span.metadata.response_preview}
                              </pre>
                            </details>
                          )}

                          {/* Tool input */}
                          {span.metadata.tool_input && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">工具输入</summary>
                              <pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-32 font-mono leading-relaxed whitespace-pre-wrap
                                              bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                                {span.metadata.tool_input}
                              </pre>
                            </details>
                          )}

                          {/* Tool output */}
                          {span.metadata.tool_output && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">工具输出</summary>
                              <pre className="text-[10px] mt-1.5 p-2.5 rounded-md overflow-auto max-h-32 font-mono leading-relaxed whitespace-pre-wrap
                                              bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                                {span.metadata.tool_output}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

