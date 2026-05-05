/**
 * Code review backend using Codex CLI (`codex -q`).
 *
 * Invokes the `codex` CLI in quiet mode with a review prompt that instructs
 * it to output JSON conforming to the shared {@link CodeReviewResult} schema.
 * The `codex review` subcommand does not support `--json-schema`, so we use
 * `codex -q` with an explicit schema in the prompt instead.
 */

import {
  CODE_REVIEW_JSON_SCHEMA,
  type CodeReviewResult,
  type ReviewBackend,
  type ReviewOptions,
} from "./review-schema.ts";

const DEFAULT_BASE = "main";

const REVIEW_PROMPT = `You are a code reviewer. Review the changes on the current branch compared to the base branch.

## Instructions

1. Run \`git diff {base}...HEAD --name-only\` to list changed files.
2. Run \`git diff {base}...HEAD\` to see the full diff.
3. Read relevant source files for full context when needed.
4. Read CLAUDE.md for project conventions.
5. Evaluate the changes for:
   - **Correctness**: logic errors, off-by-one, null/undefined handling
   - **Security**: injection, XSS, auth bypass, secret exposure
   - **Edge cases**: empty inputs, concurrent access, error paths
   - **Performance**: unnecessary queries, missing indexes, O(n²) in hot paths
   - **Consistency**: adherence to project conventions

## Standards

- Be pragmatic. Only flag things that actually matter.
- Do NOT nitpick style or formatting that linters handle.
- Do NOT suggest adding comments, documentation, or type annotations unless something is genuinely confusing.
- Focus on bugs, logic errors, security issues, missing error handling at boundaries, and violations of project conventions.
- Each issue must be actionable — say exactly what to change and where.

## Output

You MUST output ONLY a single JSON object (no markdown fences, no explanation) conforming to this schema:

{schema}

Populate the JSON output with:
- schema_version: "1.0"
- status: "approved" if no issues, "changes_requested" if issues found
- summary: brief human-readable summary
- comment_markdown: ready-to-post PR comment in markdown
- reviewed_ref: {{ base: "{base}", head: the HEAD commit SHA }}
- findings: array of issues found (empty if approved)

For reviewed_ref.head, run \`git rev-parse HEAD\` to get the current commit SHA.`;

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
  const prompt = REVIEW_PROMPT.replaceAll("{base}", base).replaceAll("{schema}", schemaJson);

  const args = ["codex", "-q", prompt, "--full-auto"];

  const result = await spawn(args, cwd);

  if (result.exitCode !== 0) {
    throw new Error(`codex CLI exited with code ${result.exitCode}: ${result.stderr}`);
  }

  // Extract JSON from the output (codex may include surrounding text)
  const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("codex CLI did not produce valid JSON output");
  }

  const parsed: CodeReviewResult = JSON.parse(jsonMatch[0]);
  return parsed;
}

export const codexReviewer: ReviewBackend = {
  review: reviewByCodex,
};
