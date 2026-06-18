import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Bar, ComposedChart } from "recharts";
import { TrendingDown } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface ErrorPoint {
  day: string;
  total: number;
  errors: number;
  rate: number;
}

interface ErrorTrendChartProps {
  endpoint: string;
  project?: string;
}

export function ErrorTrendChart({ endpoint, project = "" }: ErrorTrendChartProps) {
  const [points, setPoints] = useState<ErrorPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/error-trend?" + params.toString())
      .then((r) => r.json())
      .then((d) => setPoints(d.points || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (points.length === 0) return null;

  const chartData = points.map((p) => ({
    ...p,
    label: p.day.slice(5),
  }));

  const maxRate = Math.max(...points.map((p) => p.rate), 1);
  const maxTotal = Math.max(...points.map((p) => p.total), 1);
  const isDark = document.documentElement.classList.contains("dark");

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) => {
    if (!active || !payload) return null;
    const dayData = points.find((p) => p.day.slice(5) === label);
    if (!dayData) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        <div className="space-y-0.5 text-gray-500">
          <div className="flex gap-3"><span>调用</span><span className="font-mono text-gray-700 dark:text-gray-300">{dayData.total}</span></div>
          <div className="flex gap-3"><span>错误</span><span className="font-mono text-red-500">{dayData.errors}</span></div>
          <div className="flex gap-3"><span>错误率</span><span className="font-mono text-gray-700 dark:text-gray-300">{dayData.rate}%</span></div>
        </div>
      </div>
    );
  };

  const errorColor = "#ef4444";
  const barColor = isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)";

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">错误趋势</h3>
        <span className="text-[11px] text-gray-400">每日错误率</span>
      </div>
      <div style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e5e7eb"} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: isDark ? "#374151" : "#e5e7eb" }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="rate"
              orientation="left"
              tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v + "%"}
              domain={[0, Math.max(maxRate * 1.3, 5)]}
              width={36}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, "auto"]}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="line"
              iconSize={10}
            />
            <Bar
              yAxisId="count"
              dataKey="total"
              name="调用量"
              fill={barColor}
              barSize={16}
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="rate"
              name="错误率"
              stroke={errorColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: errorColor, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
