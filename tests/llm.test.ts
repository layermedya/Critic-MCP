import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake SDK echoes: the flow is tested without any real API call.
const mockGenerateContent = vi.fn();
const mockChatCreate = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockChatCreate } };
  },
}));

const { sendToLLM, withTimeout, mapWithConcurrency } = await import('../src/llm.js');

// Points to a non-existent temp path so the tests never touch the developer's
// real ~/.critic-mcp.json and the env→config resolution order can be
// tested in a controlled way.
let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-mcp-llm-'));
  process.env.CRITIC_CONFIG_PATH = path.join(tmpDir, 'missing.json');
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CRITIC_CONFIG_PATH;
});

// Real timeout used by the tests: 100 ms
const ORIGINAL_TIMEOUT_MS = process.env.CRITIC_TIMEOUT_MS;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withTimeout — timeout protection', () => {
  beforeEach(() => {
    process.env.CRITIC_TIMEOUT_MS = '100';
  });

  afterAll(() => {
    if (ORIGINAL_TIMEOUT_MS === undefined) {
      delete process.env.CRITIC_TIMEOUT_MS;
    } else {
      process.env.CRITIC_TIMEOUT_MS = ORIGINAL_TIMEOUT_MS;
    }
  });

  it('returns the result of a Promise that resolves within the limit', async () => {
    const result = await withTimeout(Promise.resolve('fast response'));
    expect(result).toBe('fast response');
  });

  it('returns the result of a slow Promise that still resolves within the limit', async () => {
    const slow = (async () => {
      await delay(10);
      return 'still made it';
    })();
    await expect(withTimeout(slow)).resolves.toBe('still made it');
  });

  it('rejects with a timeout error message when the limit is exceeded', async () => {
    const never = (async () => {
      await delay(500);
      return 'will never arrive';
    })();
    await expect(withTimeout(never)).rejects.toThrow('timed out (100 ms)');
  });

  it('propagates the rejection when the inner Promise rejects', async () => {
    const failing = Promise.reject(new Error('inner error'));
    await expect(withTimeout(failing)).rejects.toThrow('inner error');
  });

  it('falls back to the default on an invalid CRITIC_TIMEOUT_MS (no crash)', async () => {
    process.env.CRITIC_TIMEOUT_MS = 'invalid-value';
    const slow = (async () => {
      await delay(50);
      return 'ok';
    })();
    await expect(withTimeout(slow)).resolves.toBe('ok');
  });
});

describe('sendToLLM — Gemini provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRITIC_TIMEOUT_MS = '5000';
    process.env.CRITIC_PROVIDER = 'gemini';
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('throws an auth-command hint error when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(sendToLLM('system', 'user')).rejects.toThrow('npx critic-mcp auth');
    await expect(sendToLLM('system', 'user')).rejects.toThrow('GEMINI_API_KEY');
  });

  it('throws for an unsupported provider', async () => {
    process.env.CRITIC_PROVIDER = 'llama';
    await expect(sendToLLM('system', 'user')).rejects.toThrow('Unsupported CRITIC_PROVIDER');
  });

  it('returns the mock SDK response as text on a successful call', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    mockGenerateContent.mockResolvedValueOnce({
      text: '# CODE REVIEW REPORT\n## Verdict: APPROVED',
    });

    const report = await sendToLLM('system prompt', 'user prompt');

    expect(report).toContain('CODE REVIEW REPORT');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-test-model',
      contents: 'user prompt',
      config: { systemInstruction: 'system prompt' },
    });
  });

  it('normalizes SDK errors with a provider tag', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    mockGenerateContent.mockRejectedValueOnce(new Error('429 resource exhausted'));

    await expect(sendToLLM('system', 'user')).rejects.toThrow(
      'LLM request failed (provider: gemini) — 429 resource exhausted',
    );
  });

  it('returns an empty string for an empty text response (caught upstream)', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    mockGenerateContent.mockResolvedValueOnce({ text: undefined });
    await expect(sendToLLM('system', 'user')).resolves.toBe('');
  });
});

describe('sendToLLM — OpenAI-compatible provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRITIC_TIMEOUT_MS = '5000';
    process.env.CRITIC_PROVIDER = 'openai';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
  });

  it('throws an auth-command hint error when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(sendToLLM('system', 'user')).rejects.toThrow('npx critic-mcp auth');
  });

  it('returns the mock completions response on a successful call', async () => {
    process.env.OPENAI_API_KEY = 'fake-key';
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'OpenAI report' } }],
    });

    const report = await sendToLLM('system', 'user');
    expect(report).toBe('OpenAI report');
    expect(mockChatCreate).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
    });
  });

  it('uses deepseek-chat for the deepseek provider when the model is unset', async () => {
    process.env.CRITIC_PROVIDER = 'deepseek';
    process.env.OPENAI_API_KEY = 'fake-key';
    delete process.env.OPENAI_MODEL;
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'deepseek report' } }],
    });

    await sendToLLM('system', 'user');
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek-chat' }),
    );
  });

  it('OPENAI_MODEL environment variable overrides the default', async () => {
    process.env.OPENAI_API_KEY = 'fake-key';
    process.env.OPENAI_MODEL = 'custom-model';
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'custom' } }],
    });

    await sendToLLM('system', 'user');
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
    );
  });
});

describe('mapWithConcurrency — concurrency limit', () => {
  it('preserves the input order in the results', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      await delay(Math.random() * 5);
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds the limit of concurrent requests', async () => {
    let inFlight = 0;
    let maxFlight = 0;
    await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7, 8],
      3,
      async (n) => {
        inFlight++;
        maxFlight = Math.max(maxFlight, inFlight);
        await delay(10);
        inFlight--;
        return n;
      },
    );
    expect(maxFlight).toBeLessThanOrEqual(3);
    // Also verify that real parallelism occurs: more than one request overlapped.
    expect(maxFlight).toBeGreaterThan(1);
  });

  it('opens at most as many workers as there are items when the limit is larger', async () => {
    let inFlight = 0;
    let maxFlight = 0;
    await mapWithConcurrency(
      [1, 2],
      10,
      async (n) => {
        inFlight++;
        maxFlight = Math.max(maxFlight, inFlight);
        await delay(5);
        inFlight--;
        return n;
      },
    );
    expect(maxFlight).toBe(2);
  });
});
