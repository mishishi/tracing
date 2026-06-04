import type { TraceData, Span } from './trace-utils';

export function exportToCSV(trace: TraceData): void {
  const headers = [
    'span_id', 'parent_id', 'name', 'kind', 'status',
    'start_time', 'end_time', 'duration_ms',
    'model', 'agent_role', 'task',
    'input_tokens', 'output_tokens', 'total_tokens',
    'tool_name', 'error',
  ];

  const rows = trace.spans.map((s: Span) => [
    s.id,
    s.parent_id,
    s.name,
    s.kind,
    s.status,
    s.start_time,
    s.end_time,
    s.duration_ms,
    s.metadata.model || '',
    s.metadata.agent_role || '',
    s.metadata.task || '',
    s.metadata.input_tokens || 0,
    s.metadata.output_tokens || 0,
    s.metadata.total_tokens || 0,
    s.metadata.tool_name || '',
    s.error || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')),
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trace-' + trace.trace_id + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
