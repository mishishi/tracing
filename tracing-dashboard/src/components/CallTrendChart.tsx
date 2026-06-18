import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { SkeletonHeatmap } from './Skeleton';
import { Dropdown } from './Dropdown';

interface TrendData {
  days: string[];
  kinds: string[];
  series: { kind: string; data: number[] }[];
}

const kindLabel: Record<string, string> = {
  llm_call: 'LLM',
  tool_call: '工具',
  agent: '智能体',
};

const kindColor: Record<string, string> = {
  llm_call: '#f59e0b',
  tool_call: '#10b981',
  agent: '#6366f1',
};

const kindColorDark: Record<string, string> = {
  llm_call: '#fbbf24',
  tool_call: '#34d399',
  agent: '#818cf8',
};

interface CallTrendChartProps {
  endpoint: string;
  project?: string;
}

function shortDate(iso: string): string {
  const parts = iso.split('-');
  return parts[1] + '/' + parts[2];
}

export function CallTrendChart({ endpoint, project = '' }: CallTrendChartProps) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', String(days));
    fetch(endpoint + '/call-trend?' + params.toString())
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
        <TrendingUp className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">暂无调用数据</p>
      </div>
    );
  }

  // Transform to Recharts format: [{ date: '06/15', llm_call: 5, tool_call: 3, agent: 2 }, ...]
  const chartData = data.days.map((d, i) => {
    const point: Record<string, string | number> = { date: shortDate(d) };
    data.series.forEach((s) => {
      point[s.kind] = s.data[i] || 0;
    });
    return point;
  });

  const totalCalls = data.series.reduce((sum, s) => sum + s.data.reduce((a, b) => a + b, 0), 0);
  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">调用趋势</h3>
          <span className="text-[11px] text-gray-400">过去 {days} 天 · {totalCalls} 次</span>
        </div>
        <Dropdown
          value={String(days)}
          options={[
            { value: '7', label: '最近 7 天' },
            { value: '30', label: '最近 30 天' },
            { value: '90', label: '最近 90 天' },
          ]}
          onChange={(v) => setDays(Number(v))}
          className="w-32"
        />
      </div>

      <div className="bento py-3">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              {data.kinds.map((kind) => (
                <linearGradient key={kind} id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isDark ? kindColorDark[kind] : kindColor[kind]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isDark ? kindColorDark[kind] : kindColor[kind]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: isDark ? '#374151' : '#e5e7eb' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: isDark ? '#1f2937' : '#ffffff',
                border: '1px solid ' + (isDark ? '#374151' : '#e5e7eb'),
                borderRadius: 8,
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
              labelStyle={{ color: isDark ? '#d1d5db' : '#374151', fontWeight: 600 }}
            />
            <Legend
              formatter={(value: string) => kindLabel[value] || value}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {data.kinds.map((kind) => (
              <Area
                key={kind}
                type="monotone"
                dataKey={kind}
                name={kind}
                stroke={isDark ? kindColorDark[kind] : kindColor[kind]}
                fill={`url(#fill-${kind})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
