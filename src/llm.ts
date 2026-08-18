// LLM client layer. Provider and API key are resolved via src/config.ts:
// process.env first, then ~/.critic-mcp.json.
// Short code goes through a direct analysis; long code is reviewed chunk by
// chunk via map-reduce and merged into a single final report.
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { chunkCode, DEFAULT_CHUNK_SIZE } from './chunker.js';
import { resolveCredentials, resolveProvider, type Provider } from './config.js';
import {
  buildMapUserPrompt,
  buildReduceUserPrompt,
  buildUserPrompt,
  REDUCE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from './prompt.js';

export type { Provider };

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CONCURRENCY = 3;

function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getTimeoutMs(): number {
  return positiveEnv('CRITIC_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
}

function getConcurrency(): number {
  const value = Math.floor(positiveEnv('CRITIC_CONCURRENCY', DEFAULT_CONCURRENCY));
  return Math.max(1, value);
}

function getChunkSize(): number {
  return Math.floor(positiveEnv('CHUNK_SIZE', DEFAULT_CHUNK_SIZE));
}

// SDK-independent timeout protection: if no response arrives the Promise is
// rejected, so a request can never wedge the MCP side.
export function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const ms = getTimeoutMs();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`LLM response timed out (${ms} ms).`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const { apiKey } = resolveCredentials();
  const client = new GoogleGenAI({ apiKey });
  const response = await withTimeout(
    client.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    }),
  );
  return response.text ?? '';
}

// OpenAI and DeepSeek share the same client; for DeepSeek the base URL and
// default model are configured automatically (can be overridden via OPENAI_BASE_URL).
async function callOpenAiCompatible(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const { apiKey } = resolveCredentials();
  const baseURL = process.env.OPENAI_BASE_URL
    ? process.env.OPENAI_BASE_URL
    : provider === 'deepseek'
      ? 'https://api.deepseek.com'
      : undefined;
  const model =
    process.env.OPENAI_MODEL ?? (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');

  const client = new OpenAI({ apiKey, baseURL, timeout: getTimeoutMs() });
  const completion = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  );
  return completion.choices[0]?.message?.content ?? '';
}

// Single entry point: provider selection + call + error normalization.
export async function sendToLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = resolveProvider();
  try {
    if (provider === 'gemini') {
      return await callGemini(systemPrompt, userPrompt);
    }
    return await callOpenAiCompatible(provider, systemPrompt, userPrompt);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM request failed (provider: ${provider}) — ${detail}`);
  }
}

// Parallel mapping with a concurrency limit: at most `limit` LLM requests run
// at the same time, which reduces the risk of hitting rate limits (429).
// Each chunk is caught independently; one chunk failure does not kill the rest.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Full review flow: a code below the chunking limit goes through direct
// analysis; above it, map-reduce (partial analyses + final synthesis) is used.
export async function reviewCode(codeSnippet: string, intent: string): Promise<string> {
  const chunks = chunkCode(codeSnippet, getChunkSize());

  // Below the limit: the existing direct analysis flow.
  if (chunks.length === 1) {
    return sendToLLM(SYSTEM_PROMPT, buildUserPrompt(codeSnippet, intent));
  }

  const partials = await mapWithConcurrency(
    chunks,
    getConcurrency(),
    async (chunk) => {
      try {
        // The main critic rules are preserved for chunk analysis;
        // the output format is additionally specified in the map prompt.
        return await sendToLLM(SYSTEM_PROMPT, buildMapUserPrompt(chunk, intent));
      } catch (error) {
        // A single chunk failure must not kill the whole review; it is flagged at reduce time.
        const detail = error instanceof Error ? error.message : String(error);
        return `[Chunk ${chunk.index}/${chunk.total} could not be analyzed: ${detail}]`;
      }
    },
  );

  return sendToLLM(REDUCE_SYSTEM_PROMPT, buildReduceUserPrompt(partials, intent));
}
