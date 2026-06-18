import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface SeriesItem {
  kind: string;
  data: number[];
}

interface DurationHistogramProps {
  endpoint: string;
  project?: string;
}

const kindLabel: Record<string, string> = {
  llm_call: "LLM",
  tool_call: "工具",
  agent: "智能体",
  phase: "阶段",
  flow: "流程",
};

const kindColor: Record<string, string> = {
  llm_call: "#f59e0b",
  tool_call: "#10b981",
  agent: "#6366f1",
  phase: "#4f46e5",
  flow: "#7c3aed",
};

export function DurationHistogram({ endpoint, project = "" }: DurationHistogramProps) {
  const [buckets, setBuckets] = useState<string[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/duration-histogram?" + params.toString())
      .then((r) => r.json())
      .then((d) => {
        setBuckets(d.buckets || []);
        setSeries(d.series || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (buckets.length === 0 || series.length === 0) return null;

  // Transform to Recharts: [{bucket: "<100ms", llm_call: 10, tool_call: 5, ...}, ...]
  const chartData = buckets.map((bucket, bi) => {
    const point: Record<string, string | number> = { bucket };
    series.forEach((s) => {
      point[s.kind] = s.data[bi] || 0;
    });
    return point;
  });

  const total = series.reduce((s, ser) => s + ser.data.reduce((a, b) => a + b, 0), 0);
  const isDark = document.documentElement.classList.contains("dark");

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        <div className="space-y-0.5">
          {payload.map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
              <span className="text-gray-500 dark:text-gray-400">{kindLabel[p.name] || p.name}</span>
              <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">耗时分布</h3>
        <span className="text-[11px] text-gray-400">{total.toLocaleString()} 次</span>
      </div>
      <div style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e5e7eb"} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: isDark ? "#374151" : "#e5e7eb" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span className="text-[11px] text-gray-500">{kindLabel[value] || value}</span>
              )}
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            {series.map((s) => (
              <Bar
                key={s.kind}
                dataKey={s.kind}
                name={s.kind}
                stackId="a"
                fill={kindColor[s.kind] || "#888"}
                radius={[0, 0, 0, 0]}
                barSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
