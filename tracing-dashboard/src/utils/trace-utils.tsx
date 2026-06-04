import React from 'react';
import {
  Layers, Zap, Code2, Wrench, Activity,
  CheckCircle2, AlertCircle, Clock,
} from 'lucide-react';

// ── Types ──

export interface SpanMeta {
  model?: string; agent?: string; agent_role?: string; task?: string;
  input_tokens?: number; output_tokens?: number; total_tokens?: number;
  tool_name?: string; tool_input?: string; tool_output?: string;
  prompt_preview?: string; response_preview?: string;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

export interface Span {
  id: string; trace_id: string; parent_id: string; session_id: string;
  project: string; name: string;
  kind: 'flow' | 'agent' | 'llm_call' | 'tool_call' | 'phase';
  status: 'ok' | 'error' | 'running';
  start_time: string; end_time: string; duration_ms: number;
  metadata: SpanMeta; error: string;
}

export interface TraceData { trace_id: string; span_count: number; spans: Span[]; }

export interface TraceSummary {
  trace_id: string; session_id: string; project: string;
  span_count: number; total_duration_ms: number; start_time: string; status?: string;
}

export interface Stats {
  total_spans: number; total_input_tokens: number; total_output_tokens: number;
  total_tokens: number; by_kind: { kind: string; c: number; total_ms: number }[];
}

// ── Labels ──

export const kindLabel: Record<string, string> = {
  flow: '流程', agent: '智能体', llm_call: 'LLM',
  tool_call: '工具', phase: '阶段',
};

export const kindIcons: Record<string, React.ReactNode> = {
  flow: <Layers className="w-3.5 h-3.5" />, agent: <Activity className="w-3.5 h-3.5" />,
  llm_call: <Zap className="w-3.5 h-3.5" />, tool_call: <Wrench className="w-3.5 h-3.5" />,
  phase: <Code2 className="w-3.5 h-3.5" />,
};

export const kindColor: Record<string, string> = {
  flow: 'bg-purple-400', agent: 'bg-blue-400', llm_call: 'bg-amber-400',
  tool_call: 'bg-emerald-400', phase: 'bg-indigo-400',
};

export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-5': { input: 0.00125, output: 0.01 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-4': { input: 0.003, output: 0.015 },
  'claude-4-sonnet': { input: 0.003, output: 0.015 },
};

// ── Formatters ──

export function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm ' + ((ms % 60000) / 1000).toFixed(0) + 's';
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function statusIcon(s: string) {
  switch (s) {
    case 'ok': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'running': return <Clock className="w-3.5 h-3.5 text-gray-400 animate-pulse" />;
    default: return null;
  }
}

export function matchModelPrice(model: string | undefined) {
  if (!model) return null;
  const key = Object.keys(MODEL_PRICES).find((k) => model.toLowerCase().includes(k));
  return key ? MODEL_PRICES[key] : null;
}

// ── Sub-components ──

export function StatCard({ icon, label, value, valueClass }: {
  icon: React.ReactNode; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex justify-center mb-1.5 text-gray-400">{icon}</div>
      <p className={'text-lg font-bold ' + (valueClass || 'text-gray-900 dark:text-gray-100')}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 font-medium">{label}</p>
    </div>
  );
}

export const PAGE_SIZE = 50;
