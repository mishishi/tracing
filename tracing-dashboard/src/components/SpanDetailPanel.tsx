import { X, Copy, CheckCircle2, Zap, Wrench, Cpu, Clock, Layers } from 'lucide-react';
import { useState } from 'react';
import type { Span } from './TraceViewer';

/* ================================================
   Helpers
   ================================================ */

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'm';
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

const kindLabel: Record<string, string> = {
  flow: '流程', agent: '智能体', llm_call: 'LLM', tool_call: '工具', phase: '阶段',
};

const statusLabel: Record<string, string> = {
  ok: '成功', error: '失败', running: '运行中',
};

/* ================================================
   SpanDetailPanel
   ================================================ */

interface SpanDetailPanelProps {
  span: Span;
  onClose: () => void;
}

export function SpanDetailPanel({ span, onClose }: SpanDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(span, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const { metadata } = span;
  const isLLM = span.kind === 'llm_call';
  const isTool = span.kind === 'tool_call';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Span 详情
          </span>
          <span className="tag text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500">
            {kindLabel[span.kind] || span.kind}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copyJson}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            title="复制 JSON">
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Basic Info */}
        <section>
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">基本信息</h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">名称</span>
              <span className="text-gray-700 dark:text-gray-300 font-medium">{span.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Kind</span>
              <span className="text-gray-700 dark:text-gray-300">{kindLabel[span.kind] || span.kind}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">状态</span>
              <span className={span.status === 'error' ? 'text-red-500' : span.status === 'ok' ? 'text-green-600' : 'text-gray-500'}>
                {statusLabel[span.status] || span.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">耗时</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono">{fmtMs(span.duration_ms)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Span ID</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono text-[10px]">{span.id}</span>
            </div>
          </div>
        </section>

        {/* Model & Tokens (LLM only) */}
        {isLLM && (
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <Zap className="w-3 h-3 inline mr-1" />模型 & Token
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
              {metadata.model && (
                <div className="flex justify-between">
                  <span className="text-gray-400">模型</span>
                  <span className="text-gray-700 dark:text-gray-300 font-mono font-medium">{metadata.model}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Input Tokens</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono">{fmtTokens(metadata.input_tokens || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Output Tokens</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono">{fmtTokens(metadata.output_tokens || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Tokens</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono font-semibold">{fmtTokens(metadata.total_tokens || 0)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Agent & Task */}
        {(metadata.agent || metadata.task || metadata.agent_role) && (
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <Cpu className="w-3 h-3 inline mr-1" />Agent / Task
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
              {metadata.agent && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Agent</span>
                  <span className="text-gray-700 dark:text-gray-300">{metadata.agent}</span>
                </div>
              )}
              {metadata.agent_role && !metadata.agent && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Role</span>
                  <span className="text-gray-700 dark:text-gray-300">{metadata.agent_role}</span>
                </div>
              )}
              {metadata.task && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Task</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right max-w-[200px]">{metadata.task}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tool Info */}
        {isTool && (
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <Wrench className="w-3 h-3 inline mr-1" />工具信息
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
              {metadata.tool_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">工具</span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{metadata.tool_name}</span>
                </div>
              )}
              {metadata.tool_input && (
                <div>
                  <span className="text-gray-400 block mb-1">输入</span>
                  <pre className="text-[10px] p-2 bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-700 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
                    {metadata.tool_input}
                  </pre>
                </div>
              )}
              {metadata.tool_output && (
                <div>
                  <span className="text-gray-400 block mb-1">输出</span>
                  <pre className="text-[10px] p-2 bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-700 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
                    {metadata.tool_output}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Prompt (LLM only) */}
        {isLLM && metadata.prompt_preview && (
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">输入 Prompt</h4>
            <pre className="text-[10px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg max-h-64 overflow-auto whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
              {metadata.prompt_preview}
            </pre>
          </section>
        )}

        {/* Response (LLM only) */}
        {isLLM && metadata.response_preview && (
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">输出 Response</h4>
            <pre className="text-[10px] p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg max-h-64 overflow-auto whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
              {metadata.response_preview}
            </pre>
          </section>
        )}

        {/* Error */}
        {span.error && (
          <section>
            <h4 className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">错误</h4>
            <pre className="text-[10px] p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
              {span.error}
            </pre>
          </section>
        )}

        {/* Raw JSON */}
        <section>
          <details>
            <summary className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600">
              <Layers className="w-3 h-3 inline mr-1" />原始 JSON
            </summary>
            <pre className="text-[10px] mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg max-h-48 overflow-auto font-mono text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
              {JSON.stringify(span, null, 2)}
            </pre>
          </details>
        </section>
      </div>
    </div>
  );
}
