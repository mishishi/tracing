import { useState, useEffect, useCallback, createContext, useContext, Component } from 'react';

/* ================================================
   Error Boundary
   ================================================ */

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
          <div className="bento text-center py-12 max-w-md">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">页面出错</h3>
            <p className="text-sm text-gray-500 mb-4 font-mono">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import {
  BarChart3, Server, RefreshCw, DollarSign,
  Wifi, WifiOff, ChevronDown, Globe, Check, Copy, Plus, Trash2, Sun, Moon, AlertTriangle, Minimize2, Maximize2, Share2, FileDown, Layers,
} from 'lucide-react';
import { TraceViewer } from './components/TraceViewer';
import { CostView } from './components/CostView';
import { ErrorPanel } from './components/ErrorPanel';
import { LatencyHeatmap } from './components/LatencyHeatmap';
import { PercentileTrend } from './components/PercentileTrend';
import { ComparisonView } from './components/ComparisonView';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { exportToPdf } from './utils/exportPdf';

/* ================================================
   Theme Context
   ================================================ */

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('tracing-dashboard-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('tracing-dashboard-theme', theme);
  }, [theme]);

  // Listen for system theme changes when user hasn't set an explicit preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('tracing-dashboard-theme');
      if (!stored) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/* ================================================
   Constants
   ================================================ */

const STORAGE_KEY = 'tracing-dashboard-endpoints';
const SELECTED_KEY = 'tracing-dashboard-selected';

interface EndpointConfig {
  id: string;
  name: string;
  url: string;
}

const DEFAULT_ENDPOINTS: EndpointConfig[] = [
  { id: 'local', name: 'local', url: 'http://localhost:9200' },
];

/* ================================================
   App
   ================================================ */

function AppInner() {
  const { theme, toggleTheme } = useTheme();

  const [endpoints, setEndpoints] = useState<EndpointConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_ENDPOINTS;
  });

  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(SELECTED_KEY) || 'local';
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'traces' | 'costs' | 'errors' | 'compare'>('traces');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sharedTraceId, setSharedTraceId] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    const stored = localStorage.getItem('tracing-dashboard-density');
    return stored === 'compact' ? 'compact' : 'comfortable';
  });
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const selected = endpoints.find((e) => e.id === selectedId) || endpoints[0];
  const endpoint = selected.url;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
  }, [endpoints]);

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, selectedId);
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint + '/health')
      .then((r) => r.json())
      .then(() => { if (!cancelled) setHealthOk(true); })
      .catch(() => { if (!cancelled) setHealthOk(false); });
    return () => { cancelled = true; };
  }, [endpoint, tick]);

  // Apply density mode
  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem('tracing-dashboard-density', density);
  }, [density]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen((prev) => !prev); return; }
      if (e.key === 'Escape') { setShortcutsOpen(false); setSettingsOpen(false); return; }
      if (e.key === '1') { setActiveTab('traces'); return; }
      if (e.key === '2') { setActiveTab('costs'); return; }
      if (e.key === '3') { setActiveTab('errors'); return; }
      if (e.key === '4') { setActiveTab('compare'); return; }
      if (e.key === 'r' || e.key === 'R') { setTick((t) => t + 1); return; }
      if (e.key === 'd' || e.key === 'D') { setDensity((d) => d === 'compact' ? 'comfortable' : 'compact'); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load shared trace from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;
    fetch(endpoint + '/s/' + shareId)
      .then((r) => r.json())
      .then((data) => {
        if (data.trace_id) {
          setActiveTab('traces');
          setSharedTraceId(data.trace_id);
        }
      })
      .catch(() => {});
  }, [endpoint]);

  const updateEndpoint = useCallback((id: string, field: 'name' | 'url', value: string) => {
    setEndpoints((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  }, []);

  const addEndpoint = useCallback(() => {
    const id = Date.now().toString(36);
    setEndpoints((prev) => [...prev, { id, name: 'new-server', url: 'http://localhost:9200' }]);
    setSelectedId(id);
  }, []);

  const removeEndpoint = useCallback((id: string) => {
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) {
      setSelectedId(endpoints[0]?.id || '');
    }
  }, [selectedId, endpoints]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ===== Header (idea-lab style) ============ */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
                追踪面板
              </h1>
              <p className="hidden sm:block text-xs text-gray-500 -mt-0.5">Agent 可观测性平台</p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {/* Health */}
            <span
              className="text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1.5"
              style={{
                background: healthOk === true ? 'var(--success-light)' : healthOk === false ? 'var(--danger-light)' : 'transparent',
                color: healthOk === true ? 'var(--success)' : healthOk === false ? 'var(--danger)' : 'var(--text-muted)',
              }}
            >
              {healthOk === true && <><Wifi className="w-3 h-3" /><span className="hidden sm:inline">已连接</span></>}
              {healthOk === false && <><WifiOff className="w-3 h-3" /><span className="hidden sm:inline">未连接</span></>}
              {healthOk === null && <><WifiOff className="w-3 h-3" /><span className="hidden sm:inline">检测中</span></>}
            </span>

            {/* Refresh */}
            <button
              onClick={() => setTick((t) => t + 1)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="刷新数据"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Server selector */}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
              aria-expanded={settingsOpen}
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline max-w-[100px] truncate">{selected.name}</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: settingsOpen ? 'rotate(180deg)' : undefined }}
              />
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => exportToPdf('dashboard-main', 'tracing-dashboard-' + new Date().toISOString().slice(0, 10) + '.pdf')}
              className="hidden sm:block p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="导出 PDF"
              title="导出 PDF"
            >
              <FileDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDensity((d) => d === 'compact' ? 'comfortable' : 'compact')}
              className={
                'hidden sm:block p-2 rounded-lg transition-all ' +
                (density === 'compact'
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')
              }
              aria-label={density === 'compact' ? '切换到舒适密度' : '切换到紧凑密度'}
              title={density === 'compact' ? '舒适密度' : '紧凑密度'}
            >
              {density === 'compact' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden sm:block w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 ml-1" />
          </div>
        </div>

        {/* ===== Settings Panel =================== */}
        {settingsOpen && (
          <div className="border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60 px-4 sm:px-6 py-4 animate-slide-up">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5" />
                  追踪服务器
                </h3>
                <button
                  onClick={addEndpoint}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加服务器
                </button>
              </div>

              <div className="space-y-2">
                {endpoints.map((ep) => (
                  <div
                    key={ep.id}
                    className={'flex items-center gap-3 p-3 rounded-lg transition-all ' +
                      (selectedId === ep.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
                        : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent')
                    }
                  >
                    <button
                      onClick={() => { setSelectedId(ep.id); setSettingsOpen(false); }}
                      className={
                        'shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ' +
                        (selectedId === ep.id
                          ? 'border-indigo-600 bg-indigo-600'
                          : 'border-gray-300 dark:border-gray-600')
                      }
                      aria-label={'选择 ' + ep.name}
                    >
                      {selectedId === ep.id && <Check className="w-3 h-3 text-white" />}
                    </button>

                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={ep.name}
                        onChange={(e) => updateEndpoint(ep.id, 'name', e.target.value)}
                        className="sm:w-36 px-3 py-1.5 text-sm rounded-lg border bg-white dark:bg-gray-800
                                   border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100
                                   focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                                   placeholder-gray-400"
                        placeholder="名称"
                        aria-label="服务器名称"
                      />
                      <input
                        type="text"
                        value={ep.url}
                        onChange={(e) => updateEndpoint(ep.id, 'url', e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border bg-white dark:bg-gray-800
                                   border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100
                                   focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                                   placeholder-gray-400"
                        placeholder="http://localhost:9200"
                        aria-label="服务器地址"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyToClipboard(ep.url)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        aria-label="复制地址"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {endpoints.length > 1 && (
                        <button
                          onClick={() => removeEndpoint(ep.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label={'移除 ' + ep.name}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-gray-400">
                配置自动保存到本地浏览器。切换服务器后页面数据将自动刷新。
              </p>
            </div>
          </div>
        )}
      </header>

      {/* ===== Main =============================== */}
      <main id="dashboard-main" className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('traces')}
            className={
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ' +
              (activeTab === 'traces'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
            }
          >
            <BarChart3 className="w-4 h-4" />
            追踪
          </button>
          <button
            onClick={() => setActiveTab('costs')}
            className={
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ' +
              (activeTab === 'costs'
                ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
            }
          >
            <DollarSign className="w-4 h-4" />
            成本
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ' +
              (activeTab === 'errors'
                ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
            }
          >
            <AlertTriangle className="w-4 h-4" />
            错误
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ' +
              (activeTab === 'compare'
                ? 'bg-white dark:bg-gray-700 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
            }
          >
            <Layers className="w-4 h-4" />
            对比
          </button>
        </div>

        {activeTab === 'traces' && (
          <div className="space-y-6">
            <LatencyHeatmap endpoint={endpoint} />
            <PercentileTrend endpoint={endpoint} />
            <TraceViewer endpoint={endpoint} initialTraceId={sharedTraceId} />
          </div>
        )}
        {activeTab === 'costs' && <CostView endpoint={endpoint} />}
        {activeTab === 'errors' && <ErrorPanel endpoint={endpoint} />}
        {activeTab === 'compare' && <ComparisonView endpoint={endpoint} />}
      </main>

      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ===== Footer ============================= */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-gray-400">
          <span>追踪面板 v0.2.0</span>
          <span className="font-mono text-[10px] hidden sm:inline">{endpoint}</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary><AppInner /></ErrorBoundary>
    </ThemeProvider>
  );
}
