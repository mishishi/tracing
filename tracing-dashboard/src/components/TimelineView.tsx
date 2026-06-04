import { useRef, useState } from 'react';
import type { Span } from './TraceViewer';

const kindColor: Record<string, string> = {
  flow: '#7c3aed', agent: '#2563eb', llm_call: '#d97706',
  tool_call: '#059669', phase: '#4f46e5',
};

const kindLabel: Record<string, string> = {
  flow: '流程', agent: '智能体', llm_call: 'LLM',
  tool_call: '工具', phase: '阶段',
};

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm ' + ((ms % 60000) / 1000).toFixed(0) + 's';
}

interface TimelineViewProps {
  spans: Span[];
}

export function TimelineView({ spans }: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ span: Span; x: number; y: number } | null>(null);

  const sorted = [...spans].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const minTime = Math.min(...spans.map(s => new Date(s.start_time).getTime()));
  const maxTime = Math.max(...spans.map(s => new Date(s.end_time || s.start_time).getTime()));
  const totalMs = maxTime - minTime || 1;

  const BAR_HEIGHT = 26;
  const ROW_GAP = 4;
  const LABEL_W = 160;
  const AXIS_H = 24;

  const tickCount = Math.min(8, Math.max(3, Math.floor(totalMs / 5000)));
  const tickInterval = totalMs / tickCount;

  return (
    <div className="w-full overflow-x-auto" ref={containerRef}>
      <div className="min-w-[600px]">
        {/* Time axis */}
        <div className="flex mb-2" style={{ paddingLeft: LABEL_W }}>
          {Array.from({ length: tickCount + 1 }, (_, i) => (
            <div
              key={i}
              className="text-[9px] text-gray-400 font-mono"
              style={{ position: "absolute" as const, left: i === tickCount ? `calc(${LABEL_W}px + ${((i * tickInterval) / totalMs) * 100}% - 32px)` : `${LABEL_W + ((i * tickInterval) / totalMs) * 100}%`, marginLeft: i === 0 ? 0 : -24 }}
            >
              {fmtMs(i * tickInterval)}
            </div>
          ))}
        </div>

        {/* Bars */}
        <div className="relative" style={{ paddingLeft: LABEL_W }}>
          {/* Grid lines */}
          {Array.from({ length: tickCount + 1 }, (_, i) => (
            <div
              key={`grid-${i}`}
              className="absolute top-0 bottom-0 border-l border-gray-100 dark:border-gray-800"
              style={{ left: `${((i * tickInterval) / totalMs) * 100}%` }}
            />
          ))}

          {/* Span rows */}
          {sorted.map((span, i) => {
            const startMs = new Date(span.start_time).getTime() - minTime;
            const endMs = (new Date(span.end_time || span.start_time).getTime()) - minTime;
            const durationMs = endMs - startMs || 1;
            const leftPct = (startMs / totalMs) * 100;
            const widthPct = Math.max((durationMs / totalMs) * 100, 0.5);
            const indent = (span.parent_id ? 1 : 0) * 16;

            return (
              <div
                key={span.id}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTooltip({ span, x: rect.left, y: rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Label (absolute positioned to the left) */}
                <div
                  className="absolute flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400"
                  style={{
                    left: -LABEL_W + indent,
                    top: i * (BAR_HEIGHT + ROW_GAP),
                    width: LABEL_W - indent - 8,
                    height: BAR_HEIGHT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: kindColor[span.kind] || "#888" }}
                  />
                  {span.name || kindLabel[span.kind] || span.kind}
                </div>

                {/* Bar */}
                <div
                  className="absolute rounded-sm cursor-pointer hover:brightness-110 transition-all"
                  style={{
                    left: `${leftPct}%`,
                    top: i * (BAR_HEIGHT + ROW_GAP),
                    width: `${widthPct}%`,
                    height: BAR_HEIGHT,
                    backgroundColor: kindColor[span.kind] || '#888',
                    opacity: span.parent_id ? 0.85 : 1,
                    minWidth: 3,
                  }}
                >
                  {widthPct > 5 && (
                    <span className="absolute inset-0 flex items-center px-2 text-[9px] text-white font-medium truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                      {fmtMs(durationMs)}
                    </span>
                  )}
                </div>

                {/* Row background */}
                <div
                  className="border-b border-gray-50 dark:border-gray-800/30"
                  style={{
                    height: BAR_HEIGHT + ROW_GAP,
                    top: i * (BAR_HEIGHT + ROW_GAP),
                    position: 'relative',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg shadow-xl text-xs"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: kindColor[tooltip.span.kind] || "#888" }} />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {tooltip.span.name || kindLabel[tooltip.span.kind] || tooltip.span.kind}
            </span>
          </div>
          <div className="space-y-0.5 text-gray-500">
            <div>耗时: <span className="font-mono">{fmtMs(tooltip.span.duration_ms)}</span></div>
            {tooltip.span.metadata?.model && (
              <div>模型: <span className="font-mono">{tooltip.span.metadata.model}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
