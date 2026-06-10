import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Server, RefreshCw, DollarSign,
  Wifi, WifiOff, ChevronDown, Globe, Check, Copy, Plus, Trash2,
  Sun, Moon, AlertTriangle, Minimize2, Maximize2, Share2, FileDown, Layers,
} from 'lucide-react';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { useEndpoints } from './hooks/useEndpoints';
import { TraceViewer } from './components/TraceViewer';
import { CostView } from './components/CostView';
import { ErrorPanel } from './components/ErrorPanel';
import { LatencyHeatmap } from './components/LatencyHeatmap';
import { PercentileTrend } from './components/PercentileTrend';
import { ComparisonView } from './components/ComparisonView';
import { Overview } from './components/Overview';
import { SearchBar } from './components/SearchBar';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { exportToPdf } from './utils/exportPdf';

type Tab = 'overview' | 'traces' | 'costs' | 'errors' | 'compare';

const TABS: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'overview', label: '总览', icon: <Layers className="w-4 h-4" />, color: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'traces', label: '追踪', icon: <BarChart3 className="w-4 h-4" />, color: 'text-gray-900 dark:text-gray-100' },
  { key: 'costs', label: '成本', icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'errors', label: '错误', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600 dark:text-red-400' },
  { key: 'compare', label: '对比', icon: <Layers className="w-4 h-4" />, color: 'text-violet-600 dark:text-violet-400' },
];

function AppInner() {
  const { theme, toggleTheme } = useTheme();
  const { endpoints, selected, selectedId, selectEndpoint, updateEndpoint, addEndpoint, removeEndpoint } = useEndpoints();
  const endpoint = selected.url;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [globalProject, setGlobalProject] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sharedTraceId, setSharedTraceId] = useState('');
  const [highlightQuery, setHighlightQuery] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    return localStorage.getItem('tracing-dashboard-density') === 'compact' ? 'compact' : 'comfortable';
  });
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint + '/health')
      .then((r) => r.json())
      .then(() => { if (!cancelled) setHealthOk(true); })
      .catch(() => { if (!cancelled) setHealthOk(false); });
    return () => { cancelled = true; };
  }, [endpoint, tick]);

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
      const tabMap: Record<string, Tab> = { '1': 'traces', '2': 'costs', '3': 'errors', '4': 'compare' };
      if (tabMap[e.key]) { setActiveTab(tabMap[e.key]); return; }
      if (e.key === 'r' || e.key === 'R') { setTick((t) => t + 1); return; }
      if (e.key === 'd' || e.key === 'D') { setDensity((d) => d === 'compact' ? 'comfortable' : 'compact'); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load shared trace from URL
  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get('share');
    if (!shareId) return;
    fetch(endpoint + '/s/' + shareId)
      .then((r) => r.json())
      .then((data) => {
        if (data.trace_id) { setActiveTab('traces'); setSharedTraceId(data.trace_id); }
      })
      .catch(() => {});
  }, [endpoint]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="hidden xs:block">
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">Tracing Dashboard</h1>
              <p className="text-[11px] text-gray-400">Agent Observability</p>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Health + Endpoint selector */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {healthOk === null ? <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" /> :
                 healthOk ? <Wifi className="w-3 h-3 text-green-500" /> :
                 <WifiOff className="w-3 h-3 text-red-500" />}
                <span className="max-w-[100px] truncate">{selected.name}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {settingsOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 z-50">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">服务器配置</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {endpoints.map((ep) => (
                      <div key={ep.id} className="flex items-center gap-2">
                        <button
                          onClick={() => { selectEndpoint(ep.id); setSettingsOpen(false); }}
                          className={
                            'flex-1 text-left px-3 py-2 rounded-lg text-xs transition-colors ' +
                            (selectedId === ep.id
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300')
                          }
                        >
                          <span className="block font-medium">{ep.name}</span>
                          <span className="block text-[10px] text-gray-400 font-mono">{ep.url}</span>
                        </button>
                        {endpoints.length > 1 && (
                          <button onClick={() => removeEndpoint(ep.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                            aria-label={'移除 ' + ep.name}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addEndpoint}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> 添加服务器
                  </button>
                  <p className="mt-3 text-[11px] text-gray-400">配置自动保存到本地浏览器。切换服务器后页面数据将自动刷新。</p>
                </div>
              )}
            </div>

            <SearchBar
              endpoint={endpoint}
              onSelectTrace={(traceId: string, query: string) => {
                setHighlightQuery(query);
                setSharedTraceId(traceId);
                setActiveTab('traces');
              }}
            />

            {/* Density toggle */}
            <button onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label={density === 'compact' ? '舒适模式' : '紧凑模式'}>
              {density === 'compact' ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>

            {/* Theme */}
            <button onClick={toggleTheme}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="切换主题">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ===== Main ===== */}
      <main id="dashboard-main" className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit max-w-full overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ' +
                (activeTab === tab.key
                  ? 'bg-white dark:bg-gray-700 shadow-sm ' + tab.color
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
              }
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <Overview endpoint={endpoint} onProjectSelect={(project: string) => { setGlobalProject(project); setActiveTab('traces'); }} />
        )}
        {activeTab === 'traces' && (
          <div className="space-y-6">
            <LatencyHeatmap endpoint={endpoint} project={globalProject} />
            <PercentileTrend endpoint={endpoint} project={globalProject} />
            <TraceViewer endpoint={endpoint} initialTraceId={sharedTraceId} highlightQuery={highlightQuery} />
          </div>
        )}
        {activeTab === 'costs' && <CostView endpoint={endpoint} />}
        {activeTab === 'errors' && <ErrorPanel endpoint={endpoint} onNavigateToTrace={(traceId) => { setSharedTraceId(traceId); setActiveTab('traces'); }} />}
        {activeTab === 'compare' && <ComparisonView endpoint={endpoint} />}
      </main>

      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ===== Footer ===== */}
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
      <ErrorBoundary>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
