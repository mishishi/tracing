import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

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

function fmtMs(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

export function PercentileTrend({ endpoint, project = '' }: PercentileTrendProps) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKind, setActiveKind] = useState('llm_call');

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

  const kindKeys = ['llm_call', 'agent', 'tool_call'] as const;

  const chartData = currentDays.map((d) => ({
    ...d,
    label: d.day.slice(5),
  }));

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    const dayData = currentDays.find((d) => d.day.slice(5) === label);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors.p50 }} />
            <span className="text-gray-500 dark:text-gray-400">P50</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{fmtMs(dayData?.p50 || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors.p95 }} />
            <span className="text-gray-500 dark:text-gray-400">P95</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{fmtMs(dayData?.p95 || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors.p99 }} />
            <span className="text-gray-500 dark:text-gray-400">P99</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{fmtMs(dayData?.p99 || 0)}</span>
          </div>
          {dayData && (
            <div className="flex items-center gap-2 pt-0.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-gray-400">调用</span>
              <span className="text-gray-600 dark:text-gray-300 font-mono ml-auto">{dayData.count} 次</span>
            </div>
          )}
        </div>
      </div>
    );
  };

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
              tickFormatter={fmtMs}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="line"
              iconSize={10}
            />
            <Line
              type="monotone"
              dataKey="p99"
              name="P99"
              stroke={lineColors.p99}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: lineColors.p99 }}
            />
            <Line
              type="monotone"
              dataKey="p95"
              name="P95"
              stroke={lineColors.p95}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: lineColors.p95 }}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="P50"
              stroke={lineColors.p50}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: lineColors.p50 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}