# Contributing — Critic-MCP

Critic-MCP is an open-source MCP server that reviews the code produced by AI coding assistants in a strictly read-only manner. Thank you in advance for your contributions!

## Project Overview

The server exposes a single tool: `review_code`. It accepts a code snippet and an intent, and returns a review report produced by an LLM. **There is absolutely no file-write capability** — this principle is non-negotiable.

## Local Setup

Requirement: **Node.js >= 20** (CI runs on Node 22).

```bash
git clone <fork-url>
cd Critic-MCP
npm ci                      # clean install, faithful to the lockfile
npm run build               # build
npm test                    # run tests
```

The unit tests mock the SDKs and the file system, so **no real API key is ever required**; the tests never touch the developer's `~/.critic-mcp.json`. For manual LLM-driven experiments:

```bash
node dist/index.js auth     # interactive authentication (writes ~/.critic-mcp.json)
```

## Development Workflow

### Tests first, code second

Unit tests live in `tests/` and are written with Vitest. Every new feature or bug fix must include at least one test.

```bash
npm test            # single run (identical to CI)
npm run test:watch  # watch mode
```

### Strict rules (also enforced by CI)

```bash
npm run typecheck   # tsc --noEmit, must pass with zero errors
npm run build       # dist/ output must build cleanly
```

## Code Standards

- **Naming:** Variables, functions, and file names are always **English**; comments, report output, and documentation are **English** as well.
- **Security:** API keys are stored only via `npx critic-mcp auth` into `~/.critic-mcp.json`, or read from the environment. Never commit hardcoded keys, key logs, or `.env` files. PRs that write keys into IDE configurations will be rejected.
- **Read-only principle:** The server only returns string reports. PRs that add file-system write operations are rejected by rule.
- **YAGNI:** Write only enough code to solve the task at hand; avoid speculative abstractions for the future.
- TypeScript `strict` mode is always on; avoid `any`.

## Zod Schema Rules

The **single source of truth** for the `review_code` input schema is `ReviewCodeInputSchema` in `src/schema.ts`:

- New parameters may only be added to this schema; the `tools/list` output derives from it via `z.toJSONSchema()`.
- Validation messages are written in English.
- Widening limits (`min`/`max`) requires discussing the token budget and the LLM context window first.
- A schema change cannot merge without updating `tests/validation.test.ts`.

## Touching the Map-Reduce Flow

- `src/chunker.ts` — the chunk size guarantee: no chunk may exceed `maxChars`, and line integrity must hold. Relevant tests are in `tests/chunking.test.ts`.
- `src/llm.ts` — the timeout and concurrency limits (`withTimeout`, `mapWithConcurrency`) must be preserved; a single chunk failure must never kill the whole flow.
- `src/prompt.ts` — `REDUCE_SYSTEM_PROMPT` never weakens findings; do not make changes that remove this principle.

## Pull Request Standards

1. Open a branch prefixed with `feat/`, `fix/`, or `docs/` (e.g. `feat/add-anthropic-provider`).
2. Follow **Conventional Commits** for commit messages: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`.
3. One topic per PR; keep it small and focused.
4. Include in the PR description: the intent of the change, the approach, and verification output (`npm test`, `npm run typecheck`).
5. Nothing merges while CI is red.
6. New input fields or behaviors must be reflected in `README.md` and the relevant examples/tests.
7. For changes that affect LLM cost (prompt size, default chunk counts, etc.), include measurements/notes.

## Reporting Security Vulnerabilities

Do not disclose open security vulnerabilities through GitHub Issues. Please report privately to the repository owner — do not share details publicly until a fix plan is established.

## License

This project is MIT licensed. Any contributed code is accepted under the MIT license as well.
