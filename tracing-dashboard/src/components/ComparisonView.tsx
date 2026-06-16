import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, DollarSign, Cpu, Zap, Layers, Loader2 } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SkeletonStats, SkeletonBlock } from './Skeleton';

const PROJECT_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#22c55e'];

interface ProjectOption {
  value: string;
  label: string;
  color: string;
}

interface ProjectStats {
  total_cost: number;
  total_calls: number;
  total_tokens: number;
  error_rate: number;
  error_count: number;
  total_spans: number;
  by_day: Array<{ date: string; cost: number; input_tokens: number; output_tokens: number; calls: number; tokens: number }>;
}

interface ComparisonViewProps {
  endpoint: string;
}

function fmtCost(n: number): string {
  if (n >= 1) return '¥' + n.toFixed(2);
  if (n >= 0.01) return '¥' + n.toFixed(4);
  return '¥' + n.toFixed(6);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function ComparisonView({ endpoint }: ComparisonViewProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, ProjectStats>>({});
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<'cost' | 'calls' | 'errors' | 'tokens'>('cost');
  const [period, setPeriod] = useState(30);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; values: Array<{ project: string; value: string; color: string }> } | null>(null);

  // Fetch project list
  useEffect(() => {
    fetch(endpoint + '/projects')
      .then((r) => r.json())
      .then((d) => {
        const list: ProjectOption[] = (d.projects || []).map((p: string, i: number) => ({
          value: p,
          label: p,
          color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        }));
        setProjects(list);
      })
      .catch(() => {});
  }, [endpoint]);

  // Fetch comparison data when projects selected
  useEffect(() => {
    if (selected.length < 2) { setData({}); return; }
    setLoading(true);
    Promise.all(
      selected.map((project) =>
        Promise.all([
          fetch(endpoint + '/costs?project=' + encodeURIComponent(project) + '&days=' + period).then((r) => r.json()),
          fetch(endpoint + '/errors?project=' + encodeURIComponent(project) + '&days=' + period).then((r) => r.json()),
          fetch(endpoint + '/stats?project=' + encodeURIComponent(project)).then((r) => r.json()),
        ]).then(([costs, errors, statsData]) => {
          const stats: ProjectStats = {
            total_cost: costs.total_cost || 0,
            total_calls: costs.total_calls || 0,
            error_rate: errors.error_rate || 0,
            error_count: errors.total_errors || 0,
            total_spans: errors.total_spans || 0,
            total_tokens: (statsData.total_tokens || 0),
            by_day: costs.by_day || [],
          };
          return { project, stats };
        })
      )
    ).then((results) => {
      const map: Record<string, ProjectStats> = {};
      for (const r of results) map[r.project] = r.stats;
      setData(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selected, endpoint, period]);

  const projectOptions = projects.filter((p) => p.value);

  if (projectOptions.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Project Selector */}
      <div className="bento">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">选择对比项目</h4>
          <span className="text-[11px] text-gray-400">（至少选 2 个）</span>
        </div>
        <MultiSelect
          options={projectOptions}
          selected={selected}
          onChange={setSelected}
          placeholder="点击选择要对比的项目..."
          className="max-w-md"
        />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[11px] text-gray-400">时间范围:</span>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ' +
                  (period === d ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-600')}
              >
                {d === 7 ? '7天' : d === 30 ? '30天' : '90天'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonBlock rows={5} />
        </div>
      )}

      {/* Comparison Cards */}
      {!loading && selected.length >= 2 && Object.keys(data).length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {selected.map((project) => {
              const stats = data[project];
              if (!stats) return null;
              const color = projects.find((p) => p.value === project)?.color || '#888';
              return (
                <div key={project} className="bento relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color }} />
                  <div className="pl-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate mb-2" style={{ color }}>{project}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1"><DollarSign className="w-3 h-3" />成本</span>
                        <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{fmtCost(stats.total_cost)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1"><Cpu className="w-3 h-3" />调用</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{fmtNum(stats.total_calls)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3" />Token</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{fmtNum(stats.total_tokens)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />错误率</span>
                        <span className={'font-mono font-medium ' + (stats.error_rate >= 5 ? 'text-red-500' : stats.error_rate > 0 ? 'text-amber-500' : 'text-green-500')}>
                          {stats.error_rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Side-by-side Comparison Table */}
          <div className="bento mt-6">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">指标一览</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">指标</th>
                    {selected.map((p) => {
                      const color = projects.find((pr) => pr.value === p)?.color || '#888';
                      return (
                        <th key={p} className="text-right py-2 px-3 font-medium truncate max-w-[120px]" style={{ color }}>
                          {p}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {[
                    { label: '成本', key: 'total_cost', fmt: (v: number) => fmtCost(v) },
                    { label: 'LLM 调用', key: 'total_calls', fmt: (v: number) => fmtNum(v) },
                    { label: 'Token 用量', key: 'total_tokens', fmt: (v: number) => fmtNum(v) },
                    { label: 'Span 总数', key: 'total_spans', fmt: (v: number) => fmtNum(v) },
                    { label: '错误率', key: 'error_rate', fmt: (v: number) => v + '%' },
                  ].map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 px-3 text-gray-500">{row.label}</td>
                      {selected.map((p) => {
                        const stats = data[p];
                        const val = stats ? (stats as any)[row.key] : 0;
                        return (
                          <td key={p} className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">
                            {row.fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend Chart */}
          <TrendChart
            data={data}
            selected={selected}
            projects={projects}
            metric={metric}
            onMetricChange={setMetric}
            tooltip={tooltip}
            onTooltip={setTooltip}
          />
        </>
      )}

      {!loading && selected.length === 1 && (
        <div className="bento text-center py-8">
          <BarChart3 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">请至少选择 2 个项目进行对比</p>
        </div>
      )}
    </div>
  );
}

/* ================================================
   Trend Chart (SVG)
   ================================================ */

function TrendChart({
  data, selected, projects, metric, onMetricChange, tooltip, onTooltip,
}: {
  data: Record<string, ProjectStats>;
  selected: string[];
  projects: ProjectOption[];
  metric: 'cost' | 'calls' | 'tokens' | 'errors';
  onMetricChange: (m: 'cost' | 'calls' | 'tokens' | 'errors') => void;
  tooltip: { x: number; y: number; values: Array<{ project: string; value: string; color: string }> } | null;
  onTooltip: (t: typeof tooltip) => void;
}) {
  // Collect all unique dates across all projects
  const dateSet = new Set<string>();
  for (const p of selected) {
    for (const d of data[p]?.by_day || []) dateSet.add(d.date);
  }
  const allDays = Array.from(dateSet).sort();

  if (allDays.length === 0) return null;

  // Build series per project
  const getValue = (project: string, date: string) => {
    const day = data[project]?.by_day?.find((d) => d.date === date);
    if (!day) return 0;
    if (metric === 'cost') return day.cost;
    if (metric === 'calls') return day.calls;
    if (metric === 'tokens') return (day.input_tokens || 0) + (day.output_tokens || 0);
    return data[project]?.error_rate || 0;
  };

  const maxVal = Math.max(...selected.flatMap((p) => allDays.map((d) => getValue(p, d))), 1);




  // Build chart data for Recharts: { label, "proj-a": 123, "proj-b": 456 }
  const chartData = allDays.map((date) => {
    const point: Record<string, string | number> = { label: date.slice(5) };
    for (const p of selected) {
      point[p] = getValue(p, date);
    }
    return point;
  });

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        <div className="space-y-0.5">
          {payload.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-500 dark:text-gray-400 truncate max-w-[80px]">{entry.name}</span>
              <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">
                {metric === 'cost' ? fmtCost(entry.value) : fmtNum(Math.round(entry.value))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const metricLabel = { cost: '成本', calls: '调用量', tokens: 'Token', errors: '错误率' };

  return (
    <div className="bento">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">趋势对比</h4>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {(['cost', 'calls', 'tokens', 'errors'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMetricChange(m)}
              className={'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ' +
                (metric === m ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-600')}
            >
              {metricLabel[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {selected.map((p) => {
          const color = projects.find((pr) => pr.value === p)?.color || '#888';
          return (
            <div key={p} className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-gray-500 truncate max-w-[100px]">{p}</span>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="w-full" style={{ minHeight: 200 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v) => metric === 'cost' ? fmtCost(Number(v)) : fmtNum(Math.round(Number(v)))}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconType="line"
              iconSize={10}
            />
            {selected.map((project) => {
              const color = projects.find((pr) => pr.value === project)?.color || '#888';
              return (
                <Line
                  key={project}
                  type="monotone"
                  dataKey={project}
                  name={project}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: color }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
