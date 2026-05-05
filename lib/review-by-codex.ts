/**
 * Code review backend using Codex CLI (`codex exec review`).
 *
 * Invokes `codex exec review --base <base> -o <file>` with a custom prompt
 * that instructs the model to output JSON conforming to the shared
 * {@link CodeReviewResult} schema.
 */

import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CODE_REVIEW_JSON_SCHEMA,
  type CodeReviewResult,
  type ReviewBackend,
  type ReviewOptions,
} from "./review-schema.ts";

const DEFAULT_BASE = "main";

const REVIEW_PROMPT = `Output your review as a single JSON object conforming to this schema:

{schema}

Populate the JSON with:
- schema_version: "1.0"
- status: "approved" if no issues, "changes_requested" if issues found
- summary: brief human-readable summary
- comment_markdown: ready-to-post PR comment in markdown
- reviewed_ref: { base: the base branch name, head: the HEAD commit SHA }
- findings: array of issues found (empty if approved)`;

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

  const schemaJson = JSON.stringify(CODE_REVIEW_JSON_SCHEMA, null, 2);
  const prompt = REVIEW_PROMPT.replaceAll("{schema}", schemaJson);

  const id = crypto.randomUUID();
  const outputPath = join(tmpdir(), `codex-review-output-${id}.json`);

  try {
    const args = ["codex", "exec", "review", prompt, "--base", base, "-o", outputPath];

    const result = await spawn(args, cwd);

    if (result.exitCode !== 0) {
      throw new Error(`codex CLI exited with code ${result.exitCode}: ${result.stderr}`);
    }

    const outputFile = Bun.file(outputPath);
    if (!(await outputFile.exists())) {
      throw new Error("codex CLI did not produce an output file");
    }

    const text = await outputFile.text();
    // Extract JSON from the output (codex may include surrounding text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("codex CLI output does not contain valid JSON");
    }

    const parsed: CodeReviewResult = JSON.parse(jsonMatch[0]);
    return parsed;
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

export const codexReviewer: ReviewBackend = {
  review: reviewByCodex,
};
