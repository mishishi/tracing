import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';

interface DayData {
  day: string;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
}

interface TrendData {
  agent: DayData[];
  llm_call: DayData[];
  tool_call: DayData[];
}

const kindLabel: Record<string, string> = {
  agent: '智能体', llm_call: 'LLM', tool_call: '工具',
};

const lineColors: Record<string, string> = {
  p50: '#22c55e', p95: '#f59e0b', p99: '#ef4444',
};

interface PercentileTrendProps {
  endpoint: string;
  project?: string;
}

export function PercentileTrend({ endpoint, project = '' }: PercentileTrendProps) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKind, setActiveKind] = useState('llm_call');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: string; p50: number; p95: number; p99: number } | null>(null);

  const fetchData = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', '30');
    fetch(endpoint + '/percentiles-trend?' + params.toString())
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;

  const currentDays: DayData[] = data?.[activeKind as keyof TrendData] || [];
  if (currentDays.length === 0) {
    return (
      <div className="bento text-center py-8">
        <TrendingUp className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-xs text-gray-400">暂无延迟趋势数据</p>
      </div>
    );
  }

  const maxMs = Math.max(...currentDays.flatMap((d: DayData) => [d.p99, d.p95, d.p50]), 1);
  const W = 600; const H = 200; const P = { top: 10, right: 10, bottom: 24, left: 48 };
  const plotW = W - P.left - P.right;
  const plotH = H - P.top - P.bottom;

  const xScale = (i: number) => P.left + (i / Math.max(currentDays.length - 1, 1)) * plotW;
  const yScale = (ms: number) => P.top + plotH - (ms / maxMs) * plotH;

  const fmtMs = (ms: number) => {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return Math.round(ms) + 'ms';
  };

  const kindKeys = ['llm_call', 'agent', 'tool_call'] as const;
  const lineNames = ['p99', 'p95', 'p50'] as const;

  // Build SVG paths
  const paths: Record<string, string> = {};
  for (const line of lineNames) {
    paths[line] = currentDays.map((d: DayData, i: number) =>
      (i === 0 ? 'M' : 'L') + xScale(i) + ',' + yScale(d[line])
    ).join(' ');
  }

  return (
    <div className="bento">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">延迟趋势</h4>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {kindKeys.map((k) => (
            <button
              key={k}
              onClick={() => setActiveKind(k)}
              className={
                'px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ' +
                (activeKind === k
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600')
              }
            >
              {kindLabel[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        {lineNames.map((l) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: lineColors[l] }} />
            <span className="text-[10px] text-gray-400 uppercase">{l}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = yScale(maxMs * ratio);
            return (
              <g key={ratio}>
                <line x1={P.left} y1={y} x2={W - P.right} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                <text x={P.left - 4} y={y + 3} textAnchor="end" className="text-[8px] fill-gray-400" fontFamily="JetBrains Mono">
                  {fmtMs(maxMs * ratio)}
                </text>
              </g>
            );
          })}

          {/* Lines */}
          {lineNames.map((l) => (
            <path key={l} d={paths[l]} fill="none" stroke={lineColors[l]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* Invisible hover areas */}
          {currentDays.map((d: DayData, i: number) => (
            <rect
              key={d.day}
              x={xScale(i) - (plotW / currentDays.length / 2)}
              y={P.top}
              width={plotW / currentDays.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ x: xScale(i), y: P.top, day: d.day, p50: d.p50, p95: d.p95, p99: d.p99 })}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <line x1={tooltip.x} y1={P.top} x2={tooltip.x} y2={P.top + plotH} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,2" />
              <rect
                x={tooltip.x > W / 2 ? tooltip.x - 120 : tooltip.x + 8}
                y={tooltip.y + 4}
                width="110"
                height="52"
                rx="6"
                fill="var(--surface)"
                stroke="var(--border)"
              />
              <text x={tooltip.x > W / 2 ? tooltip.x - 112 : tooltip.x + 16} y={tooltip.y + 18} className="text-[9px] fill-gray-500" fontFamily="Inter">
                {tooltip.day.slice(5)}
              </text>
              <text x={tooltip.x > W / 2 ? tooltip.x - 112 : tooltip.x + 16} y={tooltip.y + 32} className="text-[9px] fill-green-500" fontFamily="JetBrains Mono">
                P50 {fmtMs(tooltip.p50)}
              </text>
              <text x={tooltip.x > W / 2 ? tooltip.x - 112 : tooltip.x + 16} y={tooltip.y + 44} className="text-[9px] fill-amber-500" fontFamily="JetBrains Mono">
                P95 {fmtMs(tooltip.p95)}
              </text>
              <text x={tooltip.x > W / 2 ? tooltip.x - 54 : tooltip.x + 74} y={tooltip.y + 44} className="text-[9px] fill-red-500" fontFamily="JetBrains Mono">
                P99 {fmtMs(tooltip.p99)}
              </text>
            </g>
          )}

          {/* X axis labels (sparse) */}
          {currentDays.filter((_: DayData, i: number) => i % Math.max(1, Math.floor(currentDays.length / 6)) === 0 || i === currentDays.length - 1).map((d: DayData) => {
            const i = currentDays.indexOf(d);
            return (
              <text
                key={d.day}
                x={xScale(i)}
                y={H - 4}
                textAnchor="middle"
                className="text-[8px] fill-gray-400"
                fontFamily="Inter"
              >
                {d.day.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
