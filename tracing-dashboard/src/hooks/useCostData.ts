import { useState, useEffect, useRef } from 'react';

export interface ModelBreakdown {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

export interface ProjectBreakdown {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

export interface DayBreakdown {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
}

export interface CostsData {
  total_cost: number;
  total_calls: number;
  currency: string;
  by_model: Record<string, ModelBreakdown>;
  by_project: Record<string, ProjectBreakdown>;
  by_day: DayBreakdown[];
}

interface UseCostDataOptions {
  endpoint: string;
  project?: string;
  pollInterval?: number;
}

interface UseCostDataReturn {
  data: CostsData | null;
  loading: boolean;
  error: string;
  threshold: number;
  setThreshold: (t: number) => void;
  showThreshold: boolean;
  setShowThreshold: (s: boolean) => void;
  thresholdExceeded: boolean;
  refresh: () => void;
}

export function useCostData({
  endpoint,
  project = '',
  pollInterval = 60_000,
}: UseCostDataOptions): UseCostDataReturn {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [threshold, setThresholdState] = useState<number>(() => {
    const stored = localStorage.getItem('tracing-dashboard-cost-threshold');
    return stored ? Number(stored) : 0;
  });
  const [showThreshold, setShowThreshold] = useState(false);

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
    const interval = setInterval(fetchCosts, pollInterval);
    return () => clearInterval(interval);
  }, [endpoint, project, pollInterval]);

  const setThreshold = (t: number) => {
    setThresholdState(t);
    localStorage.setItem('tracing-dashboard-cost-threshold', String(t));
  };

  const thresholdExceeded = threshold > 0 && data !== null && data.total_cost >= threshold;

  return {
    data,
    loading,
    error,
    threshold,
    setThreshold,
    showThreshold,
    setShowThreshold,
    thresholdExceeded,
    refresh: fetchCosts,
  };
}
