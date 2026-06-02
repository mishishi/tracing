import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Cpu, Layers, BarChart3, Loader2 } from 'lucide-react';

/* ================================================
   Types
   ================================================ */

interface ModelBreakdown {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

interface ProjectBreakdown {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

interface DayBreakdown {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

interface CostsData {
  total_cost: number;
  total_calls: number;
  currency: string;
  by_model: Record<string, ModelBreakdown>;
  by_project: Record<string, ProjectBreakdown>;
  by_day: DayBreakdown[];
}

/* ================================================
   Helpers
   ================================================ */

function fmtCost(n: number): string {
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtModel(name: string): string {
  const m: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-4.1': 'GPT-4.1',
    'gpt-4.1-mini': 'GPT-4.1 Mini',
    'gpt-4.1-nano': 'GPT-4.1 Nano',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'gpt-5': 'GPT-5',
    'gpt-5-mini': 'GPT-5 Mini',
    'gpt-5-nano': 'GPT-5 Nano',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'claude-4-opus': 'Claude 4 Opus',
    'claude-4-sonnet': 'Claude 4 Sonnet',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'deepseek-v3': 'DeepSeek V3',
    'deepseek-r1': 'DeepSeek R1',
  };
  return m[name] || name;
}

/* ================================================
   CostView Component
   ================================================ */

interface CostViewProps {
  endpoint: string;
  project?: string;
}

export function CostView({ endpoint, project = '' }: CostViewProps) {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCosts = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', '30');

    fetch(endpoint + '/costs?' + params.toString())
      .then((r) => {
        if (r.ok === false) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((d) => {
        if (d && typeof d.total_cost === 'number') {
          setData(d);
          setError('');
        } else {
          setError('数据格式异常');
        }
      })
      .catch(() => setError('获取成本数据失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 30_000);
    return () => clearInterval(interval);
  }, [endpoint, project]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bento text-center py-12">
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!data || data.total_calls === 0) {
    return (
      <div className="bento text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">暂无成本数据</h3>
        <p className="text-sm text-gray-400">追踪到 LLM 调用后将自动生成成本报告。</p>
      </div>
    );
  }

  const models = Object.entries(data.by_model || {});
  const projects = Object.entries(data.by_project || {});
  const maxModelCost = Math.max(...models.map(([, v]) => v.cost), 0.001);
  const maxProjectCost = Math.max(...projects.map(([, v]) => v.cost), 0.001);
  const days = data.by_day || [];
  const maxDayCost = Math.max(...days.map((d) => d.cost), 0.001);

  return (
    <div className="space-y-6">
      {/* ===== Summary Cards ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              总成本
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {fmtCost(data.total_cost)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">近 30 天 · {data.currency}</p>
        </div>

        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              总调用次数
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {data.total_calls.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{Object.keys(data.by_model).length} 个模型</p>
        </div>

        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              日均成本
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {fmtCost(days.length > 0 ? data.total_cost / days.length : 0)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{days.length} 天有活动</p>
        </div>
      </div>

      {/* ===== Per-Model Breakdown ============== */}
      <div className="bento">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">按模型</span>
        </div>
        <div className="space-y-3">
          {models.map(([model, info]) => (
            <div key={model}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {fmtModel(model)}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {fmtCost(info.cost)} · {info.calls} 次 · {fmtTokens(info.input_tokens + info.output_tokens)} tokens
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: Math.max((info.cost / maxModelCost) * 100, 2) + '%' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Per-Project Breakdown ============ */}
      {projects.length > 1 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">按项目</span>
          </div>
          <div className="space-y-3">
            {projects.map(([proj, info]) => (
              <div key={proj}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{proj}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {fmtCost(info.cost)} · {info.calls} 次
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: Math.max((info.cost / maxProjectCost) * 100, 2) + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Daily Trend ====================== */}
      {days.length > 1 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">每日趋势</span>
          </div>
          <div className="flex items-end gap-1 h-32">
            {days.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                <span className="text-[9px] text-gray-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                  {fmtCost(d.cost)}
                </span>
                <div
                  className="w-full rounded-t-sm bg-indigo-400 dark:bg-indigo-500 hover:bg-indigo-500 dark:hover:bg-indigo-400 transition-all min-h-[2px]"
                  style={{ height: Math.max((d.cost / maxDayCost) * 100, 1) + '%' }}
                  title={d.date + ': ' + fmtCost(d.cost)}
                />
                <span className="text-[8px] text-gray-400 mt-1 truncate w-full text-center">
                  {d.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
