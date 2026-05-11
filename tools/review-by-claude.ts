/**
 * CLI wrapper for Claude-based code review.
 *
 * Usage:
 *   bun run tools/review-by-claude.ts [--base <branch>]
 *
 * Outputs structured JSON (CodeReviewResult) to stdout.
 */

import { parseArgs } from "util";
import { reviewByClaude } from "./lib/review-by-claude.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    base: { type: "string", default: "main" },
  },
});

const result = await reviewByClaude({ base: values.base });
console.log(JSON.stringify(result, null, 2));
