import { useState, useEffect, useCallback, useRef } from 'react';
import type { TraceSummary, Stats } from '../utils/trace-utils';

interface UseTracesOptions {
  endpoint: string;
  pollInterval?: number;
}

interface UseTracesReturn {
  traces: TraceSummary[];
  filteredTraces: TraceSummary[];
  stats: Stats | null;
  projects: string[];
  loadingList: boolean;
  newTraceCount: number;
  sseConnected: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  projectFilter: string;
  setProjectFilter: (p: string) => void;
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  dismissNotification: () => void;
}

export function useTraces({ endpoint, pollInterval = 5000 }: UseTracesOptions): UseTracesReturn {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [filteredTraces, setFilteredTraces] = useState<TraceSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [newTraceCount, setNewTraceCount] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [page, setPage] = useState(0);

  const prevTraceRef = useRef(0);
  const lastFingerprintRef = useRef('');
  const lastStatsRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    fetch(endpoint + '/traces?limit=200', { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (ac.signal.aborted) return;
        const items: TraceSummary[] = d.traces || [];
        const fp = items.map(t => t.trace_id).slice(0, 5).join(',');
        if (fp === lastFingerprintRef.current) return;
        lastFingerprintRef.current = fp;
        if (items.length > prevTraceRef.current && prevTraceRef.current > 0) {
          setNewTraceCount((c) => c + (items.length - prevTraceRef.current));
        }
        prevTraceRef.current = items.length;
        setTraces(items);
        const p = new Set<string>();
        items.forEach((t: TraceSummary) => { if (t.project) p.add(t.project); });
        setProjects(Array.from(p).sort());
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('Fetch traces failed:', err);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingList(false);
      });

    fetch(endpoint + '/stats', { signal: ac.signal })
      .then((r) => r.json())
      .then((s) => {
        if (ac.signal.aborted) return;
        const sf = JSON.stringify(s);
        if (sf !== lastStatsRef.current) { lastStatsRef.current = sf; setStats(s); }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('Fetch stats failed:', err);
      });
  }, [endpoint]);

  // Defer first fetch
  useEffect(() => {
    const timer = setTimeout(fetchData, 0);
    return () => clearTimeout(timer);
  }, [endpoint]);

  // Polling
  useEffect(() => {
    const i = setInterval(fetchData, pollInterval);
    return () => clearInterval(i);
  }, [fetchData, pollInterval]);

  // SSE
  useEffect(() => {
    const eventsUrl = endpoint + '/events';
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      if (es) { es.close(); es = null; }
      es = new EventSource(eventsUrl);
      es.onopen = () => { if (!cancelled) setSseConnected(true); };
      es.addEventListener('new_trace', () => {
        if (!cancelled) fetchData();
      });
      es.onerror = () => {
        if (!cancelled) {
          setSseConnected(false);
          es?.close();
          es = null;
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (es) { es.close(); es = null; }
    };
  }, [endpoint, fetchData]);

  // Filter traces
  useEffect(() => {
    let result = traces;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.trace_id.toLowerCase().includes(q) ||
          (t.session_id && t.session_id.toLowerCase().includes(q)) ||
          (t.project && t.project.toLowerCase().includes(q))
      );
    }
    if (projectFilter) {
      result = result.filter((t) => t.project === projectFilter);
    }
    setFilteredTraces(result);
    setPage(0);
  }, [traces, searchQuery, projectFilter]);

  const dismissNotification = () => setNewTraceCount(0);

  const totalPages = Math.ceil(filteredTraces.length / 50);

  return {
    traces,
    filteredTraces,
    stats,
    projects,
    loadingList,
    newTraceCount,
    sseConnected,
    searchQuery,
    setSearchQuery,
    projectFilter,
    setProjectFilter,
    page,
    setPage,
    totalPages,
    dismissNotification,
  };
}
