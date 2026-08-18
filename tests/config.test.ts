import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_HINT,
  getConfigPath,
  loadConfig,
  parseProvider,
  resolveCredentials,
  resolveProvider,
  writeConfig,
} from '../src/config.js';

// Each test runs in its own temporary config directory;
// the developer's real ~/.critic-mcp.json is never read/written.
let tmpDir: string;
let tmpConfig: string;

const ENV_KEYS = [
  'CRITIC_CONFIG_PATH',
  'CRITIC_PROVIDER',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-mcp-'));
  tmpConfig = path.join(tmpDir, '.critic-mcp.json');
  process.env.CRITIC_CONFIG_PATH = tmpConfig;
  delete process.env.CRITIC_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('parseProvider', () => {
  it('accepts valid values case-insensitively', () => {
    expect(parseProvider('gemini')).toBe('gemini');
    expect(parseProvider('GEMINI')).toBe('gemini');
    expect(parseProvider(' openai ')).toBe('openai');
    expect(parseProvider('deepseek')).toBe('deepseek');
  });

  it('returns null for invalid values', () => {
    expect(parseProvider('llama')).toBeNull();
    expect(parseProvider('')).toBeNull();
    expect(parseProvider('   ')).toBeNull();
  });
});

describe('getConfigPath', () => {
  it('uses CRITIC_CONFIG_PATH when defined', () => {
    process.env.CRITIC_CONFIG_PATH = '/custom/path/mcp.json';
    expect(getConfigPath()).toBe('/custom/path/mcp.json');
  });

  it('falls back to .critic-mcp.json in the home directory when CRITIC_CONFIG_PATH is unset', () => {
    delete process.env.CRITIC_CONFIG_PATH;
    expect(getConfigPath()).toBe(path.join(os.homedir(), '.critic-mcp.json'));
  });
});

describe('writeConfig / loadConfig', () => {
  it('reads back exactly what was written', () => {
    const config = { provider: 'gemini' as const, gemini: { apiKey: 'test-key' } };
    writeConfig(config, tmpConfig);
    expect(loadConfig(tmpConfig)).toEqual(config);
  });

  it('creates missing directories automatically', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'config.json');
    writeConfig({ provider: 'openai' }, nested);
    expect(loadConfig(nested)).toEqual({ provider: 'openai' });
  });

  it('returns null for a non-existent file', () => {
    expect(loadConfig(tmpConfig)).toBeNull();
  });

  it('returns null for malformed JSON (no crash)', () => {
    fs.writeFileSync(tmpConfig, '{ broken json');
    expect(loadConfig(tmpConfig)).toBeNull();
  });

  it('returns null when the JSON root is not an object', () => {
    fs.writeFileSync(tmpConfig, '"just a string"');
    expect(loadConfig(tmpConfig)).toBeNull();
  });
});

describe('resolveProvider', () => {
  it('prefers CRITIC_PROVIDER when defined', () => {
    process.env.CRITIC_PROVIDER = 'deepseek';
    writeConfig({ provider: 'gemini' }, tmpConfig);
    expect(resolveProvider()).toBe('deepseek');
  });

  it('uses the provider from the config file when env is unset', () => {
    writeConfig({ provider: 'openai' }, tmpConfig);
    expect(resolveProvider()).toBe('openai');
  });

  it('defaults to gemini when neither is present', () => {
    expect(resolveProvider()).toBe('gemini');
  });

  it('throws for an unsupported CRITIC_PROVIDER', () => {
    process.env.CRITIC_PROVIDER = 'llama';
    expect(() => resolveProvider()).toThrow('Unsupported CRITIC_PROVIDER');
  });
});

describe('resolveCredentials', () => {
  it('uses the env key', () => {
    process.env.GEMINI_API_KEY = 'env-key';
    expect(resolveCredentials()).toEqual({ provider: 'gemini', apiKey: 'env-key' });
  });

  it('env key takes precedence over the config file', () => {
    process.env.GEMINI_API_KEY = 'env-key';
    writeConfig({ provider: 'gemini', gemini: { apiKey: 'config-key' } }, tmpConfig);
    expect(resolveCredentials().apiKey).toBe('env-key');
  });

  it('uses the key from the config file when env is unset', () => {
    writeConfig({ provider: 'gemini', gemini: { apiKey: 'config-key' } }, tmpConfig);
    expect(resolveCredentials()).toEqual({ provider: 'gemini', apiKey: 'config-key' });
  });

  it('reads the openai env key via OPENAI_API_KEY', () => {
    process.env.CRITIC_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'oai-key';
    expect(resolveCredentials()).toEqual({ provider: 'openai', apiKey: 'oai-key' });
  });

  it('looks up the deepseek key in its own section of the config file', () => {
    process.env.CRITIC_PROVIDER = 'deepseek';
    writeConfig({ provider: 'deepseek', deepseek: { apiKey: 'ds-key' } }, tmpConfig);
    expect(resolveCredentials().apiKey).toBe('ds-key');
  });

  it('throws an auth-command hint error when both env and config are empty', () => {
    expect(() => resolveCredentials()).toThrow(AUTH_HINT);
    expect(() => resolveCredentials()).toThrow('npx critic-mcp auth');
  });
});
