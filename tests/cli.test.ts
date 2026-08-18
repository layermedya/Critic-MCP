import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAuthFlow, type AuthIO } from '../src/cli.js';
import { loadConfig } from '../src/config.js';

// Fake interface that returns the given answers in order and records all output.
function createMockIO(answers: string[]): { io: AuthIO; printed: string[] } {
  const printed: string[] = [];
  let next = 0;
  const io: AuthIO = {
    question: async () => {
      const answer = answers[next++];
      if (answer === undefined) throw new Error('More questions asked than answers provided.');
      return answer;
    },
    print: (line) => printed.push(line),
    close: () => {},
  };
  return { io, printed };
}

let tmpDir: string;
let tmpConfig: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-mcp-cli-'));
  tmpConfig = path.join(tmpDir, '.critic-mcp.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runAuthFlow — interactive authentication', () => {
  it('saves the provider and key to the config file on a valid flow', async () => {
    const { io } = createMockIO(['gemini', 'secret-key-123']);
    const provider = await runAuthFlow(io, tmpConfig);

    expect(provider).toBe('gemini');
    const saved = loadConfig(tmpConfig);
    expect(saved).toEqual({
      provider: 'gemini',
      gemini: { apiKey: 'secret-key-123' },
    });
  });

  it('success message shows the file path and the active provider', async () => {
    const { io, printed } = createMockIO(['openai', 'key']);
    await runAuthFlow(io, tmpConfig);

    const all = printed.join('\n');
    expect(all).toContain(tmpConfig);
    expect(all).toContain('openai');
    expect(all).toContain('npx');
  });

  it('asks again when an invalid provider is selected', async () => {
    const { io, printed } = createMockIO(['llama', 'gemini', 'key']);
    const provider = await runAuthFlow(io, tmpConfig);

    expect(provider).toBe('gemini');
    expect(printed.join('\n')).toContain('Invalid selection');
  });

  it('asks again when an empty key is entered', async () => {
    const { io, printed } = createMockIO(['gemini', '   ', 'real-key']);
    await runAuthFlow(io, tmpConfig);

    expect(printed.join('\n')).toContain('cannot be empty');
    expect(loadConfig(tmpConfig)?.gemini?.apiKey).toBe('real-key');
  });

  it('preserves keys of other providers when a config file already exists', async () => {
    fs.writeFileSync(
      tmpConfig,
      JSON.stringify({ provider: 'openai', openai: { apiKey: 'old-oai', gemini: undefined } }),
    );
    const { io } = createMockIO(['gemini', 'new-gemini']);
    await runAuthFlow(io, tmpConfig);

    const saved = loadConfig(tmpConfig);
    expect(saved?.provider).toBe('gemini');
    expect(saved?.gemini?.apiKey).toBe('new-gemini');
    expect(saved?.openai?.apiKey).toBe('old-oai');
  });

  it('trims leading/trailing whitespace from the entered key', async () => {
    const { io } = createMockIO(['deepseek', '  padded-key  ']);
    await runAuthFlow(io, tmpConfig);
    expect(loadConfig(tmpConfig)?.deepseek?.apiKey).toBe('padded-key');
  });
});
