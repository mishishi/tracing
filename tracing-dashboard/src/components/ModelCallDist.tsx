import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Cpu } from "lucide-react";

interface ModelEntry {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

interface ModelCallDistProps {
  byModel: Record<string, ModelEntry>;
}

const MODEL_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6",
  "#06b6d4", "#f97316", "#14b8a6", "#e11d48", "#84cc16",
  "#a855f7", "#0ea5e9", "#d946ef", "#22c55e", "#eab308",
];

function fmtModel(name: string): string {
  const m: Record<string, string> = {
    "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4.1": "GPT-4.1", "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-5.5": "GPT-5.5", "deepseek-chat": "DeepSeek Chat",
    "deepseek-v3": "DeepSeek V3", "deepseek-r1": "DeepSeek R1",
    "claude-3.5-sonnet": "Claude 3.5 Sonnet", "claude-4-sonnet": "Claude 4 Sonnet",
    "gemini-2.5-pro": "Gemini 2.5 Pro", "gemini-2.5-flash": "Gemini 2.5 Flash",
  };
  return m[name] || name.split("/").pop() || name;
}

export function ModelCallDist({ byModel }: ModelCallDistProps) {
  const models = Object.entries(byModel);
  if (models.length === 0) return null;

  const totalCalls = models.reduce((s, [, v]) => s + v.calls, 0);
  const topModels = models.sort((a, b) => b[1].calls - a[1].calls);

  const chartData = topModels.map(([model, info]) => ({
    name: model,
    label: fmtModel(model),
    calls: info.calls,
    cost: info.cost,
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string; label: string; calls: number; cost: number } }> }) => {
    if (!active || !payload) return null;
    const item = payload[0].payload;
    const pct = ((item.calls / totalCalls) * 100).toFixed(1);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">{item.label}</p>
        <div className="space-y-0.5 text-gray-500">
          <div className="flex gap-3"><span>调用</span><span className="font-mono text-gray-700 dark:text-gray-300">{item.calls} 次 ({pct}%)</span></div>
          <div className="flex gap-3"><span>成本</span><span className="font-mono text-gray-700 dark:text-gray-300">¥{item.cost.toFixed(4)}</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">模型调用分布</h3>
        <span className="text-[11px] text-gray-400">{totalCalls} 次</span>
      </div>
      <div style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="calls"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span className="text-[11px] text-gray-500">{fmtModel(value)}</span>
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
