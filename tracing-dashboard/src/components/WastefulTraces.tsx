import { useState, useEffect } from "react";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface WastefulTrace {
  trace_id: string;
  name: string;
  project: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  ratio: number;
  waste_score: number;
  reasons: string[];
  start_time: string;
}

interface WastefulTracesProps {
  endpoint: string;
  project?: string;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
      " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export function WastefulTraces({ endpoint, project = "" }: WastefulTracesProps) {
  const [traces, setTraces] = useState<WastefulTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/traces/wasteful?" + params.toString())
      .then((r) => r.json())
      .then((d) => { setTraces(d.traces || []); setTotal(d.total_wasteful || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={3} />;
  if (traces.length === 0) return null;

  const maxScore = Math.max(...traces.map((t) => t.waste_score), 1);

  return (
    <div className="bento">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Token 浪费检测</h3>
          <span className="tag bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            {total} 条
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {expanded ? "收起" : "展开"}
        </button>
      </div>
      {expanded && (
        <div className="space-y-2">
          {traces.slice(0, 10).map((t) => (
            <div key={t.trace_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <code className="text-xs font-mono text-indigo-500">{t.trace_id.slice(0, 12)}</code>
                  {t.project && <span className="tag bg-gray-100 dark:bg-gray-700 text-gray-500">{t.project}</span>}
                </div>
                <div className="text-[11px] text-gray-400 truncate">{t.name.slice(0, 60)}...</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {t.reasons.map((r, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-px rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-amber-600 dark:text-amber-400">
                  {fmtMs(t.duration_ms)}
                </div>
                <div className="text-[10px] text-gray-400">{fmtTime(t.start_time)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
