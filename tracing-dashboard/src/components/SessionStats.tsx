import { useState, useEffect } from "react";
import { Users, Layers, Clock, AlertCircle } from "lucide-react";
import { SkeletonStats } from "./Skeleton";

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

interface SessionStatsProps {
  endpoint: string;
  project?: string;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
}

export function SessionStats({ endpoint, project = "" }: SessionStatsProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/sessions?" + params.toString())
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonStats />;
  if (sessions.length === 0) return null;

  const totalTraces = sessions.reduce((s, x) => s + x.trace_count, 0);
  const totalSpans = sessions.reduce((s, x) => s + x.span_count, 0);
  const totalErrors = sessions.reduce((s, x) => s + x.error_count, 0);
  const avgDurationMs = sessions.length > 0
    ? sessions.reduce((s, x) => s + x.total_duration_ms, 0) / sessions.length
    : 0;

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Session 统计</h3>
        <span className="text-[11px] text-gray-400">{sessions.length} 个 Session</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <Layers className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{totalTraces}</p>
          <p className="text-[11px] text-gray-400">Trace</p>
        </div>
        <div className="stat-card">
          <Layers className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{totalSpans.toLocaleString()}</p>
          <p className="text-[11px] text-gray-400">Span</p>
        </div>
        <div className="stat-card">
          <Clock className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtMs(avgDurationMs)}</p>
          <p className="text-[11px] text-gray-400">Session 平均耗时</p>
        </div>
        <div className="stat-card">
          <AlertCircle className={`w-4 h-4 mx-auto mb-1 ${totalErrors > 0 ? "text-red-400" : "text-gray-400"}`} />
          <p className={`text-lg font-bold ${totalErrors > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>{totalErrors}</p>
          <p className="text-[11px] text-gray-400">错误</p>
        </div>
      </div>
    </div>
  );
}
