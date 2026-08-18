// Global configuration and credential resolution layer.
// API keys are resolved with priority: (1) process.env, (2) ~/.critic-mcp.json.
// The configuration file is created by the `critic-mcp auth` command.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Provider = 'gemini' | 'openai' | 'deepseek';

export interface CriticConfig {
  provider?: Provider;
  gemini?: { apiKey?: string };
  openai?: { apiKey?: string };
  deepseek?: { apiKey?: string };
}

export interface ResolvedCredentials {
  provider: Provider;
  apiKey: string;
}

export const CONFIG_FILE_NAME = '.critic-mcp.json';

export const AUTH_HINT = "Please run 'npx critic-mcp auth' first to authenticate.";

// If CRITIC_CONFIG_PATH is set it is used; otherwise the config lives at
// ~/.critic-mcp.json (useful for tests and custom setups).
export function getConfigPath(): string {
  return process.env.CRITIC_CONFIG_PATH ?? path.join(os.homedir(), CONFIG_FILE_NAME);
}

export function parseProvider(value: string): Provider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'gemini' || normalized === 'openai' || normalized === 'deepseek') {
    return normalized;
  }
  return null;
}

// Returns null when the file is missing or malformed; the caller is then
// expected to keep falling back through the env layer.
export function loadConfig(configPath: string = getConfigPath()): CriticConfig | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as CriticConfig;
  } catch {
    return null;
  }
}

// Writes the config file with 0o600 permissions (Unix), creating directories as needed.
export function writeConfig(config: CriticConfig, configPath: string = getConfigPath()): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

// Provider precedence: CRITIC_PROVIDER env → config file → default 'gemini'.
export function resolveProvider(): Provider {
  const envProvider = process.env.CRITIC_PROVIDER;
  if (envProvider) {
    const parsed = parseProvider(envProvider);
    if (!parsed) {
      throw new Error(
        `Unsupported CRITIC_PROVIDER: "${envProvider}". Valid values: gemini, openai, deepseek.`,
      );
    }
    return parsed;
  }
  const config = loadConfig();
  if (config?.provider) {
    const parsed = parseProvider(config.provider);
    if (parsed) return parsed;
  }
  return 'gemini';
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

// Credential resolution: env first, then ~/.critic-mcp.json.
// When neither provides a key, throws an error pointing at the auth command.
export function resolveCredentials(): ResolvedCredentials {
  const provider = resolveProvider();
  const config = loadConfig();

  const envKey =
    provider === 'gemini'
      ? nonEmpty(process.env.GEMINI_API_KEY)
      : nonEmpty(process.env.OPENAI_API_KEY);
  const apiKey = envKey ?? nonEmpty(config?.[provider]?.apiKey);

  if (!apiKey) {
    const envName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${envName} was found neither in environment variables nor in ${CONFIG_FILE_NAME}. ${AUTH_HINT}`,
    );
  }
  return { provider, apiKey };
}
