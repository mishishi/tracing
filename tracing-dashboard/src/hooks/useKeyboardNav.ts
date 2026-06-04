import { useEffect } from 'react';
import type { TraceData, TraceSummary } from '../utils/trace-utils';

interface UseKeyboardNavOptions {
  selected: TraceData | null;
  filteredTraces: TraceSummary[];
  setSelected: (t: TraceData | null) => void;
  setSelectedSpanId: (id: string | null) => void;
  loadTrace: (id: string) => void;
}

export function useKeyboardNav({
  selected,
  filteredTraces,
  setSelected,
  setSelectedSpanId,
  loadTrace,
}: UseKeyboardNavOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setSelected(null);
        setSelectedSpanId(null);
      }

      if (!selected || filteredTraces.length < 2) return;

      const idx = filteredTraces.findIndex((t) => t.trace_id === selected.trace_id);
      if (idx === -1) return;

      if (e.key === 'ArrowUp' || (e.key === 'k' && e.ctrlKey)) {
        e.preventDefault();
        const prev = filteredTraces[(idx - 1 + filteredTraces.length) % filteredTraces.length];
        if (prev) loadTrace(prev.trace_id);
      }
      if (e.key === 'ArrowDown' || (e.key === 'j' && e.ctrlKey)) {
        e.preventDefault();
        const next = filteredTraces[(idx + 1) % filteredTraces.length];
        if (next) loadTrace(next.trace_id);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, filteredTraces, setSelected, setSelectedSpanId, loadTrace]);
}
