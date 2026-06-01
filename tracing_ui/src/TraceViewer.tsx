import { useState, useEffect } from "react";
import { Clock, Zap, Code2, Wrench, Layers, AlertCircle, CheckCircle2, Loader2, Activity } from "lucide-react";

/* ── Types ─────────────────────────────────────── */

interface SpanMeta {
  model?: string;
  agent_role?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  response?: string;
  [key: string]: unknown;
}

interface Span {
  id: string;
  trace_id: string;
  parent_id: string;
  session_id: string;
  project: string;
  name: string;
  kind: "flow" | "agent" | "llm_call" | "tool_call" | "phase";
  status: "ok" | "error" | "running";
  start_time: string;
  end_time: string;
  duration_ms: number;
  metadata: SpanMeta;
  error: string;
}

interface TraceData {
  trace_id: string;
  span_count: number;
  spans: Span[];
}

interface TraceSummary {
  trace_id: string;
  session_id: string;
  span_count: number;
  total_duration_ms: number;
  start_time: string;
}

interface Stats {
  total_spans: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  by_kind: { kind: string; c: number; total_ms: number }[];
}

/* ── Props ─────────────────────────────────────── */

interface TraceViewerProps {
  endpoint?: string;
  project?: string;
  traceId?: string;
  sessionId?: string;
}

/* ── Helpers ───────────────────────────────────── */

const kindIcons: Record<string, React.ReactNode> = {
  flow: <Layers className="w-4 h-4" />,
  agent: <Activity className="w-4 h-4" />,
  llm_call: <Zap className="w-4 h-4" />,
  tool_call: <Wrench className="w-4 h-4" />,
  phase: <Code2 className="w-4 h-4" />,
};

const kindColors: Record<string, string> = {
  flow:           "border-l-purple-500 bg-purple-50 dark:bg-purple-900/10",
  agent:          "border-l-blue-500 bg-blue-50 dark:bg-blue-900/10",
  llm_call:       "border-l-amber-500 bg-amber-50 dark:bg-amber-900/10",
  tool_call:      "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/10",
  phase:          "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-900/10",
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TraceViewer({
  endpoint = "http://localhost:9200",
  project = "",
  traceId,
  sessionId,
}: TraceViewerProps) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selected, setSelected] = useState<TraceData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    fetch(`${endpoint}/traces?project=${project}&limit=20`)
      .then((r) => r.json())
      .then((d) => setTraces(d.traces || []))
      .catch(() => {});
  }, [endpoint, project]);

  useEffect(() => {
    fetch(`${endpoint}/stats?project=${project}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [endpoint, project]);

  const loadTrace = (id: string) => {
    setLoading(true);
    fetch(`${endpoint}/traces/${id}`)
      .then((r) => r.json())
      .then((d) => { setSelected(d); setExpanded(new Set(d.spans?.map((s: Span) => s.id))); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4 text-sm animate-fadeIn">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bento p-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Spans</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-200 mt-1">{stats.total_spans}</p>
          </div>
          <div className="bento p-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Tokens</p>
            <p className="text-xl font-bold text-indigo-600 mt-1">{fmtTokens(stats.total_tokens)}</p>
          </div>
          <div className="bento p-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">LLM Calls</p>
            <p className="text-xl font-bold text-amber-600 mt-1">
              {stats.by_kind.find((k) => k.kind === "llm_call")?.c ?? 0}
            </p>
          </div>
          <div className="bento p-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Tool Calls</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">
              {stats.by_kind.find((k) => k.kind === "tool_call")?.c ?? 0}
            </p>
          </div>
        </div>
      )}

      {/* Trace list */}
      <div className="bento">
        <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Recent Traces</h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {traces.map((t) => (
            <button
              key={t.trace_id}
              onClick={() => loadTrace(t.trace_id)}
              className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between ${
                selected?.trace_id === t.trace_id ? "bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{t.session_id || t.trace_id.slice(0, 12)}</p>
                <p className="text-[10px] text-gray-400">{t.span_count} spans · {fmtMs(t.total_duration_ms)}</p>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                {t.start_time ? new Date(t.start_time).toLocaleTimeString() : ""}
              </span>
            </button>
          ))}
          {traces.length === 0 && <p className="text-xs text-gray-400 italic py-4 text-center">暂无追踪数据</p>}
        </div>
      </div>

      {/* Selected trace detail */}
      {loading && (
        <div className="bento text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
        </div>
      )}
      {selected && (
        <div className="bento">
          <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">
            Trace Detail — {selected.span_count} spans
          </h3>
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {selected.spans.map((span) => (
              <div key={span.id}>
                <button
                  onClick={() => toggle(span.id)}
                  className={`w-full text-left border-l-4 rounded-r-lg p-3 transition-colors hover:opacity-80 ${
                    kindColors[span.kind] || kindColors.phase
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{kindIcons[span.kind] || kindIcons.phase}</span>
                    <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                      {span.name || span.kind}
                    </span>
                    {span.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    {span.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    {span.status === "running" && <Clock className="w-3.5 h-3.5 text-gray-400 animate-pulse shrink-0" />}
                    <span className="text-[10px] text-gray-400 font-mono">{fmtMs(span.duration_ms)}</span>
                  </div>
                  {span.error && (
                    <p className="text-[10px] text-red-500 mt-1 ml-6 truncate">{span.error}</p>
                  )}
                </button>
                {expanded.has(span.id) && (
                  <div className="ml-6 pl-4 border-l border-gray-200 dark:border-gray-700 py-2 text-[11px] text-gray-500 space-y-1">
                    {span.metadata.model && (
                      <p>Model: <span className="font-mono text-gray-700">{span.metadata.model}</span></p>
                    )}
                    {span.metadata.input_tokens != null && (
                      <p>Tokens: <span className="font-mono text-gray-700">
                        ↓{span.metadata.input_tokens} ↑{span.metadata.output_tokens ?? "?"}
                      </span></p>
                    )}
                    {span.metadata.tool_name && (
                      <p>Tool: <span className="font-mono text-gray-700">{span.metadata.tool_name}</span></p>
                    )}
                    {span.metadata.tool_input && (
                      <details>
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Input</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded max-h-32 overflow-auto">{span.metadata.tool_input}</pre>
                      </details>
                    )}
                    {span.metadata.tool_output && (
                      <details>
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Output</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded max-h-32 overflow-auto">{span.metadata.tool_output}</pre>
                      </details>
                    )}
                    {span.metadata.response && (
                      <details>
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Response</summary>
                        <pre className="text-[10px] mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded max-h-32 overflow-auto">{span.metadata.response}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { type Span, type TraceData, type TraceSummary, type Stats };
