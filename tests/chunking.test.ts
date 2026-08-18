import { describe, expect, it } from 'vitest';
import { chunkCode, DEFAULT_CHUNK_SIZE, type CodeChunk } from '../src/chunker.js';
import { buildReduceUserPrompt, buildMapUserPrompt } from '../src/prompt.js';

describe('chunkCode — chunking logic', () => {
  it('returns code below the limit as a SINGLE chunk', () => {
    const code = Array.from({ length: 10 }, (_, i) => `line_${i}`).join('\n');
    const chunks = chunkCode(code, 10_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].total).toBe(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(10);
    expect(chunks[0].text).toBe(code);
  });

  it('splits code above the limit at line endings', () => {
    // 100 lines of ~100 chars each (~10,000 chars) -> limit 1,000
    const code = Array.from({ length: 100 }, (_, i) =>
      `line_${String(i).padStart(3, '0')}_` + 'x'.repeat(90)
    ).join('\n');
    const chunks = chunkCode(code, 1_000);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk may exceed the limit.
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1_000);
    }
  });

  it('index/total fields are 1-based and consistent', () => {
    const code = Array.from({ length: 50 }, (_, i) => `line_${i}`).join('\n');
    const chunks = chunkCode(code, 40);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i + 1);
      expect(chunk.total).toBe(chunks.length);
    });
  });

  it('startLine/endLine fields are consistent with the original file', () => {
    const code = Array.from({ length: 20 }, (_, i) => `line_${i}`).join('\n');
    const chunks = chunkCode(code, 60);
    // The chunks laid back to back must cover all lines.
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[chunks.length - 1].endLine).toBe(20);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startLine).toBeLessThanOrEqual(chunks[i - 1].endLine + 1);
    }
  });

  it('joining the chunks reproduces the original code exactly', () => {
    const code = Array.from({ length: 100 }, (_, i) =>
      `line_${String(i).padStart(3, '0')}_` + 'y'.repeat(50)
    ).join('\n');
    const chunks = chunkCode(code, 500);
    const reassembled = chunks.map((c) => c.text).join('\n');
    expect(reassembled).toBe(code);
  });

  it('preserves the limit and the original text on code with empty lines', () => {
    const code = Array.from({ length: 40 }, (_, i) =>
      i % 5 === 0 ? '' : `code_${i}_${'z'.repeat(30)}`
    ).join('\n');
    const chunks = chunkCode(code, 200);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    }
    expect(chunks.map((c) => c.text).join('\n')).toBe(code);
  });

  it('force-splits a single giant line within the limit (minified JS)', () => {
    const code = 'const a=1;' + ';x'.repeat(1_000);
    const chunks = chunkCode(code, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    }
    // startLine/endLine point to the same line (1) and text concatenation is preserved.
    expect(chunks[0].startLine).toBe(1);
    expect(chunks.map((c) => c.text).join('')).toBe(code);
  });

  it('code exactly at the limit returns a single chunk', () => {
    const code = 'a'.repeat(1_000);
    const chunks = chunkCode(code, 1_000);
    expect(chunks).toHaveLength(1);
  });

  it('uses the default limit DEFAULT_CHUNK_SIZE (30,000)', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(30_000);
    const small = 'code\n'.repeat(100);
    const chunks = chunkCode(small);
    expect(chunks).toHaveLength(1);
  });

  it('throws for an invalid maxChars', () => {
    expect(() => chunkCode('code', 0)).toThrow('must be a positive integer');
    expect(() => chunkCode('code', -10)).toThrow('must be a positive integer');
    expect(() => chunkCode('code', 12.5)).toThrow('must be a positive integer');
  });
});

describe('prompt builders — map/reduce formats', () => {
  const makeChunk = (): CodeChunk => ({
    index: 2,
    total: 5,
    startLine: 100,
    endLine: 250,
    text: 'const a = 1;',
  });

  it('buildMapUserPrompt contains the chunk number and the line range', () => {
    const prompt = buildMapUserPrompt(makeChunk(), 'test intent');
    expect(prompt).toContain('2/5');
    expect(prompt).toContain('lines="100-250"');
    expect(prompt).toContain('test intent');
    expect(prompt).toContain('const a = 1;');
  });

  it('buildReduceUserPrompt merges all partial analyses with indices', () => {
    const prompt = buildReduceUserPrompt(['analysis-1', 'analysis-2', 'analysis-3'], 'test intent');
    expect(prompt).toContain('part="1/3"');
    expect(prompt).toContain('part="2/3"');
    expect(prompt).toContain('part="3/3"');
    expect(prompt).toContain('analysis-1');
    expect(prompt).toContain('analysis-3');
    expect(prompt).toContain('test intent');
  });
});
