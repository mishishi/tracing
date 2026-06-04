import { describe, it, expect } from 'vitest';
import {
  fmtMs, fmtTokens, fmtTime, statusIcon,
  buildTree, flattenTree, type Span,
} from '../utils/trace-utils';

describe('trace-utils', () => {
  describe('fmtMs', () => {
    it('formats milliseconds', () => expect(fmtMs(500)).toBe('500ms'));
    it('formats seconds', () => expect(fmtMs(2500)).toBe('2.5s'));
    it('formats minutes', () => expect(fmtMs(125000)).toBe('2m 5s'));
  });

  describe('fmtTokens', () => {
    it('formats small numbers', () => expect(fmtTokens(500)).toBe('500'));
    it('formats thousands', () => expect(fmtTokens(2500)).toBe('2.5K'));
    it('formats millions', () => expect(fmtTokens(1500000)).toBe('1.5M'));
  });

  describe('fmtTime', () => {
    it('handles empty string', () => expect(fmtTime('')).toBe(''));
    it('shows recent as 刚刚', () => {
      const now = new Date();
      now.setSeconds(now.getSeconds() - 10);
      expect(fmtTime(now.toISOString())).toBe('刚刚');
    });
  });

  describe('buildTree', () => {
    function s(id: string, parent: string = ''): Span {
      return {
        id, trace_id: 't1', parent_id: parent, session_id: 's1',
        project: 'test', name: id, kind: 'agent', status: 'ok',
        start_time: '', end_time: '', duration_ms: 0,
        metadata: {}, error: '',
      };
    }

    it('builds flat tree for no parents', () => {
      const spans = [s('a'), s('b'), s('c')];
      const tree = buildTree(spans);
      expect(tree).toHaveLength(3);
      expect(tree[0].depth).toBe(0);
    });

    it('builds nested tree', () => {
      const spans = [s('a'), s('b', 'a'), s('c', 'b')];
      const tree = buildTree(spans);
      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].depth).toBe(1);
      expect(tree[0].children[0].children[0].depth).toBe(2);
    });

    it('flattens nested tree', () => {
      const spans = [s('a'), s('b', 'a'), s('c', 'b')];
      const tree = buildTree(spans);
      const flat = flattenTree(tree);
      expect(flat).toHaveLength(3);
      expect(flat.map((n) => n.span.id)).toEqual(['a', 'b', 'c']);
    });
  });
});
