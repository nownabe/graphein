/**
 * Code review backend using Codex CLI (`codex exec`).
 *
 * Invokes `codex exec --output-schema <schema> -o <file> <prompt>` to produce
 * a structured JSON review conforming to the shared {@link CodeReviewResult}
 * schema.
 */

import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REVIEW_PROMPT,
  REVIEW_SCHEMA_PATH,
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

  const prompt = REVIEW_PROMPT.replaceAll("{base}", base);

  const id = crypto.randomUUID();
  const outputPath = join(tmpdir(), `codex-review-output-${id}.json`);

  try {
    const args = ["codex", "exec", "--output-schema", REVIEW_SCHEMA_PATH, "-o", outputPath, prompt];

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
      throw new Error(`codex CLI output does not contain valid JSON: ${text.slice(0, 500)}`);
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
