import { useState } from 'react';
import { DollarSign, TrendingUp, Cpu, Layers, BarChart3, Bell, BellRing } from 'lucide-react';
import { SkeletonStats, SkeletonBlock } from './Skeleton';
import { TokenHistogram } from './TokenHistogram';
import { ModelCallDist } from './ModelCallDist';
import { useCostData, type CostsData, type ModelBreakdown, type ProjectBreakdown } from '../hooks/useCostData';

function fmtCost(n: number): string {
  if (n >= 1) return '¥' + n.toFixed(2);
  if (n >= 0.01) return '¥' + n.toFixed(4);
  return '¥' + n.toFixed(6);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtModel(name: string): string {
  const m: Record<string, string> = {
    'gpt-4o': 'GPT-4o', 'gpt-4o-mini': 'GPT-4o Mini', 'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4': 'GPT-4', 'gpt-4.1': 'GPT-4.1', 'gpt-4.1-mini': 'GPT-4.1 Mini',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo', 'gpt-5': 'GPT-5', 'gpt-5-mini': 'GPT-5 Mini',
    'claude-3-opus': 'Claude 3 Opus', 'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'claude-4-opus': 'Claude 4 Opus', 'claude-4-sonnet': 'Claude 4 Sonnet',
    'gemini-2.5-pro': 'Gemini 2.5 Pro', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'deepseek-v3': 'DeepSeek V3', 'deepseek-r1': 'DeepSeek R1',
  };
  return m[name] || name;
}

interface CostViewProps { endpoint: string; project?: string; }

export function CostView({ endpoint, project = '' }: CostViewProps) {
  const {
    data, loading, error,
    threshold, setThreshold,
    showThreshold, setShowThreshold,
    thresholdExceeded, refresh,
  } = useCostData({ endpoint, project });

  const [trendMode, setTrendMode] = useState<'cost' | 'tokens'>('cost');
  const [showQuota, setShowQuota] = useState(false);
  const [quota, setQuota] = useState<number>(() => Number(localStorage.getItem('tracing-quota') || 0));

  if (loading) return <div className="space-y-6"><SkeletonStats /><SkeletonBlock rows={5} /><SkeletonBlock rows={3} /></div>;

  if (error && !data) return <div className="bento text-center py-12"><p className="text-sm text-gray-400">{error}</p></div>;

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
  const maxDayTokens = Math.max(...days.map((d) => d.input_tokens + d.output_tokens), 1);

  return (
    <div className="space-y-6">
      {/* Threshold Alert */}
      {thresholdExceeded && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 animate-fade-in">
          <BellRing className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">成本告警</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              总成本 {fmtCost(data.total_cost)} 已超过设定的阈值 {fmtCost(threshold)}
            </p>
          </div>
          <button onClick={() => setThreshold(0)} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 underline shrink-0">忽略</button>
        </div>
      )}

      {/* Threshold Settings */}
      {showThreshold && (
        <div className="bento animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-gray-400" />
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">成本阈值设置</h4>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">超过此金额时提醒（人民币）:</label>
            <input type="number" min="0" step="0.1" value={threshold || ''}
              onChange={(e) => setThreshold(Number(e.target.value))} placeholder="例: 10"
              className="w-24 px-3 py-1.5 text-sm rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-gray-400" />
            {threshold > 0 && (
              <button onClick={() => setThreshold(0)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">清除</button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">设为 0 或留空可关闭告警。设置保存在本地浏览器中。</p>
        </div>
      )}

      {/* Summary Cards */}
            {/* Quota Bar */}
      {data && (
        <div className="bento mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">本月配额</h4>
            <button onClick={() => setShowQuota(!showQuota)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">{showQuota ? '收起' : '设置'}</button>
          </div>
          {showQuota && (
            <div className="flex items-center gap-2 mb-2">
              <input type="number" min="0" step="1" value={quota || ''} onChange={(e) => { const v = Number(e.target.value); setQuota(v); localStorage.setItem('tracing-quota', String(v)); }} placeholder="月度配额..." className="w-24 px-2 py-1 text-xs rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" />
              <span className="text-[11px] text-gray-400">元 / 月</span>
            </div>
          )}
          {quota > 0 && (
            <>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={'h-full rounded-full transition-all ' + (data.total_cost / quota > 0.9 ? 'bg-red-500' : data.total_cost / quota > 0.7 ? 'bg-amber-500' : 'bg-indigo-500')} style={{ width: Math.min((data.total_cost / quota) * 100, 100) + '%' }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[11px] text-gray-400">已用 {fmtCost(data.total_cost)}</span>
                <span className="text-[11px] text-gray-400">剩余 {fmtCost(Math.max(0, quota - data.total_cost))}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">总成本</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCost(data.total_cost)}</p>
          <p className="text-[11px] text-gray-400 mt-1">{data.total_calls} 次调用</p>
        </div>
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">项目数</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{projects.length}</p>
        </div>
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">模型数</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{models.length}</p>
        </div>
      </div>

      {/* Threshold Settings Button */}
      <button onClick={() => setShowThreshold(!showThreshold)}
        className={'p-2 text-sm rounded-lg transition-all ' + (showThreshold ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-400 hover:text-gray-600')}
        aria-label="成本阈值设置" title="成本阈值设置">
        <Bell className="w-4 h-4" />
      </button>

      {/* Per-Model Breakdown */}
      {models.length > 0 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">按模型</span>
          </div>
          <div className="space-y-3">
            {models.map(([model, info]) => (
              <div key={model}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{fmtModel(model)}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {fmtCost(info.cost)} · {info.calls} 次 · {fmtTokens(info.input_tokens + info.output_tokens)} tokens
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: Math.max((info.cost / maxModelCost) * 100, 2) + '%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Project Breakdown */}
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
                  <span className="text-xs text-gray-500 tabular-nums">{fmtCost(info.cost)} · {info.calls} 次</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: Math.max((info.cost / maxProjectCost) * 100, 2) + '%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token Histogram */}
      {models.length > 0 && <TokenHistogram byModel={data.by_model} />}

      {/* Daily Trend */}
      {days.length > 1 && (
        <div className="bento">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">每日趋势</span>
            </div>
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <button onClick={() => setTrendMode('cost')}
                className={'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ' + (trendMode === 'cost' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>费用</button>
              <button onClick={() => setTrendMode('tokens')}
                className={'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ' + (trendMode === 'tokens' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>Token</button>
            </div>
          </div>
          <div className="flex items-end gap-1 h-32">
            {days.map((d) => {
              const val = trendMode === 'cost' ? d.cost : (d.input_tokens + d.output_tokens);
              const maxVal = trendMode === 'cost' ? maxDayCost : maxDayTokens;
              const displayVal = trendMode === 'cost' ? fmtCost(d.cost) : fmtTokens(d.input_tokens + d.output_tokens);
              const barColor = trendMode === 'cost'
                ? 'bg-indigo-400 dark:bg-indigo-500 hover:bg-indigo-500 dark:hover:bg-indigo-400'
                : 'bg-emerald-400 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400';
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <span className="text-[11px] text-gray-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{displayVal}</span>
                  <div className={'w-full rounded-t-sm transition-all min-h-[2px] ' + barColor}
                    style={{ height: Math.max((val / maxVal) * 100, 1) + '%' }} title={d.date + ': ' + displayVal} />
                  <span className="text-[8px] text-gray-400 mt-1 truncate w-full text-center">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

