import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SpanDetailPanel } from '../components/SpanDetailPanel';
import type { Span } from '../utils/trace-utils';

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: 'sp1',
    trace_id: 'tr1',
    parent_id: '',
    session_id: 's1',
    project: 'test',
    name: 'test-span',
    kind: 'llm_call',
    status: 'ok',
    start_time: '2024-01-01T00:00:00Z',
    end_time: '2024-01-01T00:00:01Z',
    duration_ms: 1000,
    metadata: {},
    error: '',
    ...overrides,
  };
}

describe('SpanDetailPanel', () => {
  it('shows span name and kind', () => {
    const span = makeSpan({ name: 'gpt-4-call', kind: 'llm_call' });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('gpt-4-call')).toBeTruthy();
    // LLM appears in kind tag and in section header - getAllByText
    expect(screen.getAllByText('LLM').length).toBeGreaterThanOrEqual(1);
  });

  it('shows status ok', () => {
    const span = makeSpan({ status: 'ok' });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('成功')).toBeTruthy();
  });

  it('shows error status', () => {
    const span = makeSpan({ status: 'error', error: 'timeout' });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getByText('timeout')).toBeTruthy();
  });

  it('shows duration', () => {
    const span = makeSpan({ duration_ms: 2500 });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('2.5s')).toBeTruthy();
  });

  it('shows model info for LLM spans', () => {
    const span = makeSpan({
      kind: 'llm_call',
      metadata: { model: 'gpt-4o', input_tokens: 500, output_tokens: 200, total_tokens: 700 },
    });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('gpt-4o')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('shows tool info for tool spans', () => {
    const span = makeSpan({
      kind: 'tool_call',
      metadata: { tool_name: 'web_search' },
    });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('web_search')).toBeTruthy();
  });

  it('shows agent and task', () => {
    const span = makeSpan({
      kind: 'agent',
      metadata: { agent: '研究员', task: '分析市场数据并生成报告' },
    });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.getByText('研究员')).toBeTruthy();
    expect(screen.getByText('分析市场数据并生成报告')).toBeTruthy();
  });

  it('does not show model section for non-LLM spans', () => {
    const span = makeSpan({ kind: 'tool_call' });
    render(<SpanDetailPanel span={span} onClose={() => {}} />);
    expect(screen.queryByText('模型 & Token')).toBeNull();
  });
});
