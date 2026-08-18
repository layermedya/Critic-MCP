import { describe, expect, it } from 'vitest';
import { ReviewCodeInputSchema } from '../src/schema.js';

describe('ReviewCodeInputSchema — zod input validation', () => {
  it('accepts valid input', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'const x = 1;',
      intent: 'Define a constant',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        code_snippet: 'const x = 1;',
        intent: 'Define a constant',
      });
    }
  });

  it('rejects an empty code_snippet', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: '',
      intent: 'A valid intent',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['code_snippet']);
      expect(result.error.issues[0]?.message).toContain('cannot be empty');
    }
  });

  it('rejects an empty intent', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'const x = 1;',
      intent: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['intent']);
    }
  });

  it('rejects an excessively long code_snippet', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'x'.repeat(200_001),
      intent: 'A valid intent',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('too long');
    }
  });

  it('rejects an excessively long intent', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'const x = 1;',
      intent: 'i'.repeat(20_001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing code_snippet parameter', () => {
    const result = ReviewCodeInputSchema.safeParse({
      intent: 'Only the intent is provided',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['code_snippet']);
    }
  });

  it('rejects a missing intent parameter', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'const x = 1;',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a completely empty object', () => {
    const result = ReviewCodeInputSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(2);
    }
  });

  it('rejects a non-string code_snippet type', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 123,
      intent: 'A valid intent',
    });
    expect(result.success).toBe(false);
  });

  it('accepts values exactly at the limits (200,000 / 20,000 chars)', () => {
    const result = ReviewCodeInputSchema.safeParse({
      code_snippet: 'x'.repeat(200_000),
      intent: 'i'.repeat(20_000),
    });
    expect(result.success).toBe(true);
  });
});
