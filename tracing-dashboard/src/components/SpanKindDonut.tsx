import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface KindStat {
  kind: string;
  c: number;
  total_ms: number;
}

interface SpanKindDonutProps {
  endpoint: string;
  project?: string;
}

const kindLabel: Record<string, string> = {
  flow: "流程",
  agent: "智能体",
  llm_call: "LLM",
  tool_call: "工具",
  phase: "阶段",
};

const kindColor: Record<string, string> = {
  flow: "#7c3aed",
  agent: "#2563eb",
  llm_call: "#d97706",
  tool_call: "#059669",
  phase: "#4f46e5",
};

export function SpanKindDonut({ endpoint, project = "" }: SpanKindDonutProps) {
  const [data, setData] = useState<KindStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/stats?" + params.toString())
      .then((r) => r.json())
      .then((d) => setData(d.by_kind || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={3} />;
  if (data.length === 0) return null;

  const total = data.reduce((s, k) => s + k.c, 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: KindStat }> }) => {
    if (!active || !payload) return null;
    const item = payload[0].payload;
    const pct = ((item.c / total) * 100).toFixed(1);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: kindColor[item.kind] || "#888" }} />
          <span className="font-medium text-gray-700 dark:text-gray-200">{kindLabel[item.kind] || item.kind}</span>
        </div>
        <div className="space-y-0.5 text-gray-500">
          <div className="flex gap-3"><span>数量</span><span className="font-mono text-gray-700 dark:text-gray-300">{item.c.toLocaleString()}</span></div>
          <div className="flex gap-3"><span>占比</span><span className="font-mono text-gray-700 dark:text-gray-300">{pct}%</span></div>
          <div className="flex gap-3"><span>总耗时</span><span className="font-mono text-gray-700 dark:text-gray-300">{Math.round(item.total_ms / 1000)}s</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <PieChartIcon className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Span 类型分布</h3>
        <span className="text-[11px] text-gray-400">{total.toLocaleString()} 个</span>
      </div>
      <div style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="c"
              nameKey="kind"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.kind} fill={kindColor[entry.kind] || "#888"} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span className="text-[11px] text-gray-500">{kindLabel[value] || value}</span>
              )}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
