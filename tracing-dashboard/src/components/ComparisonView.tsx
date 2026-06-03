import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, DollarSign, Cpu, Layers, Loader2 } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
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
  error_rate: number;
  error_count: number;
  total_spans: number;
  by_day: Array<{ date: string; cost: number; input_tokens: number; output_tokens: number; calls: number }>;
}

interface ComparisonViewProps {
  endpoint: string;
}

function fmtCost(n: number): string {
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
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
  const [metric, setMetric] = useState<'cost' | 'calls' | 'errors'>('cost');
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
          fetch(endpoint + '/costs?project=' + project + '&days=30').then((r) => r.json()),
          fetch(endpoint + '/errors?project=' + project + '&days=30').then((r) => r.json()),
        ]).then(([costs, errors]) => {
          const stats: ProjectStats = {
            total_cost: costs.total_cost || 0,
            total_calls: costs.total_calls || 0,
            error_rate: errors.error_rate || 0,
            error_count: errors.total_errors || 0,
            total_spans: errors.total_spans || 0,
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
  }, [selected, endpoint]);

  const projectOptions = projects.filter((p) => p.value);

  if (projectOptions.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Project Selector */}
      <div className="bento">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">选择对比项目</h4>
          <span className="text-[10px] text-gray-400">（至少选 2 个）</span>
        </div>
        <MultiSelect
          options={projectOptions}
          selected={selected}
          onChange={setSelected}
          placeholder="点击选择要对比的项目..."
          className="max-w-md"
        />
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
  metric: 'cost' | 'calls' | 'errors';
  onMetricChange: (m: 'cost' | 'calls' | 'errors') => void;
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
    return data[project]?.error_rate || 0;
  };

  const maxVal = Math.max(...selected.flatMap((p) => allDays.map((d) => getValue(p, d))), 1);

  const W = 600; const H = 220;
  const P = { top: 16, right: 16, bottom: 28, left: 54 };
  const plotW = W - P.left - P.right;
  const plotH = H - P.top - P.bottom;

  const xScale = (i: number) => P.left + (i / Math.max(allDays.length - 1, 1)) * plotW;
  const yScale = (val: number) => P.top + plotH - (val / maxVal) * plotH;

  const metricLabel = { cost: '成本', calls: '调用量', errors: '错误率' };

  return (
    <div className="bento">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">趋势对比</h4>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {(['cost', 'calls', 'errors'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMetricChange(m)}
              className={'px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ' +
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
              <span className="text-[10px] text-gray-500 truncate max-w-[100px]">{p}</span>
            </div>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = yScale(maxVal * ratio);
          return (
            <g key={ratio}>
              <line x1={P.left} y1={y} x2={W - P.right} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={P.left - 4} y={y + 3} textAnchor="end" className="text-[8px] fill-gray-400" fontFamily="JetBrains Mono">
                {metric === 'cost' ? fmtCost(maxVal * ratio) : fmtNum(Math.round(maxVal * ratio))}
              </text>
            </g>
          );
        })}

        {/* Lines per project */}
        {selected.map((project) => {
          const color = projects.find((pr) => pr.value === project)?.color || '#888';
          const pathD = allDays.map((d, i) => {
            const val = getValue(project, d);
            return (i === 0 ? 'M' : 'L') + xScale(i) + ',' + yScale(val);
          }).join(' ');
          return (
            <path key={project} d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          );
        })}

        {/* Hover areas */}
        {allDays.map((day, i) => (
          <rect
            key={day}
            x={xScale(i) - (plotW / allDays.length / 2)}
            y={P.top}
            width={plotW / allDays.length}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => {
              const values = selected.map((p) => {
                const color = projects.find((pr) => pr.value === p)?.color || '#888';
                const val = getValue(p, day);
                return { project: p, value: metric === 'cost' ? fmtCost(val) : String(Math.round(val)), color };
              });
              onTooltip({ x: xScale(i), y: P.top, values });
            }}
            onMouseLeave={() => onTooltip(null)}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={P.top} x2={tooltip.x} y2={P.top + plotH} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,2" />
            <rect
              x={tooltip.x > W / 2 ? tooltip.x - 140 : tooltip.x + 8}
              y={tooltip.y + 4}
              width="130"
              height={12 + tooltip.values.length * 16}
              rx="6"
              fill="var(--surface)"
              stroke="var(--border)"
            />
            {tooltip.values.map((v, i) => (
              <g key={v.project}>
                <circle cx={tooltip.x > W / 2 ? tooltip.x - 132 : tooltip.x + 16} cy={tooltip.y + 18 + i * 16} r="3" fill={v.color} />
                <text x={tooltip.x > W / 2 ? tooltip.x - 125 : tooltip.x + 23} y={tooltip.y + 21 + i * 16} className="text-[9px] fill-gray-500" fontFamily="Inter">
                  {v.project}: {v.value}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* X axis labels */}
        {allDays.filter((_, i) => i % Math.max(1, Math.floor(allDays.length / 6)) === 0 || i === allDays.length - 1).map((day) => {
          const i = allDays.indexOf(day);
          return (
            <text key={day} x={xScale(i)} y={H - 4} textAnchor="middle" className="text-[8px] fill-gray-400" fontFamily="Inter">
              {day.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
