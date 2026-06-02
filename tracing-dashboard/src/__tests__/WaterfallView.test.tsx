import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaterfallView } from '../components/WaterfallView';
import type { TraceData } from '../components/TraceViewer';

const mockTrace: TraceData = {
  trace_id: 'trace-001',
  span_count: 4,
  spans: [
    {
      id: 'span-1',
      trace_id: 'trace-001',
      parent_id: '',
      session_id: 's1',
      project: 'test-project',
      name: 'main flow',
      kind: 'flow',
      status: 'ok',
      start_time: '2026-01-01T00:00:00Z',
      end_time: '2026-01-01T00:00:03Z',
      duration_ms: 3000,
      metadata: {},
      error: '',
    },
    {
      id: 'span-2',
      trace_id: 'trace-001',
      parent_id: 'span-1',
      session_id: 's1',
      project: 'test-project',
      name: 'llm call',
      kind: 'llm_call',
      status: 'ok',
      start_time: '2026-01-01T00:00:00.5Z',
      end_time: '2026-01-01T00:00:02Z',
      duration_ms: 1500,
      metadata: {
        model: 'gpt-4',
        total_tokens: 500,
        input_tokens: 200,
        output_tokens: 300,
      },
      error: '',
    },
    {
      id: 'span-3',
      trace_id: 'trace-001',
      parent_id: 'span-2',
      session_id: 's1',
      project: 'test-project',
      name: 'tool call',
      kind: 'tool_call',
      status: 'error',
      start_time: '2026-01-01T00:00:01Z',
      end_time: '2026-01-01T00:00:01.5Z',
      duration_ms: 500,
      metadata: { tool_name: 'search' },
      error: 'tool not found',
    },
    // Span without name to test kindLabel fallback
    {
      id: 'span-4',
      trace_id: 'trace-001',
      parent_id: '',
      session_id: 's1',
      project: 'test-project',
      name: '',
      kind: 'phase',
      status: 'ok',
      start_time: '2026-01-01T00:00:02Z',
      end_time: '2026-01-01T00:00:03Z',
      duration_ms: 1000,
      metadata: {},
      error: '',
    },
  ],
};

describe('WaterfallView', () => {
  const defaultProps = {
    selectedSpanId: null,
    onSelectSpan: vi.fn(),
  };

  it('renders all span names', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    expect(screen.getByText('main flow')).toBeInTheDocument();
    expect(screen.getByText('llm call')).toBeInTheDocument();
    expect(screen.getByText('tool call')).toBeInTheDocument();
  });

  it('shows kind label for unnamed spans', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    // '阶段' appears in both dropdown options and span row — check count >= 2
    const elements = screen.getAllByText('阶段');
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows time axis markers', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    // 0ms should appear once on time axis
    const zeroElements = screen.getAllByText('0ms');
    expect(zeroElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error info for error spans', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    expect(screen.getByText('tool not found')).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    expect(screen.getByText('1.0x')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('reset')).toBeInTheDocument();
  });

  it('renders all spans as clickable rows', () => {
    render(<WaterfallView trace={mockTrace} {...defaultProps} />);
    // All 4 spans are rendered as buttons
    const rows = screen.getAllByRole('button');
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('calls onSelectSpan when a span row is clicked', () => {
    const onSelect = vi.fn();
    render(<WaterfallView trace={mockTrace} selectedSpanId={null} onSelectSpan={onSelect} />);
    screen.getByText('main flow').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('span-1');
  });

  it('renders for empty trace without crashing', () => {
    const emptyTrace: TraceData = {
      trace_id: 'empty',
      span_count: 0,
      spans: [],
    };
    render(<WaterfallView trace={emptyTrace} {...defaultProps} />);
    // Should render the time axis header
    expect(screen.getByText('Span')).toBeInTheDocument();
  });
});
