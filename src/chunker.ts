// Code chunking layer.
// Very large code_snippet values are split into LLM-safe chunks while
// respecting line boundaries (the "map" input of the map-reduce flow).

export const DEFAULT_CHUNK_SIZE = 30_000;

export interface CodeChunk {
  index: number; // 1-based
  total: number;
  startLine: number; // 1-based (in the original file)
  endLine: number;
  text: string;
}

interface Entry {
  lineNo: number;
  text: string;
}

// Forced character split when a single line exceeds the limit (e.g. minified JS).
// In that case chunk boundaries may fall inside a line; this is harmless for
// review-only analysis.
function forceSplit(line: string, maxChars: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += maxChars) {
    parts.push(line.slice(i, i + maxChars));
  }
  return parts;
}

function entriesToText(entries: Entry[]): string {
  let out = '';
  let prevLine = -1;
  let first = true;
  for (const entry of entries) {
    if (!first) {
      // If this is a continuation of the same forced-split line, no newline is added.
      out += entry.lineNo === prevLine ? '' : '\n';
    }
    out += entry.text;
    prevLine = entry.lineNo;
    first = false;
  }
  return out;
}

// Splits code into chunks at logical line endings.
// Guarantees: every chunk is at most `maxChars` long and (unless a single line
// exceeds the limit) no line is split in two. Joining the chunks with '\n'
// reproduces the original code exactly.
export function chunkCode(code: string, maxChars: number = DEFAULT_CHUNK_SIZE): CodeChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error(`maxChars must be a positive integer (received: ${maxChars}).`);
  }

  const lines = code.split('\n');

  if (code.length <= maxChars) {
    return [
      {
        index: 1,
        total: 1,
        startLine: 1,
        endLine: lines.length,
        text: code,
      },
    ];
  }

  // Pass 1: split each line into entries (force-splitting when necessary).
  const entries: Entry[] = [];
  lines.forEach((line, i) => {
    if (line.length > maxChars) {
      for (const part of forceSplit(line, maxChars)) {
        entries.push({ lineNo: i + 1, text: part });
      }
    } else {
      entries.push({ lineNo: i + 1, text: line });
    }
  });

  // Pass 2: greedy packing — if adding an entry would exceed the limit,
  // the current chunk is closed. Every entry alone fits within maxChars,
  // so each chunk always holds at least one entry.
  const pieces: Entry[][] = [];
  let current: Entry[] = [];
  let currentLen = 0;
  let lastLineNo = -1;

  for (const entry of entries) {
    if (current.length > 0) {
      const separator = entry.lineNo === lastLineNo ? 0 : 1;
      if (currentLen + separator + entry.text.length > maxChars) {
        pieces.push(current);
        current = [];
        currentLen = 0;
        lastLineNo = -1;
      }
    }
    const separator = current.length === 0 ? 0 : entry.lineNo === lastLineNo ? 0 : 1;
    current.push(entry);
    currentLen += separator + entry.text.length;
    lastLineNo = entry.lineNo;
  }
  if (current.length > 0) {
    pieces.push(current);
  }

  return pieces.map((piece, i) => ({
    index: i + 1,
    total: pieces.length,
    startLine: piece[0].lineNo,
    endLine: piece[piece.length - 1].lineNo,
    text: entriesToText(piece),
  }));
}
