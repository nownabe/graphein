#!/usr/bin/env bun
/**
 * comment-pr: Post a comment on a pull request with an agent footer.
 *
 * Usage:
 *   bun run tools/comment-pr.ts <pr-number> --agent <agent> --body <body>
 *   bun run tools/comment-pr.ts <pr-number> --agent <agent> --model <model> --body-file <path>
 *
 * The comment body is read from --body (inline string) or --body-file (file path).
 * A footer line is automatically appended:
 *   With --model:    <sub>_Posted by <agent> (<model>)_</sub>
 *   Without --model: <sub>_Posted by <agent>_</sub>
 */

import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    agent: { type: "string" },
    model: { type: "string" },
    body: { type: "string" },
    "body-file": { type: "string" },
  },
  allowPositionals: true,
});

const prNumber = positionals[0];
const agent = values.agent;
const model = values.model;
const bodyInline = values.body;
const bodyFile = values["body-file"];

if (!prNumber || !agent || (!bodyInline && !bodyFile)) {
  console.error(`Usage:
  bun run tools/comment-pr.ts <pr-number> --agent <agent> [--model <model>] --body <body>
  bun run tools/comment-pr.ts <pr-number> --agent <agent> [--model <model>] --body-file <path>

Required:
  <pr-number>    Pull request number
  --agent        Agent name (e.g. "Claude Code")
  --body         Comment body (inline)
  --body-file    Path to a file containing the comment body

Optional:
  --model        Model name (e.g. "Opus 4.6")

One of --body or --body-file must be provided.`);
  process.exit(1);
}

let commentBody: string;
if (bodyFile) {
  const file = Bun.file(bodyFile);
  if (!(await file.exists())) {
    console.error(`Error: body file not found: ${bodyFile}`);
    process.exit(1);
  }
  commentBody = await file.text();
} else {
  commentBody = bodyInline!;
}

const footer = model
  ? `\n\n<sub>_Posted by ${agent} (${model})_</sub>`
  : `\n\n<sub>_Posted by ${agent}_</sub>`;
const fullBody = commentBody.trimEnd() + footer;

const proc = Bun.spawn(["gh", "pr", "comment", prNumber, "--body", fullBody], {
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
