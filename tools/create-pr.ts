#!/usr/bin/env bun
/**
 * create-pr: Create a GitHub PR and return its URL/number.
 *
 * Usage:
 *   bun run tools/create-pr.ts --title <title> --body <body> [--assignee <user>] [--labels <l1,l2>] [--draft] [--base <branch>]
 *
 * Outputs JSON to stdout:
 *   { "url": "https://github.com/.../pull/123", "number": "123" }
 *
 * Exit code is 0 on success, non-zero on failure.
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    title: { type: "string" },
    body: { type: "string" },
    assignee: { type: "string", default: "nownabe" },
    labels: { type: "string" },
    draft: { type: "boolean", default: false },
    base: { type: "string" },
  },
});

if (!values.title || !values.body) {
  console.error("Error: --title and --body are required");
  process.exit(1);
}

const ghArgs = [
  "pr",
  "create",
  "--title",
  values.title,
  "--body",
  values.body,
  "--assignee",
  values.assignee!,
];

if (values.labels) {
  ghArgs.push("--label", values.labels);
}
if (values.draft) {
  ghArgs.push("--draft");
}
if (values.base) {
  ghArgs.push("--base", values.base);
}

const proc = Bun.spawn(["gh", ...ghArgs], {
  stdout: "pipe",
  stderr: "pipe",
});

const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (exitCode !== 0) {
  console.error(`Failed to create PR: ${stderr.trim()}`);
  process.exit(1);
}

const url = stdout.trim();
const number = url.split("/").pop()!;

console.log(JSON.stringify({ url, number }, null, 2));
