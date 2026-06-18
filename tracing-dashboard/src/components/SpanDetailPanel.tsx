import { X, Copy, Zap, Wrench, Cpu, Clock, Layers, Tag, MessageSquare, Star, Edit3, Save, Maximize2, Minimize2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Span } from '../utils/trace-utils';
import { JsonBlock } from './JsonBlock';
import { MessageView } from './MessageView';
import { useToast } from './ToastProvider';

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
  const { success: toastSuccess, error: toastError } = useToast();
  const [editing, setEditing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [localTags, setLocalTags] = useState<Record<string, string>>({});
  const [rating, setRating] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [expandAllIO, setExpandAllIO] = useState(false);

  useEffect(() => {
    const tags = span.metadata.tags || {};
    setLocalTags(tags);
    setRating(Number(tags.rating) || 0);
    setNotesInput('');
  }, [span.id]);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(span, null, 2)).then(() => {
      toastSuccess('已复制 Span JSON', 2000);
    }).catch(() => {});
  };

  const saveAnnotation = () => {
    setSaving(true);
    const endpoint = span.id ? '/spans/' + span.id : '';
    // Infer endpoint from window location if possible
    const base = window.location.hostname === 'localhost' ? 'http://localhost:9200' : '';
    fetch(base + endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: { ...localTags, rating: String(rating) }, notes: notesInput || undefined }),
    })
      .then((r) => { if (r.ok) toastSuccess('标注已保存', 2000); else toastError('保存失败'); })
      .catch(() => toastError('保存失败'))
      .finally(() => setSaving(false));
    setEditing(false);
  };

  const { metadata } = span;
  const isLLM = span.kind === 'llm_call';
  const isTool = span.kind === 'tool_call';

  return (
    <div className="flex flex-col h-full px-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Span 详情
          </span>
          <span className="tag text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500">
            {kindLabel[span.kind] || span.kind}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copyJson}
            className="p-1.5 text-gray-400 hover:text-gray min-w-[36px] min-h-[36px] flex items-center justify-center-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            title="复制 JSON">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray min-w-[36px] min-h-[36px] flex items-center justify-center-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      
      {/* Expand all I/O toggle */}
      {(isLLM || isTool) && (
        <button
          onClick={() => setExpandAllIO(!expandAllIO)}
          className="flex items-center gap-1.5 text-[11px] text-indigo-500 hover:text-indigo-600 transition-colors pb-2 shrink-0"
        >
          {expandAllIO ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          {expandAllIO ? '折叠全部 I/O' : '展开全部 I/O'}
        </button>
      )}

      <div className="flex-1 py-3 space-y-4">
        {/* Basic Info */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">基本信息</h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex flex-col gap-0.5">
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
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-400">Span ID</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono text-[11px] break-all">{span.id}</span>
            </div>
          </div>
        </section>

        {/* Model & Tokens (LLM only) */}
        {isLLM && (
          <section>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
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
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              <Cpu className="w-3 h-3 inline mr-1" />Agent / Task
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
              {metadata.agent && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-400">Agent</span>
                  <span className="text-gray-700 dark:text-gray-300">{metadata.agent}</span>
                </div>
              )}
              {metadata.agent_role && !metadata.agent && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-400">Role</span>
                  <span className="text-gray-700 dark:text-gray-300">{metadata.agent_role}</span>
                </div>
              )}
              {metadata.task && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-400">Task</span>
                  <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{metadata.task}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tool Info */}
        {isTool && (
          <section>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
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
                <JsonBlock label="输入" content={metadata.tool_input_full || metadata.tool_input} maxHeight={expandAllIO ? 99999 : 300} defaultExpanded={expandAllIO} />
              )}
              {metadata.tool_output && (
                <JsonBlock label="输出" content={metadata.tool_output_full || metadata.tool_output} maxHeight={expandAllIO ? 99999 : 300} defaultExpanded={expandAllIO} />
              )}
            </div>
          </section>
        )}

        {/* Prompt (LLM only) */}
        {isLLM && (metadata.messages || metadata.prompt || metadata.prompt_preview) && (
          <section>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">输入 Prompt</h4>
            {metadata.messages ? (
              <MessageView content={metadata.messages} maxHeight={expandAllIO ? 99999 : 400} />
            ) : (
              <JsonBlock label="" content={metadata.prompt || metadata.prompt_preview} maxHeight={expandAllIO ? 99999 : 400} defaultExpanded={expandAllIO} defaultViewMode="md" />
            )}
          </section>
        )}

        {/* Response (LLM only) */}
        {isLLM && (metadata.response || metadata.response_preview) && (
          <section>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">输出 Response</h4>
            <JsonBlock label="" content={metadata.response || metadata.response_preview} maxHeight={expandAllIO ? 99999 : 400} defaultExpanded={expandAllIO} />
          </section>
        )}

        {/* Tags & Annotations */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Tag className="w-3 h-3" />标注
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
            {!editing ? (
              <>
                {/* Display tags */}
                <div className="flex flex-wrap gap-1.5">
                  {rating > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                      <Star className="w-2.5 h-2.5 fill-current" /> {rating}/5
                    </span>
                  )}
                  {Object.entries(localTags).filter(([k]) => k !== 'rating').map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                      {k}: {v}
                    </span>
                  ))}
                  {Object.keys(localTags).length === 0 && !rating && (
                    <span className="text-gray-400">暂无标注</span>
                  )}
                </div>
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-600 transition-colors">
                  <Edit3 className="w-3 h-3" /> 编辑标注
                </button>
              </>
            ) : (
              <>
                {/* Rating */}
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">评分</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setRating(n)}
                        className={'p-0.5 transition-colors ' + (n <= rating ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600')}>
                        <Star className={'w-4 h-4 ' + (n <= rating ? 'fill-current' : '')} />
                      </button>
                    ))}
                  </div>
                </div>
                {/* Tags input */}
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">标签 (key:value, 逗号分隔)</label>
                  <input type="text" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="bug, priority:high"
                    className="w-full px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500/30" />
                </div>
                {/* Notes */}
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">备注</label>
                  <textarea value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="添加备注..."
                    rows={2}
                    className="w-full px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500/30 resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    // Parse tag input: "bug, priority:high" → { bug: "true" or "", priority: "high" }
                    const parsed: Record<string, string> = {};
                    if (tagInput.trim()) {
                      tagInput.split(',').forEach((part) => {
                        const [k, ...v] = part.trim().split(':');
                        parsed[k.trim()] = v.length ? v.join(':').trim() : 'true';
                      });
                    }
                    setLocalTags({ ...localTags, ...parsed });
                    setTagInput('');
                  }}
                    className="text-[11px] text-indigo-500 hover:text-indigo-600">添加标签</button>
                  <button onClick={() => {
                    setLocalTags({});
                    setRating(0);
                    setTagInput('');
                    setNotesInput('');
                  }}
                    className="text-[11px] text-gray-400 hover:text-red-500 ml-auto">清除</button>
                  <button onClick={saveAnnotation} disabled={saving}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                    <Save className="w-3 h-3" /> {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Error */}
        {span.error && (
          <section>
            <h4 className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-2">错误</h4>
            <pre className="text-[11px] p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
              {span.error}
            </pre>
          </section>
        )}

        {/* Raw JSON */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            <Layers className="w-3 h-3 inline mr-1" />原始 JSON
          </h4>
          <JsonBlock label="" content={JSON.stringify(span, null, 2)} maxHeight={expandAllIO ? 99999 : 300} searchable defaultExpanded={expandAllIO} />
        </section>
      </div>
    </div>
  );
}
