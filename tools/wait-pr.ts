#!/usr/bin/env bun
/**
 * wait-pr: CLI wrapper for the wait-pr library.
 *
 * Usage:
 *   bun run tools/wait-pr.ts <pr-number> [--reviewer <user>] [--since <ISO8601>]
 *
 * Polls every 30s (up to 10 times = ~5 min). When a change is detected the tool
 * waits a few seconds for related data to settle, then re-fetches and exits.
 * Only feedback posted after the --since timestamp (or tool start time if
 * omitted) is reported.
 *
 * The JSON output includes a "status" field indicating the result:
 *   approved      LGTM received and all CI checks passed
 *   ci_failed     one or more CI checks failed
 *   has_feedback  review comments or PR comments to address
 *   merged        PR was merged
 *   closed        PR was closed without merging
 *   pending       nothing actionable yet (poll timed out, call again)
 *
 * Exit code is always 0 on success. Non-zero only on errors.
 */

import { parseArgs } from "util";
import { waitPr } from "./lib/wait-pr";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    reviewer: { type: "string", default: "nownabe" },
    since: { type: "string" },
  },
  allowPositionals: true,
});

const prNumber = positionals[0];
if (!prNumber) {
  console.error(`Usage:
  bun run tools/wait-pr.ts <pr-number> [--reviewer <user>] [--since <ISO8601>]

Polls every 30s (up to 10 times) and exits when an actionable state is reached.
Uses --since (or the current time if omitted) as the baseline for filtering feedback.

The JSON output includes a "status" field: approved, ci_failed, has_feedback, merged, closed, or pending.
Exit code is always 0 on success. Non-zero only on errors.`);
  process.exit(1);
}

console.error(`Polling PR #${prNumber} every 30s (max 10 checks)...`);

const result = await waitPr({
  prNumber,
  reviewer: values.reviewer,
  since: values.since ? new Date(values.since) : undefined,
});

console.log(JSON.stringify(result, null, 2));
