import { BarChart3 } from 'lucide-react';

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
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function TokenHistogram({ byModel }: TokenHistogramProps) {
  const models = Object.entries(byModel);
  if (models.length === 0) return null;

  const maxTokens = Math.max(...models.map(([, v]) => v.input_tokens + v.output_tokens), 1);
  const barH = 28;
  const chartH = models.length * (barH + 8) + 8;

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Token 分布</h4>
      </div>

      <svg viewBox={`0 0 500 ${chartH}`} className="w-full" style={{ minWidth: 300 }}>
        {models.map(([model, v], i) => {
          const y = i * (barH + 8) + 4;
          const total = v.input_tokens + v.output_tokens;
          const inputW = (v.input_tokens / maxTokens) * 350;
          const outputW = (v.output_tokens / maxTokens) * 350;
          const label = modelLabel[model] || model;

          return (
            <g key={model}>
              {/* Label */}
              <text x={0} y={y + barH / 2 + 4} className="text-[10px] fill-gray-500" fontFamily="Inter" textAnchor="end" width="100">
                <tspan x="100" dy="0">{label}</tspan>
              </text>

              {/* Input token bar */}
              <rect x={108} y={y} width={inputW} height={barH / 2 - 1} rx="2" fill="#818cf8" opacity="0.8" />

              {/* Output token bar */}
              <rect x={108} y={y + barH / 2 + 1} width={outputW} height={barH / 2 - 1} rx="2" fill="#34d399" opacity="0.8" />

              {/* Count label */}
              <text x={108 + Math.max(inputW, outputW) + 8} y={y + barH / 2 + 4} className="text-[9px] fill-gray-400" fontFamily="JetBrains Mono">
                {fmtTokens(total)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-indigo-400 opacity-80" />
          <span className="text-[10px] text-gray-400">输入</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-400 opacity-80" />
          <span className="text-[10px] text-gray-400">输出</span>
        </div>
      </div>
    </div>
  );
}
