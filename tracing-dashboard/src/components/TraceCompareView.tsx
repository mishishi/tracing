import { useMemo } from 'react';
import { ArrowRight, Minus, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fmtMs, fmtTokens, kindLabel, type Span } from '../utils/trace-utils';

interface CompareResult {
  name: string;
  kind: string;
  a: { id: string; duration_ms: number; tokens: number; status: string };
  b: { id: string; duration_ms: number; tokens: number; status: string };
  diff: { duration_ms: number; tokens: number; status_changed: boolean };
}

interface TraceCompareData {
  trace_a: { trace_id: string; span_count: number; total_duration_ms: number };
  trace_b: { trace_id: string; span_count: number; total_duration_ms: number };
  comparisons: CompareResult[];
  only_a: { name: string; kind: string; id: string; duration_ms: number; status: string }[];
  only_b: { name: string; kind: string; id: string; duration_ms: number; status: string }[];
}

interface TraceCompareViewProps {
  data: TraceCompareData;
  onClose: () => void;
}

function DiffBadge({ value, unit = '' }: { value: number; unit?: string }) {
  if (value === 0) return <span className="text-[11px] text-gray-400 font-mono">0{unit}</span>;
  const isUp = value > 0;
  return (
    <span className={'inline-flex items-center gap-0.5 text-[11px] font-mono font-medium ' + (isUp ? 'text-red-500' : 'text-green-500')}>
      {isUp ? <Plus className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
      {Math.abs(value)}{unit}
    </span>
  );
}

export function TraceCompareView({ data, onClose }: TraceCompareViewProps) {
  const { trace_a, trace_b, comparisons, only_a, only_b } = data;

  const totalDiff = trace_b.total_duration_ms - trace_a.total_duration_ms;

  return (
    <div className="bento">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Trace 对比</h3>
          <span className="tag text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500">
            {trace_a.span_count} vs {trace_b.span_count} spans
          </span>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">关闭</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="text-center">
          <p className="text-[11px] text-gray-400 uppercase mb-1">Trace A</p>
          <p className="text-xs font-mono text-gray-600 dark:text-gray-300">{trace_a.trace_id.slice(0, 12)}</p>
          <p className="text-[11px] text-gray-400">{trace_a.span_count} spans · {fmtMs(trace_a.total_duration_ms)}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-gray-400 uppercase mb-1">Trace B</p>
          <p className="text-xs font-mono text-gray-600 dark:text-gray-300">{trace_b.trace_id.slice(0, 12)}</p>
          <p className="text-[11px] text-gray-400">{trace_b.span_count} spans · {fmtMs(trace_b.total_duration_ms)}</p>
        </div>
      </div>

      {/* Total duration diff */}
      <div className="flex items-center justify-center gap-2 mb-4 text-xs">
        <span className="text-gray-400">总耗时差异:</span>
        <DiffBadge value={Math.round(totalDiff)} unit="ms" />
      </div>

      {/* Comparison table */}
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr className="text-[11px] text-gray-400 uppercase">
              <th className="text-left py-1.5 px-2">Span</th>
              <th className="text-right py-1.5 px-2 w-16">A</th>
              <th className="text-right py-1.5 px-2 w-16">B</th>
              <th className="text-right py-1.5 px-2 w-20">差异</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400">{kindLabel[c.kind] || c.kind}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{c.name}</span>
                  </div>
                  {c.diff.status_changed && (
                    <span className="text-[11px] text-amber-500 ml-5">状态变化</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{fmtMs(c.a.duration_ms)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{fmtMs(c.b.duration_ms)}</td>
                <td className="py-1.5 px-2 text-right">
                  <DiffBadge value={Math.round(c.diff.duration_ms)} unit="ms" />
                  {c.diff.tokens !== 0 && (
                    <div className="mt-0.5">
                      <DiffBadge value={c.diff.tokens} unit=" tokens" />
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {/* Only in A */}
            {only_a.map((s, i) => (
              <tr key={'a-' + i} className="border-t border-gray-100 dark:border-gray-800 bg-amber-50/30 dark:bg-amber-900/10">
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-500">仅在 A</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{s.name}</span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{fmtMs(s.duration_ms)}</td>
                <td className="py-1.5 px-2 text-right text-gray-300">—</td>
                <td className="py-1.5 px-2 text-right" />
              </tr>
            ))}

            {/* Only in B */}
            {only_b.map((s, i) => (
              <tr key={'b-' + i} className="border-t border-gray-100 dark:border-gray-800 bg-blue-50/30 dark:bg-blue-900/10">
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-blue-500">仅在 B</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{s.name}</span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right text-gray-300">—</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{fmtMs(s.duration_ms)}</td>
                <td className="py-1.5 px-2 text-right" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
