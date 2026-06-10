import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CostView } from '../components/CostView';

const mockCostsData = {
  total_cost: 2.54321,
  total_calls: 156,
  currency: 'USD',
  by_model: {
    'gpt-4o': { input_tokens: 500000, output_tokens: 200000, cost: 1.25, calls: 80 },
    'gpt-4o-mini': { input_tokens: 1000000, output_tokens: 500000, cost: 0.45, calls: 60 },
    'claude-3.5-sonnet': { input_tokens: 300000, output_tokens: 100000, cost: 0.84, calls: 16 },
  },
  by_project: {
    'idea-lab': { input_tokens: 1200000, output_tokens: 500000, cost: 1.50, calls: 100 },
    'default': { input_tokens: 600000, output_tokens: 300000, cost: 1.04, calls: 56 },
  },
  by_day: [
    { date: '2026-05-30', input_tokens: 400000, output_tokens: 150000, cost: 0.85, calls: 45 },
    { date: '2026-05-31', input_tokens: 600000, output_tokens: 250000, cost: 1.20, calls: 55 },
    { date: '2026-06-01', input_tokens: 500000, output_tokens: 200000, cost: 0.49, calls: 56 },
  ],
};

describe('CostView', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockCostsData),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows skeleton placeholder initially', () => {
    render(<CostView endpoint="http://localhost:9200" />);
    // Should have skeleton loading state
    const skeleton = document.querySelector('.skeleton');
    expect(skeleton).toBeTruthy();
  });

  it('renders total cost after data loads', async () => {
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      expect(screen.getByText('¥2.54')).toBeInTheDocument();
    });
  });

  it('renders total calls count', async () => {
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      expect(screen.getByText(/156/)).toBeInTheDocument();
    });
  });

  it('shows model breakdown', async () => {
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      // Model names appear in both model card and TokenHistogram SVG
      expect(screen.getAllByText('GPT-4o').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('GPT-4o Mini').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Claude 3.5 Sonnet').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows project breakdown when multiple projects', async () => {
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      expect(screen.getByText('idea-lab')).toBeInTheDocument();
      expect(screen.getByText('default')).toBeInTheDocument();
    });
  });

  it('shows daily trend bars', async () => {
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      // Date labels (MM-DD format)
      expect(screen.getByText('05-30')).toBeInTheDocument();
      expect(screen.getByText('05-31')).toBeInTheDocument();
      expect(screen.getByText('06-01')).toBeInTheDocument();
    });
  });

  it('passes project filter to API', async () => {
    render(<CostView endpoint="http://localhost:9200" project="idea-lab" />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('project=idea-lab')
      );
    });
  });

  it('shows empty state when no calls', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        total_cost: 0, total_calls: 0, currency: 'USD',
        by_model: {}, by_project: {}, by_day: [],
      }),
    });
    render(<CostView endpoint="http://localhost:9200" />);
    await waitFor(() => {
      expect(screen.getByText('暂无成本数据')).toBeInTheDocument();
    });
  });
});
