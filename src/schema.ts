import { z } from 'zod';

// Strict input schema for review_code: the single source of truth for both
// the tools/list output and call-time validation.
export const ReviewCodeInputSchema = z.object({
  code_snippet: z
    .string()
    .min(1, 'code_snippet cannot be empty.')
    .max(200_000, 'code_snippet is too long (max 200,000 characters).'),
  intent: z
    .string()
    .min(1, 'intent cannot be empty.')
    .max(20_000, 'intent is too long (max 20,000 characters).'),
});
export type ReviewCodeInput = z.infer<typeof ReviewCodeInputSchema>;
