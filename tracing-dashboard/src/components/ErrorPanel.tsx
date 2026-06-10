import { useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, BarChart3, TrendingDown, ExternalLink } from 'lucide-react';
import { SkeletonStats, SkeletonBlock } from './Skeleton';
import { useNotification } from '../hooks/useNotification';

interface KindError {
  kind: string;
  total: number;
  errors: number;
  rate: number;
}

interface ProjectError {
  project: string;
  total: number;
  errors: number;
  rate: number;
}

interface RecentError {
  id: string;
  name: string;
  kind: string;
  project: string;
  error: string;
  start_time: string;
  trace_id: string;
  session_id: string;
}

interface ErrorStats {
  total_spans: number;
  total_errors: number;
  error_rate: number;
  by_kind: KindError[];
  by_project: ProjectError[];
  recent_errors: RecentError[];
}

const kindLabel: Record<string, string> = {
  flow: '流程', agent: '智能体', llm_call: 'LLM', tool_call: '工具', phase: '阶段',
};

interface ErrorPanelProps {
  endpoint: string;
  project?: string;
  onNavigateToTrace?: (traceId: string) => void;
}

export function ErrorPanel({ endpoint, project = '', onNavigateToTrace }: ErrorPanelProps) {
  const [data, setData] = useState<ErrorStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchErrors = () => {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    params.set('days', '30');

    fetch(endpoint + '/errors?' + params.toString())
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const notify = useNotification();
  const lastNotifiedRef = useRef(0);

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 60_000);
    return () => clearInterval(interval);
  }, [endpoint, project]);

  // Notify on high error rate
  useEffect(() => {
    if (!data || data.total_spans === 0) return;
    if (data.error_rate >= 5) {
      const now = Date.now();
      // Only notify once per 10 minutes
      if (now - lastNotifiedRef.current > 600_000) {
        lastNotifiedRef.current = now;
        notify(
          '错误率告警',
          `错误率 ${data.error_rate}%，共 ${data.total_errors} 个错误 (${data.total_spans} 次调用)`,
          'error-rate'
        );
      }
    }
  }, [data, notify]);

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonStats />
        <SkeletonBlock rows={4} />
        <SkeletonBlock rows={3} />
      </div>
    );
  }

  if (!data || data.total_spans === 0) {
    return (
      <div className="bento text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">暂无数据</h3>
        <p className="text-sm text-gray-400">追踪到 Span 后将自动统计错误率。</p>
      </div>
    );
  }

  const getRateColor = (rate: number) => {
    if (rate === 0) return 'text-green-600 dark:text-green-400';
    if (rate < 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBarColor = (rate: number) => {
    if (rate === 0) return 'bg-green-400';
    if (rate < 5) return 'bg-amber-400';
    return 'bg-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">总错误数</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{data.total_errors}</p>
          <p className="text-[10px] text-gray-400 mt-1">近 30 天</p>
        </div>
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-indigo-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">错误率</span>
          </div>
          <p className={'text-2xl font-bold tabular-nums ' + getRateColor(data.error_rate)}>
            {data.error_rate}%
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{data.total_spans.toLocaleString()} 次 Span</p>
        </div>
        <div className="bento">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">高危类型</span>
          </div>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
            {data.by_kind[0] ? kindLabel[data.by_kind[0].kind] || data.by_kind[0].kind : '-'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {data.by_kind[0] ? data.by_kind[0].errors + ' 个错误' : ''}
          </p>
        </div>
      </div>

      {/* By Kind */}
      {data.by_kind.length > 0 && (
        <div className="bento">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">按类型错误率</h4>
          <div className="space-y-2">
            {data.by_kind.map((k) => (
              <div key={k.kind} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 shrink-0">{kindLabel[k.kind] || k.kind}</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={'h-full rounded-full transition-all ' + getBarColor(k.rate)}
                    style={{ width: Math.max(k.rate, 1) + '%' }}
                  />
                </div>
                <span className={'text-xs font-mono w-14 text-right tabular-nums ' + getRateColor(k.rate)}>
                  {k.rate}%
                </span>
                <span className="text-[10px] text-gray-400 w-16 text-right">{k.errors}/{k.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Project */}
      {data.by_project.length > 1 && (
        <div className="bento">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">按项目错误率</h4>
          <div className="space-y-2">
            {data.by_project.map((p) => (
              <div key={p.project} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0 truncate">{p.project}</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={'h-full rounded-full transition-all ' + getBarColor(p.rate)}
                    style={{ width: Math.max(p.rate, 1) + '%' }}
                  />
                </div>
                <span className={'text-xs font-mono w-14 text-right tabular-nums ' + getRateColor(p.rate)}>
                  {p.rate}%
                </span>
                <span className="text-[10px] text-gray-400 w-16 text-right">{p.errors}/{p.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {data.recent_errors.length > 0 && (
        <div className="bento">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">最近错误 ({data.recent_errors.length})</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {data.recent_errors.map((e) => (
              <div
                key={e.id}
                onClick={() => { if (e.trace_id) onNavigateToTrace?.(e.trace_id); }}
                className={'flex items-start gap-3 p-2 rounded-lg transition-colors ' +
                  (e.trace_id ? 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')}
                title={e.trace_id ? '点击查看 Trace: ' + e.trace_id : ''}
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{e.name}</span>
                    <span className="tag text-[9px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shrink-0">
                      {kindLabel[e.kind] || e.kind}
                    </span>
                  </div>
                  <p className="text-[10px] text-red-500 mt-0.5 truncate">{e.error}</p>
                  {e.trace_id && (
                    <p className="text-[9px] text-gray-400 mt-0.5 font-mono truncate flex items-center gap-1">
                      <ExternalLink className="w-2.5 h-2.5" />{e.trace_id.slice(0, 16)}...
                    </p>
                  )}
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{e.start_time?.slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
