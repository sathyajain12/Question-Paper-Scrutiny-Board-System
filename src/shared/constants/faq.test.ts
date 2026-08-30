/**
 * Coverage worth protecting: a short, specific query (like "ward") should
 * rank the matching entry first even though other entries' answers mention
 * related words in passing — that's the whole point of weighting question/
 * keyword hits above answer hits.
 */
import { describe, expect, it } from 'vitest';
import { askFaq, FAQ_ENTRIES, searchFaq } from './faq';

describe('searchFaq', () => {
  it('ranks an exact keyword match first', () => {
    const results = searchFaq('ward conflict');
    expect(results[0]?.id).toBe('ward-conflict');
  });

  it('matches on a partial, non-exact phrase', () => {
    const results = searchFaq('how many faculty do I pick');
    expect(results.map((r) => r.id)).toContain('how-many-faculty');
  });

  it('returns nothing for a query with no relation to any entry', () => {
    expect(searchFaq('zzz qqq xyzzy plugh')).toEqual([]);
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(searchFaq('')).toEqual([]);
    expect(searchFaq('   ')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    // "the" appears in most answers, so this is guaranteed to over-match.
    const results = searchFaq('the board', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('every entry has a unique id', () => {
    const ids = FAQ_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tolerates a one-letter typo in a key word', () => {
    const results = searchFaq('how many faculy needed');
    expect(results[0]?.id).toBe('how-many-faculty');
  });

  it('recognises a synonym the entry text never uses', () => {
    // "how-many-faculty" is written around "faculty"/"members" — never
    // "professors" or "nominees" — so a match here proves the synonym
    // group, not a lucky literal overlap.
    expect(searchFaq('how many professors should I add')[0]?.id).toBe('how-many-faculty');
    expect(searchFaq('how many nominees can I pick')[0]?.id).toBe('how-many-faculty');
  });

  it('matches a bare word-stem prefix', () => {
    // "sched" isn't a whole word anywhere in the content — this only works
    // via substring/prefix matching against "schedule"/"scheduled".
    const [top] = searchFaq('sched');
    expect(['Scheduling', 'Status & Approval']).toContain(top?.category);
  });
});

describe('askFaq', () => {
  it('answers directly when one entry is clearly ahead', () => {
    expect(askFaq('ward conflict')).toEqual({
      kind: 'answer',
      entry: expect.objectContaining({ id: 'ward-conflict' }),
    });
    expect(askFaq('work done notify admin')).toEqual({
      kind: 'answer',
      entry: expect.objectContaining({ id: 'work-done-notify' }),
    });
  });

  it('offers suggestions instead of guessing on a vague, single-word query', () => {
    const result = askFaq('admin');
    expect(result.kind).toBe('suggestions');
    if (result.kind === 'suggestions') {
      expect(result.entries.length).toBeGreaterThan(1);
      expect(result.entries.length).toBeLessThanOrEqual(3);
    }
  });

  it('falls back when nothing relates to any entry', () => {
    expect(askFaq('zzz qqq xyzzy plugh')).toEqual({ kind: 'fallback' });
  });
});
