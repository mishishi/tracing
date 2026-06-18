import { useState, useEffect } from 'react';
import { Coins, Zap } from 'lucide-react';
import { SkeletonHeatmap } from './Skeleton';
import { Dropdown } from './Dropdown';

interface HeatmapData {
  days: string[];
  kinds: string[];
  matrix: number[][];
  counts: number[][];
}

const kindLabel: Record<string, string> = {
  llm_call: 'LLM',
  tool_call: '工具',
  agent: '智能体',
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

interface TokenHeatmapProps {
  endpoint: string;
  project?: string;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function TokenHeatmap({ endpoint, project = '' }: TokenHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ date: string; tokens: number; calls: number; x: number; y: number } | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', String(days));
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
  }, [endpoint, project, days]);

  if (loading) return <SkeletonHeatmap />;

  if (!data || !data.days || data.days.length === 0) {
    return (
      <div className="bento text-center py-10">
        <Coins className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">暂无 Token 消耗数据</p>
      </div>
    );
  }

  // Build calendar grid: group days into weeks
  const firstDate = new Date(data.days[0] + 'T00:00:00');
  const startDayOfWeek = firstDate.getDay();
  const offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const paddedDays: (string | null)[] = [];
  for (let i = 0; i < offset; i++) paddedDays.push(null);
  for (const d of data.days) paddedDays.push(d);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7));
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
  const isDark = document.documentElement.classList.contains('dark');

  const getColor = (tokens: number) => {
    if (tokens === 0) return 'transparent';
    const ratio = Math.min(tokens / maxTokens, 1);
    if (isDark) {
      if (ratio < 0.25) return 'rgba(99, 102, 241, 0.2)';
      if (ratio < 0.5) return 'rgba(99, 102, 241, 0.4)';
      if (ratio < 0.75) return 'rgba(99, 102, 241, 0.65)';
      return 'rgba(129, 140, 248, 0.9)';
    } else {
      if (ratio < 0.25) return '#e0e7ff';
      if (ratio < 0.5) return '#c7d2fe';
      if (ratio < 0.75) return '#a5b4fc';
      return '#818cf8';
    }
  };

  // Month labels for column headers
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, wi) => {
    for (const day of week) {
      if (day) {
        const d = new Date(day + 'T00:00:00');
        const monthStr = (d.getMonth() + 1) + '月';
        const last = monthLabels[monthLabels.length - 1];
        if (!last || last.label !== monthStr) {
          monthLabels.push({ label: monthStr, col: wi });
        }
        break;
      }
    }
  });

  const totalTokens = Object.values(tokenMap).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Token 消耗热力图</h3>
          <span className="text-[11px] text-gray-400">过去 {days} 天</span>
        </div>
        <Dropdown
          value={String(days)}
          options={[
            { value: '14', label: '最近 14 天' },
            { value: '30', label: '最近 30 天' },
            { value: '90', label: '最近 90 天' },
            { value: '180', label: '最近 180 天' },
          ]}
          onChange={(v) => setDays(Number(v))}
          className="w-32"
        />
      </div>

      <div className="bento overflow-x-auto py-3">
        <div className="min-w-[500px]">
          {/* Month header row */}
          <div className="flex mb-2" style={{ paddingLeft: 28 }}>
            {monthLabels.map((m, i) => {
              const prevCol = i > 0 ? monthLabels[i - 1].col : 0;
              const width = m.col - prevCol;
              return (
                <div
                  key={i}
                  className="text-[11px] text-gray-400"
                  style={{ flex: width }}
                >
                  {m.label}
                </div>
              );
            })}
          </div>

          <div className="flex">
            {/* Weekday labels */}
            <div className="flex flex-col gap-1 mr-2" style={{ width: 24 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="h-5 flex items-center text-[10px] text-gray-400 justify-end pr-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex gap-1 flex-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1 flex-1">
                  {week.map((day, di) => {
                    if (!day) {
                      return <div key={di} className="flex-1 h-5 rounded-sm" />;
                    }
                    const tokens = tokenMap[day] || 0;
                    const calls = callMap[day] || 0;
                    return (
                      <div
                        key={di}
                        className="flex-1 h-5 rounded-sm cursor-default transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: getColor(tokens),
                          border: tokens === 0 ? '1px solid var(--border)' : 'none',
                        }}
                        onMouseEnter={(e) =>
                          setTooltip({ date: day, tokens, calls, x: e.clientX, y: e.clientY })
                        }
                        onMouseMove={(e) =>
                          setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                        }
                        onMouseLeave={() => setTooltip(null)}
                        title={tokens > 0 ? day.slice(5) + ' - ' + fmtTokens(tokens) + ' tokens, ' + calls + ' calls' : ''}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800" style={{ paddingLeft: 28 }}>
            <span className="text-[11px] text-gray-400">少</span>
            <div className="flex h-3 rounded-full overflow-hidden" style={{ width: 100 }}>
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff' }} />
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgba(99,102,241,0.4)' : '#c7d2fe' }} />
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgba(99,102,241,0.65)' : '#a5b4fc' }} />
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgba(129,140,248,0.9)' : '#818cf8' }} />
            </div>
            <span className="text-[11px] text-gray-400">多</span>
            <span className="text-[11px] text-gray-400 ml-auto">
              总计: {fmtTokens(totalTokens)}
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
            top: tooltip.y - 70,
          }}
        >
          <div className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">
            {tooltip.date}
          </div>
          <div className="flex gap-3 text-gray-500">
            <span>{fmtTokens(tooltip.tokens)} tokens</span>
            <span>{tooltip.calls} 次调用</span>
          </div>
        </div>
      )}
    </div>
  );
}
