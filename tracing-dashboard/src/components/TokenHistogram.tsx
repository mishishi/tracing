import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface ModelBreakdown {
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

interface TokenHistogramProps {
  byModel: Record<string, ModelBreakdown>;
}

const modelLabel: Record<string, string> = {
  'gpt-4o': 'GPT-4o', 'gpt-4o-mini': 'GPT-4o Mini', 'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4', 'gpt-4.1': 'GPT-4.1', 'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo', 'gpt-5': 'GPT-5', 'gpt-5-mini': 'GPT-5 Mini',
  'claude-3-opus': 'Claude 3 Opus', 'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
  'claude-4-opus': 'Claude 4 Opus', 'claude-4-sonnet': 'Claude 4 Sonnet',
  'gemini-2.5-pro': 'Gemini 2.5 Pro', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'deepseek-v3': 'DeepSeek V3', 'deepseek-r1': 'DeepSeek R1',
  'deepseek-chat': 'DeepSeek Chat',
  'minimax/MiniMax-M2.7-highspeed': 'MiniMax M2.7',
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

interface ChartData {
  name: string;
  model: string;
  input: number;
  output: number;
  calls: number;
}

export function TokenHistogram({ byModel }: TokenHistogramProps) {
  const models = Object.entries(byModel);
  if (models.length === 0) return null;

  const data: ChartData[] = models.map(([model, v]) => ({
    name: modelLabel[model] || model.split('/').pop() || model,
    model,
    input: v.input_tokens,
    output: v.output_tokens,
    calls: v.calls,
  }));

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    const item = data.find((d) => d.name === label);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-indigo-400" />
            <span className="text-gray-500 dark:text-gray-400">输入</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{fmtTokens(item?.input || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-emerald-400" />
            <span className="text-gray-500 dark:text-gray-400">输出</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{fmtTokens(item?.output || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">调用</span>
            <span className="text-gray-700 dark:text-gray-200 font-mono ml-auto">{item?.calls || 0} 次</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Token 分布</h4>
      </div>

      <div className="w-full" style={{ minHeight: Math.max(data.length * 36, 120) }}>
        <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 140)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={fmtTokens}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(129, 140, 248, 0.06)' }} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="square"
              iconSize={8}
            />
            <Bar dataKey="input" name="输入" stackId="tokens" fill="#818cf8" barSize={16} radius={[0, 0, 4, 4]} />
            <Bar dataKey="output" name="输出" stackId="tokens" fill="#34d399" barSize={16} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
