import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { SkeletonHeatmap } from './Skeleton';
import { Dropdown } from './Dropdown';

interface HeatmapData {
  days: string[];
  kinds: string[];
  matrix: number[][];
  counts: number[][];
}

const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日'];
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

interface TokenHeatmapProps {
  endpoint: string;
  project?: string;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
}

export function TokenHeatmap({ endpoint, project = '' }: TokenHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{
    date: string; tokens: number; calls: number; x: number; y: number;
  } | null>(null);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const fetchData = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('year', String(year));
    fetch(endpoint + '/token-heatmap?' + params.toString())
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 120_000);
    return () => clearInterval(interval);
  }, [endpoint, project, year]);

  if (loading) return <SkeletonHeatmap />;

  if (!data || !data.days || data.days.length === 0) {
    return (
      <div className="bento text-center py-10">
        <Zap className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">暂无 Token 消耗数据</p>
      </div>
    );
  }

  // Build token lookup across all kinds
  const tokenMap: Record<string, number> = {};
  const callMap: Record<string, number> = {};
  if (data.matrix && data.kinds) {
    for (let ki = 0; ki < data.kinds.length; ki++) {
      for (let di = 0; di < data.days.length; di++) {
        const date = data.days[di];
        tokenMap[date] = (tokenMap[date] || 0) + (data.matrix[ki]?.[di] || 0);
        callMap[date] = (callMap[date] || 0) + (data.counts[ki]?.[di] || 0);
      }
    }
  }

  const maxTokens = Math.max(...Object.values(tokenMap), 1);
  const totalTokens = Object.values(tokenMap).reduce((a, b) => a + b, 0);
  const isDark = document.documentElement.classList.contains('dark');

  // Build calendar grid
  const firstDate = new Date(data.days[0] + 'T00:00:00');
  const firstDayOfWeek = firstDate.getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const paddedDays: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) paddedDays.push(null);
  for (const d of data.days) paddedDays.push(d);

  const COL_COUNT = 7;
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < paddedDays.length; i += COL_COUNT) {
    weeks.push(paddedDays.slice(i, i + COL_COUNT));
  }

  // Month label positions
  const monthLabels: { name: string; week: number }[] = [];
  weeks.forEach((week, wi) => {
    for (const day of week) {
      if (day) {
        const d = new Date(day + 'T00:00:00');
        const label = MONTH_NAMES[d.getMonth()];
        const last = monthLabels[monthLabels.length - 1];
        if (!last || last.name !== label) {
          monthLabels.push({ name: label, week: wi });
        }
        break;
      }
    }
  });

  // Color levels
  const getLevel = (tokens: number): number => {
    if (tokens === 0) return -1;
    if (maxTokens <= 1) return 3;
    const ratio = tokens / maxTokens;
    if (ratio < 0.25) return 0;
    if (ratio < 0.5) return 1;
    if (ratio < 0.75) return 2;
    return 3;
  };

  const levelColors: Record<number, string> = isDark
    ? { '-1': 'transparent', '0': 'rgba(99,102,241,0.15)', '1': 'rgba(99,102,241,0.3)', '2': 'rgba(99,102,241,0.55)', '3': 'rgba(129,140,248,0.8)' }
    : { '-1': 'transparent', '0': '#ebedf0', '1': '#c7d2fe', '2': '#818cf8', '3': '#4f46e5' };

  // Year options
  const firstDataYear = new Date(data.days[0] + 'T00:00:00').getFullYear();
  const yearOptions = [];
  for (let y = currentYear; y >= firstDataYear; y--) {
    yearOptions.push({ value: String(y), label: String(y) + '年' });
  }

  const CELL = 12;
  const GAP = 2;
  const ROW_HEIGHT = CELL + GAP;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Token 消耗
          </h3>
        </div>
        <Dropdown
          value={String(year)}
          options={yearOptions}
          onChange={(v) => setYear(Number(v))}
          className="w-24"
        />
      </div>

      <div className="bento py-3 px-2 flex flex-col" style={{ height: 290 }}>
        <div className="flex-1 overflow-x-auto">
          {/* Month labels */}
          <div className="flex mb-1" style={{ paddingLeft: 28 }}>
            {monthLabels.map((m, i) => {
              const nextCol = i + 1 < monthLabels.length ? monthLabels[i + 1].week : weeks.length;
              const span = nextCol - m.week;
              return (
                <div
                  key={i}
                  className="text-[11px] text-gray-400"
                  style={{ flex: span, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {m.name}
                </div>
              );
            })}
          </div>

          <div className="flex">
            {/* Weekday labels */}
            <div className="flex flex-col shrink-0" style={{ width: 28, gap: GAP }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-[10px] text-gray-400 flex items-center justify-end pr-1.5"
                  style={{ height: CELL, lineHeight: CELL + 'px' }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex flex-1" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col flex-1" style={{ gap: GAP }}>
                  {week.map((day, di) => {
                    if (!day) {
                      return <div key={di} style={{ height: CELL, borderRadius: 2 }} />;
                    }
                    const tokens = tokenMap[day] || 0;
                    const calls = callMap[day] || 0;
                    const level = getLevel(tokens);
                    return (
                      <div
                        key={di}
                        className="cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400/50"
                        style={{
                          height: CELL,
                          width: '100%',
                          minWidth: 10,
                          borderRadius: 2,
                          backgroundColor: levelColors[String(level)],
                          outline: tokens === 0 ? '1px solid rgba(128,128,128,0.15)' : 'none',
                        }}
                        onMouseEnter={(e) =>
                          setTooltip({ date: day, tokens, calls, x: e.clientX, y: e.clientY })
                        }
                        onMouseMove={(e) =>
                          setTooltip((prev) =>
                            prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                          )
                        }
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800" style={{ paddingLeft: 28 }}>
            <span className="text-[11px] text-gray-400">少</span>
            {[-1, 0, 1, 2, 3].map((level) => (
              <div
                key={level}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  backgroundColor: levelColors[String(level)],
                  outline: level === -1 ? '1px solid rgba(128,128,128,0.15)' : 'none',
                }}
              />
            ))}
            <span className="text-[11px] text-gray-400">多</span>
            <span className="text-[11px] text-gray-400 ml-auto">
              总计 {fmtTokens(totalTokens)} tokens
            </span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg shadow-xl text-xs"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            left: Math.min(tooltip.x + 12, window.innerWidth - 200),
            top: tooltip.y - 80,
          }}
        >
          <div className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">
            {fmtDate(tooltip.date)}
          </div>
          <div className="flex gap-3 text-gray-500">
            <span>{fmtTokens(tooltip.tokens)} tokens</span>
            {tooltip.calls > 0 && <span>{tooltip.calls} 次调用</span>}
          </div>
        </div>
      )}
    </div>
  );
}
