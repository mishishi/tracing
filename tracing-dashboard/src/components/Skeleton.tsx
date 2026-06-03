/* ================================================
   Skeleton loading placeholders
   ================================================ */

function Bar({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={'skeleton ' + className} style={style} />;
}

/** 3-column stat cards skeleton */
export function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bento">
          <Bar className="w-16 h-3 mb-3" />
          <Bar className="w-24 h-7 mb-2" />
          <Bar className="w-20 h-2" />
        </div>
      ))}
    </div>
  );
}

/** Trace list skeleton */
export function SkeletonTraceList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="trace-item flex items-center gap-3">
          <Bar className="w-5 h-5 rounded" />
          <div className="flex-1 min-w-0">
            <Bar className="w-3/4 h-3 mb-1.5" />
            <Bar className="w-1/2 h-2" />
          </div>
          <Bar className="w-16 h-3 hidden sm:block" />
          <Bar className="w-20 h-3 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Block-level skeleton: title + bars */
export function SkeletonBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bento space-y-3">
      <Bar className="w-24 h-3 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar className="w-12 h-2.5 shrink-0" />
          <Bar className="flex-1 h-2" style={{ width: (70 - i * 15) + '%' }} />
          <Bar className="w-10 h-2 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Heatmap grid skeleton */
export function SkeletonHeatmap() {
  return (
    <div className="bento">
      <Bar className="w-20 h-3 mb-4" />
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            <Bar className="w-12 h-3 shrink-0" />
            {Array.from({ length: 24 }).map((_, j) => (
              <Bar key={j} className="flex-1 h-6 rounded-sm opacity-30" style={{ opacity: 0.15 + Math.random() * 0.15 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
