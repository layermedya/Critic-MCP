// Interactive authentication flow: the `critic-mcp auth` command.
// Works like aws configure / gh auth login: asks for the provider and API key,
// and stores the answers in ~/.critic-mcp.json with 0o600 permissions.
import * as readline from 'node:readline/promises';
import {
  getConfigPath,
  loadConfig,
  parseProvider,
  writeConfig,
  type CriticConfig,
  type Provider,
} from './config.js';

// The read/write surface is abstract so the flow can be driven with mocks in tests.
export interface AuthIO {
  question(prompt: string): Promise<string>;
  print(line: string): void;
  close(): void;
}

// Line-queue based stdio interface: with piped/scripted input, lines may
// arrive before a question is asked; arriving lines are queued instead of
// being lost. This makes both interactive terminals and piped scenarios like
// `printf "gemini\nkey\n" | critic-mcp auth` safe.
export function createStdioIO(): AuthIO {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const queue: string[] = [];
  const waiting: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter.resolve(line);
    else queue.push(line);
  });

  rl.on('close', () => {
    closed = true;
    for (const waiter of waiting.splice(0)) {
      waiter.reject(new Error('Input stream closed. Authentication was aborted.'));
    }
  });

  return {
    question: (prompt) => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift() as string);
      }
      if (closed) {
        return Promise.reject(new Error('Input stream closed. Authentication was aborted.'));
      }
      process.stdout.write(prompt);
      return new Promise<string>((resolve, reject) => {
        waiting.push({ resolve, reject });
      });
    },
    print: (line) => process.stdout.write(line + '\n'),
    close: () => rl.close(),
  };
}

// Core of the authentication flow. Returns the saved provider on success.
export async function runAuthFlow(
  io: AuthIO,
  configPath: string = getConfigPath(),
): Promise<Provider> {
  io.print('\n=== Critic-MCP Authentication ===');

  let provider: Provider | null = null;
  while (!provider) {
    const answer = await io.question(
      'Which provider will you use? (gemini/openai/deepseek): ',
    );
    provider = parseProvider(answer);
    if (!provider) {
      io.print('Invalid selection. Please type gemini, openai or deepseek.');
    }
  }

  let apiKey = '';
  while (!apiKey.trim()) {
    apiKey = await io.question('Enter your API Key: ');
    if (!apiKey.trim()) {
      io.print('API key cannot be empty.');
    }
  }

  // Existing keys for other providers are preserved; only the active one is updated.
  const existing = loadConfig(configPath) ?? {};
  const config: CriticConfig = { ...existing, provider };
  config[provider] = { ...(config[provider] ?? {}), apiKey: apiKey.trim() };
  writeConfig(config, configPath);

  io.print(`\nAPI Key saved successfully to: ${configPath}`);
  io.print(`Active provider: ${provider}`);
  io.print('Now add only this to your MCP client configuration:');
  io.print('  {"command": "npx", "args": ["-y", "critic-mcp"]}');
  io.close();
  return provider;
}

// Entry point when run directly from the terminal.
export async function runAuth(): Promise<void> {
  const io = createStdioIO();
  try {
    await runAuthFlow(io);
  } catch (error) {
    io.close();
    throw error;
  }
}
