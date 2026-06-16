import { useState, useEffect } from 'react';
import { Clock, Zap } from 'lucide-react';
import { SkeletonHeatmap } from './Skeleton';
import { Dropdown } from './Dropdown';

interface HeatmapData {
  hours: number[];
  kinds: string[];
  matrix: number[][];
  counts: number[][];
}

const kindLabel: Record<string, string> = {
  flow: '流程',
  agent: '智能体',
  llm_call: 'LLM',
  tool_call: '工具',
  phase: '阶段',
};

const kindColor: Record<string, string> = {
  flow: '#7c3aed',
  agent: '#2563eb',
  llm_call: '#d97706',
  tool_call: '#059669',
  phase: '#4f46e5',
};

interface LatencyHeatmapProps {
  endpoint: string;
  project?: string;
}

export function LatencyHeatmap({ endpoint, project = '' }: LatencyHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ kind: string; hour: number; avgMs: number; count: number } | null>(null);
  const [days, setDays] = useState(7);

  const fetchData = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', String(days));
    fetch(endpoint + '/latency-heatmap?' + params.toString())
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

  if (loading) {
    return <SkeletonHeatmap />;
  }

  if (!data || data.kinds.length === 0) {
    return (
      <div className="bento text-center py-12">
        <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">暂无延迟数据</h3>
        <p className="text-sm text-gray-400">追踪到有耗时的 Span 后将自动展示热力图。</p>
      </div>
    );
  }

  const maxAvg = Math.max(...data.matrix.flat().filter((v) => v > 0), 1);

  const isDark = document.documentElement.classList.contains('dark');

  const getHeatColor = (avgMs: number) => {
    if (avgMs === 0) return 'transparent';
    const ratio = Math.min(avgMs / maxAvg, 1);
    if (isDark) {
      // Dark mode: more saturated, higher contrast against dark bg
      if (ratio < 0.33) {
        const g = Math.round(80 + 120 * (ratio / 0.33));
        return `rgb(100, ${g}, 30)`;
      } else if (ratio < 0.66) {
        const r = Math.round(100 + 120 * ((ratio - 0.33) / 0.33));
        return `rgb(${r}, 100, 25)`;
      } else {
        const g = Math.round(100 - 60 * ((ratio - 0.66) / 0.34));
        return `rgb(220, ${g}, 20)`;
      }
    } else {
      // Light mode: softer, more pastel
      if (ratio < 0.33) {
        const g = Math.round(200 + 55 * (ratio / 0.33));
        return `rgb(180, ${g}, 70)`;
      } else if (ratio < 0.66) {
        const r = Math.round(180 + 55 * ((ratio - 0.33) / 0.33));
        return `rgb(${r}, 150, 50)`;
      } else {
        const g = Math.round(150 - 90 * ((ratio - 0.66) / 0.34));
        return `rgb(235, ${g}, 40)`;
      }
    }
  };

  const fmtMs = (ms: number) => {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return Math.round(ms) + 'ms';
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">延迟热力图</h3>
        </div>
        <Dropdown
          value={String(days)}
          options={[
            { value: '1', label: '最近 1 天' },
            { value: '3', label: '最近 3 天' },
            { value: '7', label: '最近 7 天' },
            { value: '30', label: '最近 30 天' },
          ]}
          onChange={(v) => setDays(Number(v))}
          className="w-32"
        />
      </div>

      {/* Heatmap Grid */}
      <div className="bento overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header row: hour labels */}
          <div className="flex mb-1">
            <div className="w-16 shrink-0" />
            {data.hours.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[11px] text-gray-400 font-mono"
                title={`${h}:00 - ${h}:59`}
              >
                {h}时
              </div>
            ))}
          </div>

          {/* Kind rows */}
          {data.kinds.map((kind, ki) => (
            <div key={kind} className="flex items-center mb-0.5">
              {/* Kind label */}
              <div
                className="w-16 shrink-0 flex items-center gap-1.5 pr-2"
                title={kind}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: kindColor[kind] || '#888' }}
                />
                <span className="text-[11px] sm:text-[11px] text-gray-500 truncate w-8 sm:w-auto">
                  {kindLabel[kind] || kind}
                </span>
              </div>

              {/* Hour cells */}
              {data.hours.map((h) => {
                const avgMs = data.matrix[ki][h] || 0;
                const count = data.counts[ki][h] || 0;
                const hasData = avgMs > 0;

                return (
                  <div
                    key={h}
                    className="flex-1 h-5 sm:h-7 rounded-sm cursor-default transition-opacity hover:opacity-80 relative"
                    style={{
                      backgroundColor: hasData ? getHeatColor(avgMs) : 'var(--surface)',
                      border: hasData ? 'none' : '1px solid var(--border)',
                    }}
                    onMouseEnter={() =>
                      hasData && setTooltip({ kind, hour: h, avgMs, count })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    title={hasData ? `${kindLabel[kind] || kind} ${h}:00 - 平均 ${fmtMs(avgMs)}, ${count} 次` : ''}
                  />
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[11px] text-gray-400">快</span>
            <div className="flex h-3 rounded-full overflow-hidden" style={{ width: 120 }}>
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgb(100, 170, 30)' : 'rgb(180, 220, 70)' }} />
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgb(180, 120, 25)' : 'rgb(220, 160, 50)' }} />
              <div className="flex-1" style={{ backgroundColor: isDark ? 'rgb(220, 60, 20)' : 'rgb(235, 70, 40)' }} />
            </div>
            <span className="text-[11px] text-gray-400">慢</span>
            <span className="text-[11px] text-gray-400 ml-auto">
              最大: {fmtMs(maxAvg)}
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
            left: '50%',
            bottom: 80,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: kindColor[tooltip.kind] || '#888' }}
            />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {kindLabel[tooltip.kind] || tooltip.kind}
            </span>
            <span className="text-gray-400">
              {tooltip.hour}:00 - {tooltip.hour}:59
            </span>
          </div>
          <div className="flex gap-3 text-gray-500">
            <span>平均 {fmtMs(tooltip.avgMs)}</span>
            <span>{tooltip.count} 次调用</span>
          </div>
        </div>
      )}
    </div>
  );
}
