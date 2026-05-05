/**
 * Code review backend using Codex CLI (`codex review`).
 *
 * Invokes the `codex` CLI with `--json-schema` so the output conforms to the
 * shared {@link CodeReviewResult} schema.
 */

import {
  CODE_REVIEW_JSON_SCHEMA,
  type CodeReviewResult,
  type ReviewBackend,
  type ReviewOptions,
} from "./review-schema.ts";

const DEFAULT_BASE = "main";

async function spawn(
  cmd: string[],
  cwd?: string,
  timeoutMs = 300_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  });

  const timeout = setTimeout(() => {
    proc.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  } finally {
    clearTimeout(timeout);
  }
}

export async function reviewByCodex(options: ReviewOptions = {}): Promise<CodeReviewResult> {
  const base = options.base ?? DEFAULT_BASE;
  const cwd = options.cwd;

  const schemaJson = JSON.stringify(CODE_REVIEW_JSON_SCHEMA);

  const args = ["codex", "review", "--base", base, "--json-schema", schemaJson];

  const result = await spawn(args, cwd);

  if (result.exitCode !== 0) {
    throw new Error(`codex CLI exited with code ${result.exitCode}: ${result.stderr}`);
  }

  const parsed: CodeReviewResult = JSON.parse(result.stdout);
  return parsed;
}

export const codexReviewer: ReviewBackend = {
  review: reviewByCodex,
};
