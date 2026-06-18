import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface ErrorTypeItem {
  type: string;
  count: number;
}

interface ErrorTypePieChartProps {
  endpoint: string;
  project?: string;
}

const ERROR_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1",
  "#14b8a6", "#f43f5e", "#a855f7", "#78716c",
];

export function ErrorTypePieChart({ endpoint, project = "" }: ErrorTypePieChartProps) {
  const [types, setTypes] = useState<ErrorTypeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/errors/by-type?" + params.toString())
      .then((r) => r.json())
      .then((d) => setTypes(d.types || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={3} />;
  if (types.length === 0) return null;

  const total = types.reduce((s, t) => s + t.count, 0);

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">错误类型分布</h3>
      </div>
      <div className="flex items-start gap-6">
        <div className="w-48 h-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={types}
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={80}
                dataKey="count" nameKey="type"
              >
                {types.map((_, i) => (
                  <Cell key={i} fill={ERROR_COLORS[i % ERROR_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v + "次", "发生次数"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {types.map((t, i) => (
            <div key={t.type} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ERROR_COLORS[i % ERROR_COLORS.length] }} />
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{t.type}</span>
              <span className="text-xs font-mono text-gray-400">{t.count}</span>
              <span className="text-[11px] text-gray-400 w-10 text-right">{(t.count / total * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
