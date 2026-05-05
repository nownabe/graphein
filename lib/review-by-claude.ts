/**
 * Code review backend using Claude Code CLI (`claude -p --json-schema`).
 *
 * Invokes the `claude` CLI in print mode with a review prompt and the shared
 * JSON schema so the output is always a structured {@link CodeReviewResult}.
 */

import {
  CODE_REVIEW_JSON_SCHEMA,
  REVIEW_PROMPT,
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

export async function reviewByClaude(options: ReviewOptions = {}): Promise<CodeReviewResult> {
  const base = options.base ?? DEFAULT_BASE;
  const cwd = options.cwd;

  const prompt = REVIEW_PROMPT.replaceAll("{base}", base);
  const schemaJson = JSON.stringify(CODE_REVIEW_JSON_SCHEMA);

  const args = ["claude", "-p", prompt, "--output-format", "json", "--json-schema", schemaJson];

  const result = await spawn(args, cwd);

  if (result.exitCode !== 0) {
    throw new Error(`claude CLI exited with code ${result.exitCode}: ${result.stderr}`);
  }

  const envelope = JSON.parse(result.stdout) as {
    structured_output?: CodeReviewResult;
  };

  if (!envelope.structured_output) {
    throw new Error("claude CLI response missing structured_output field");
  }

  return envelope.structured_output;
}

export const claudeReviewer: ReviewBackend = {
  review: reviewByClaude,
};
