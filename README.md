# Critic-MCP — The Ruthless Code Critic

An open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that reviews — read-only — the code produced by other AI coding assistants (Cursor, OpenCode, Cline, etc.).

Critic-MCP is a "second pair of eyes": it never fixes your code, it only critiques it without mercy. It exposes a single tool (`review_code`) and has **absolutely no file-write capability**.

## What does it do?

The `review_code` tool compares the code you send against the original requirement (intent) and, through an LLM, produces a review report with the following sections:

- **Verdict:** `APPROVED` | `MODIFICATION_REQUIRED` | `REJECTED`
- **Missing Requirements** — the gap between intent and code
- **Security Findings** — SQL injection, XSS, privilege escalation, hardcoded secrets
- **Edge-Case Findings** — null/empty inputs, boundary values, off-by-one, race conditions
- **Performance Findings** — N+1 queries, memory leaks, redundant computation
- **Other Findings** + **Must-Fix Items** (in priority order)

## Installation — Two Steps

Requirement: **Node.js >= 20**

### Step 1: Authenticate (one time)

Run the interactive setup, which works just like `aws configure` or `gh auth login`:

```bash
npx -y critic-mcp auth
```

It asks which provider you use (`gemini` / `openai` / `deepseek`), prompts for your API key, and saves both to `~/.critic-mcp.json` in your home directory (`0600` permissions on Unix).

### Step 2: Add it to your IDE

Add only this to your IDE's MCP settings:

```json
{ "command": "npx", "args": ["-y", "critic-mcp"] }
```

See the [AI Assistant Integration](#ai-assistant-integration) section for client-specific details. That's it — your keys now live in one place, outside every IDE configuration.

> Keys are never written into IDE configs. When the server starts it looks at `process.env` first, then at `~/.critic-mcp.json`; if a key is found in neither, it directs you to `npx critic-mcp auth`.

### Local development (install from source)

```bash
git clone https://github.com/layermedya/Critic-MCP.git
cd Critic-MCP
npm ci
npm run build
node dist/index.js auth   # authenticate against your own build
```

## Commands

```bash
npm run build       # TypeScript compilation
npm run typecheck   # Type checking
npm test            # Vitest unit tests
npm run test:watch  # Tests in watch mode
npm start           # Start the server on stdio
npm run inspect     # Manual testing in the browser via MCP Inspector
```

## Environment Variables (optional)

All of these are **optional**; the normal path for API keys is `npx critic-mcp auth`. Environment variables always take **precedence** over the config file (for CI/server setups).

| Variable | Description |
|---|---|
| `CRITIC_PROVIDER` | `gemini`, `openai` or `deepseek` (falls back to the choice in `~/.critic-mcp.json`, then to `gemini`) |
| `GEMINI_API_KEY` | Gemini key (overrides the file when set) |
| `OPENAI_API_KEY` | OpenAI/DeepSeek key (overrides the file when set) |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-3.6-flash`) |
| `OPENAI_MODEL` | Model name (default: `gpt-4o-mini`, `deepseek-chat` for deepseek) |
| `OPENAI_BASE_URL` | Base URL for DeepSeek etc. (deepseek defaults to `https://api.deepseek.com`) |
| `CRITIC_TIMEOUT_MS` | LLM request timeout (default: `120000`) |
| `CHUNK_SIZE` | Chunking limit (default: `30000` characters) |
| `CRITIC_CONCURRENCY` | Parallel requests during chunked review (default: `3`) |
| `CRITIC_CONFIG_PATH` | Overrides the config file location (default: `~/.critic-mcp.json`) |

## AI Assistant Integration

None of the configurations below carry any keys; you authenticate once via the `auth` command (Step 1 above). `npx` requires the package to be published on npm; for a local clone you can instead use `"command": "node", "args": ["ABSOLUTE_PATH/dist/index.js"]`.

### Cursor

In the project-level `.cursor/mcp.json` (or the global `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "critic": {
      "command": "npx",
      "args": ["-y", "critic-mcp"]
    }
  }
}
```

Alternatively: **Settings → MCP → Add new MCP server**, then paste the JSON.

### OpenCode

In the project-level `.opencode/opencode.json` or the global `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "critic": {
      "type": "local",
      "command": ["npx", "-y", "critic-mcp"],
      "enabled": true
    }
  }
}
```

> OpenCode uses the `mcp` key (not `mcpServers`) and the `environment` field (not `env`); `command` must be an **array**. You no longer need to write keys into an `environment` block.

### Cline (VS Code extension)

Open the Cline panel → **MCP Servers** tab → **Edit Global MCP** or **Edit Project MCP**, then edit the JSON:

```json
{
  "mcpServers": {
    "critic": {
      "command": "npx",
      "args": ["-y", "critic-mcp"],
      "disabled": false,
      "autoApprove": ["review_code"]
    }
  }
}
```

> `autoApprove` lets Cline run `review_code` without confirmation; it is safe because the tool never writes files.

### Continue.dev

Add the MCP server to `~/.continue/config.json` (stdio transport is supported regardless of your Continue version):

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "critic-mcp"]
        }
      }
    ]
  }
}
```

## Manual Test Scenario

`examples/bad_code.js` is an Express example that deliberately contains SQL injection, XSS, and N+1 queries; `examples/intent.txt` holds the original requirement. Invoke it from any client as follows:

> "Review the code in examples/bad_code.js with the review_code tool. Requirement: examples/intent.txt"

Expect the critic to catch at least the following:
- **CRITICAL:** `db.query("SELECT * FROM users WHERE email = '" ...)` — SQL injection
- **CRITICAL:** `res.send(comment.body)` — stored XSS
- **HIGH:** A separate query per user — N+1 problem

## Architecture

```
src/index.ts   -> MCP server, zod validation, error handling + `auth` argv routing
src/cli.ts     -> Interactive authentication flow (`critic-mcp auth`)
src/config.ts  -> Global config (~/.critic-mcp.json) + credential resolution (env → file)
src/prompt.ts  -> Ruthless Critic system prompt + chunked-review prompts
src/llm.ts     -> Provider layer + timeout protection + map-reduce orchestration
src/chunker.ts -> Line-ending based chunking (for code above the limit)
```

### Chunked review (map-reduce)

When `code_snippet` exceeds `CHUNK_SIZE` (default **30,000** characters), the system automatically switches to a **map-reduce** flow:

1. **Map:** The code is split at line boundaries; every chunk is sent to the LLM concurrently (default **3** parallel requests, configurable via `CRITIC_CONCURRENCY`). A single chunk failure never halts the whole review.
2. **Reduce:** All returned partial analyses are merged by the "Synthesizer" prompt — which never weakens findings and never returns APPROVED when a single part reports CRITICAL — into **one final report**.

The server only returns a string report; it carries no file-write capability and never exposes a network client outward.

## License

MIT
