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
  // RMB per 1M tokens. Source: official API docs as of 2025-Q3.
  // Models with (*) are estimates — verify against current pricing pages.
  // ── OpenAI ──
  "gpt-4o": { input: 18.00, output: 72.00 },
  "gpt-4o-mini": { input: 1.08, output: 4.32 },
  "gpt-4.1": { input: 14.40, output: 57.60 },
  "gpt-4.1-mini": { input: 2.88, output: 11.52 },
  "gpt-4.1-nano": { input: 0.72, output: 2.88 },
  "gpt-4": { input: 216.00, output: 432.00 },
  "gpt-4-turbo": { input: 72.00, output: 216.00 },
  "gpt-3.5-turbo": { input: 3.60, output: 10.80 },
  "o3-mini": { input: 7.92, output: 31.68 },
  "gpt-5.5":      { input: 36.25,  output: 217.50 },
  "gpt-5.5-mini": { input: 1.02,  output: 2.03 },  // (*) verify
  // ── Anthropic ──
  "claude-3-opus": { input: 108.00, output: 540.00 },
  "claude-3.5-sonnet": { input: 21.60, output: 108.00 },
  "claude-3.5-haiku": { input: 5.76, output: 28.80 },
  "claude-4-opus": { input: 108.00, output: 540.00 },
  "claude-4-sonnet": { input: 21.60, output: 108.00 },
  "claude-4-haiku": { input: 5.76, output: 28.80 },  // (*)
  "claude-3-sonnet": { input: 21.60, output: 108.00 },
  "claude-3-haiku": { input: 5.76, output: 28.80 },
  "claude-4": { input: 21.60, output: 108.00 },
  // ── Google ──
  "gemini-1.5-pro": { input: 9.00, output: 36.00 },
  "gemini-2.5-pro": { input: 9.00, output: 72.00 },
  "gemini-2.5-flash": { input: 1.08, output: 4.32 },
  // ── DeepSeek (native RMB) ──
  "deepseek-chat":     { input: 1.02, output: 2.03 },
  "deepseek-reasoner": { input: 3.15, output: 6.31 },
  "deepseek-v4":       { input: 1.02, output: 2.03 },
  "deepseek-r1":       { input: 3.15, output: 6.31 },
  // ── Alibaba Qwen ──
  "qwen-turbo": { input: 0.30, output: 0.60 },
  "qwen-plus": { input: 0.80, output: 2.00 },
  "qwen-max": { input: 4.00, output: 16.00 },
  "qwen3-235b": { input: 4.00, output: 16.00 },
  // ── Zhipu GLM ──
  "glm-4-flash": { input: 1.00, output: 1.00 },
  "glm-4": { input: 1.00, output: 1.00 },
  "glm-4-plus": { input: 50.00, output: 50.00 },
  // ── Moonshot Kimi ──
  "moonshot-v1-8k": { input: 12.00, output: 12.00 },
  "moonshot-v1-32k": { input: 24.00, output: 24.00 },
  "moonshot-v1-128k": { input: 60.00, output: 60.00 },
  "moonshot-v1": { input: 12.00, output: 12.00 },
  // ── Baidu Ernie ──
  "ernie-4.0": { input: 120.00, output: 120.00 },
  "ernie-4.0-turbo": { input: 20.00, output: 20.00 },
  "ernie-3.5": { input: 12.00, output: 12.00 },
  // ── xAI Grok ──
  "grok-3": { input: 21.60, output: 108.00 },
  "grok-3-mini": { input: 5.76, output: 28.80 },
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


// ── Tree utilities ──

export interface TreeNode {
  span: Span;
  children: TreeNode[];
  depth: number;
}

export function buildTree(spans: Span[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const span of spans) {
    map.set(span.id, { span, children: [], depth: 0 });
  }

  for (const span of spans) {
    const node = map.get(span.id)!;
    if (span.parent_id && map.has(span.parent_id)) {
      map.get(span.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function setDepth(nodes: TreeNode[], d: number) {
    for (const n of nodes) {
      n.depth = d;
      setDepth(n.children, d + 1);
    }
  }
  setDepth(roots, 0);

  return roots;
}

export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

export const PAGE_SIZE = 50;
