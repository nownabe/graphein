/**
 * CLI wrapper for Codex-based code review.
 *
 * Usage:
 *   bun run tools/review-by-codex.ts [--base <branch>]
 *
 * Outputs structured JSON (CodeReviewResult) to stdout.
 */

import { parseArgs } from "util";
import { reviewByCodex } from "./lib/review-by-codex.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    base: { type: "string", default: "main" },
  },
});

const result = await reviewByCodex({ base: values.base });
console.log(JSON.stringify(result, null, 2));
