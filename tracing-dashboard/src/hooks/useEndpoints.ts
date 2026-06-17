import { useState, useCallback } from 'react';

export interface EndpointConfig {
  id: string;
  name: string;
  url: string;
}

const STORAGE_KEY = 'tracing-dashboard-endpoints';

function loadEndpoints(): EndpointConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const defaultUrl = import.meta.env.VITE_TRACING_BASE || 'http://localhost:9200'; return [{ id: 'default', name: '本地服务', url: defaultUrl }];
}

function saveEndpoints(endpoints: EndpointConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
}

export function useEndpoints() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>(loadEndpoints);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const stored = localStorage.getItem('tracing-dashboard-selected-endpoint');
    return stored || 'default';
  });

  const persist = (eps: EndpointConfig[]) => {
    saveEndpoints(eps);
    setEndpoints(eps);
  };

  const updateEndpoint = useCallback((id: string, field: 'name' | 'url', value: string) => {
    setEndpoints((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, [field]: value } : e));
      saveEndpoints(next);
      return next;
    });
  }, []);

  const addEndpoint = useCallback(() => {
    setEndpoints((prev) => {
      const next = [...prev, { id: Date.now().toString(), name: '新服务', url: 'http://localhost:9200' }];
      saveEndpoints(next);
      return next;
    });
  }, []);

  const removeEndpoint = useCallback((id: string) => {
    setEndpoints((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEndpoints(next);
      if (selectedId === id && next.length > 0) {
        setSelectedId(next[0].id);
        localStorage.setItem('tracing-dashboard-selected-endpoint', next[0].id);
      }
      return next;
    });
  }, [selectedId]);

  const selectEndpoint = (id: string) => {
    setSelectedId(id);
    localStorage.setItem('tracing-dashboard-selected-endpoint', id);
  };

  const selected = endpoints.find((e) => e.id === selectedId) || endpoints[0];

  return {
    endpoints,
    selected,
    selectedId,
    selectEndpoint,
    updateEndpoint,
    addEndpoint,
    removeEndpoint,
  };
}
