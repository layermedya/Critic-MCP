#!/usr/bin/env node
import 'dotenv/config';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { reviewCode } from './llm.js';
import { ReviewCodeInputSchema, type ReviewCodeInput } from './schema.js';

// CLI routing: when the `auth` argument is given, the MCP server is NOT
// started; instead the interactive authentication flow runs.
if (process.argv.slice(2).includes('auth')) {
  const { runAuth } = await import('./cli.js');
  try {
    await runAuth();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const server = new Server({
  name: 'critic-mcp',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'review_code',
      description:
        'Read-only code critic. Analyzes the provided code snippet against its stated intent and returns a detailed, ruthless review report: missing requirements, security vulnerabilities (SQLi, XSS, privilege escalation), edge cases and performance issues (N+1, memory leaks). Never writes files — returns the report as text only.',
      inputSchema: z.toJSONSchema(ReviewCodeInputSchema),
    },
  ],
}));

// On error, a structured JSON-RPC response with the isError flag is
// returned to the MCP client.
function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'review_code') {
    return toolError(`Unknown tool: ${request.params.name}`);
  }

  const parsed = ReviewCodeInputSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    return toolError(`Invalid input:\n${issues}`);
  }

  const { code_snippet, intent }: ReviewCodeInput = parsed.data;

  try {
    // Size management: code above the limit is reviewed via chunks (map-reduce).
    // Below the limit, the existing direct analysis flow is preserved.
    const report = await reviewCode(code_snippet, intent);
    if (!report.trim()) {
      return toolError('The LLM returned an empty response. Check your model configuration.');
    }
    return { content: [{ type: 'text', text: report }] };
  } catch (error) {
    // Rate limits, timeouts, network errors etc. are caught here.
    const detail = error instanceof Error ? error.message : String(error);
    return toolError(`Code review could not be completed: ${detail}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Critic MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
