import { EmptyState } from './EmptyState';
import { useState, useEffect } from 'react';
import {
  Layers, BarChart3, DollarSign, AlertTriangle,
  Activity, TrendingUp, Clock,
} from 'lucide-react';
import { SkeletonStats } from './Skeleton';

interface OverviewStats {
  total_spans: number;
  total_tokens: number;
  total_cost: number;
  total_calls: number;
  error_rate: number;
  total_errors: number;
  project_count: number;
}

interface ProjectSummary {
  name: string;
  spans: number;
  cost: number;
  calls: number;
  error_rate: number;
  errors: number;
}

interface RecentTrace {
  trace_id: string;
  session_id: string;
  project: string;
  span_count: number;
  total_duration_ms: number;
  start_time: string;
}

interface OverviewProps {
  endpoint: string;
  onProjectSelect: (project: string) => void;
}

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

function fmtCost(n: number): string {
  if (n >= 1) return '¥' + n.toFixed(2);
  if (n >= 0.01) return '¥' + n.toFixed(4);
  return '¥' + n.toFixed(6);
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Overview({ endpoint, onProjectSelect }: OverviewProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recent, setRecent] = useState<RecentTrace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(endpoint + '/stats').then(r => r.json()),
      fetch(endpoint + '/costs?days=30').then(r => r.json()),
      fetch(endpoint + '/errors?days=30').then(r => r.json()),
      fetch(endpoint + '/projects').then(r => r.json()),
      fetch(endpoint + '/traces?limit=10').then(r => r.json()),
    ]).then(([s, c, e, p, t]) => {
      setStats({
        total_spans: s.total_spans || 0,
        total_tokens: s.total_tokens || 0,
        total_cost: c.total_cost || 0,
        total_calls: c.total_calls || 0,
        error_rate: e.error_rate || 0,
        total_errors: e.total_errors || 0,
        project_count: (p.projects || []).length,
      });

      // Build project summary from costs + errors
      const costByProject: Record<string, { cost: number; calls: number }> = {};
      for (const [name, data] of Object.entries(c.by_project || {})) {
        costByProject[name] = { cost: (data as any).cost || 0, calls: (data as any).calls || 0 };
      }
      const errByProject: Record<string, { rate: number; errors: number; total: number }> = {};
      for (const ep of (e.by_project || [])) {
        errByProject[ep.project] = { rate: ep.rate || 0, errors: ep.errors || 0, total: ep.total || 0 };
      }

      const summary: ProjectSummary[] = (p.projects || []).map((name: string) => ({
        name,
        spans: errByProject[name]?.total || 0,
        cost: costByProject[name]?.cost || 0,
        calls: costByProject[name]?.calls || 0,
        error_rate: errByProject[name]?.rate || 0,
        errors: errByProject[name]?.errors || 0,
      }));
      setProjects(summary);
      setRecent(t.traces || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [endpoint]);

  if (loading) return <SkeletonStats />;

  return (
    <div className="space-y-6 fade-in">
      {/* Hero Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="总 Span"
          value={String(stats?.total_spans ?? 0)}
          color="indigo"
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="总 Token"
          value={fmtTokens(stats?.total_tokens ?? 0)}
          color="amber"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="总成本"
          value={fmtCost(stats?.total_cost ?? 0)}
          color="emerald"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="错误率"
          value={`${(stats?.error_rate ?? 0).toFixed(1)}%`}
          color={((stats?.error_rate ?? 0) > 10) ? "red" : "emerald"}
          sub={stats ? `${stats.total_errors} / ${stats.total_spans}` : ""}
        />
      </div>

      {/* Project Summary Table */}
      <div className="bento">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">项目汇总</h3>
          <span className="text-[11px] text-gray-400 ml-auto">{projects.length} 个项目</span>
        </div>

        {projects.length === 0 ? (
          <EmptyState title="暂无数据" description="等待第一个 Span 上报，或参照下方指引接入 SDK" showQuickStart />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400">
                  <th className="text-left py-2 font-medium">项目</th>
                  <th className="text-right py-2 font-medium">Spans</th>
                  <th className="text-right py-2 font-medium hidden sm:table-cell">调用</th>
                  <th className="text-right py-2 font-medium">成本</th>
                  <th className="text-right py-2 font-medium">错误率</th>
                  <th className="text-right py-2 font-medium hidden sm:table-cell">错误</th>
                </tr>
              </thead>
              <tbody>
                {projects
                  .sort((a, b) => b.spans - a.spans)
                  .map((p) => (
                    <tr
                      key={p.name}
                      onClick={() => onProjectSelect(p.name)}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 font-medium text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#06b6d4"][projects.indexOf(p) % 6] }} />
                          {p.name}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-gray-600 dark:text-gray-400">{p.spans}</td>
                      <td className="py-2.5 text-right font-mono text-gray-500 hidden sm:table-cell">{p.calls}</td>
                      <td className="py-2.5 text-right font-mono text-gray-600 dark:text-gray-400">{fmtCost(p.cost)}</td>
                      <td className="py-2.5 text-right font-mono">
                        <span className={p.error_rate > 10 ? "text-red-500" : p.error_rate > 0 ? "text-amber-500" : "text-emerald-500"}>
                          {p.error_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-gray-400 hidden sm:table-cell">{p.errors}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Traces */}
      {recent.length > 0 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">最近追踪</h3>
          </div>
          <div className="space-y-1">
            {recent.slice(0, 10).map((t) => (
              <div
                key={t.trace_id}
                onClick={() => onProjectSelect(t.project)}
                className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-mono text-gray-400 w-12 shrink-0">{t.trace_id.slice(0, 8)}</span>
                  <span className="tag text-[11px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shrink-0">{t.project}</span>
                  <span className="text-xs text-gray-500 truncate hidden sm:inline">{t.span_count} spans</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-gray-400 font-mono">{fmtMs(t.total_duration_ms)}</span>
                  <span className="text-[11px] text-gray-400 hidden sm:inline">{fmtTime(t.start_time)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  };
  return (
    <div className="bento flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color] || colors.indigo}`}>
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-[11px] text-gray-400">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
