/**
 * Code review backend using Claude Code CLI (`claude -p --json-schema`).
 *
 * Invokes the `claude` CLI in print mode with a review prompt and the shared
 * JSON schema so the output is always a structured {@link CodeReviewResult}.
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

Populate the JSON output with:
- schema_version: "1.0"
- status: "approved" if no issues, "changes_requested" if issues found
- summary: brief human-readable summary
- comment_markdown: ready-to-post PR comment in markdown
- reviewed_ref: { base: "{base}", head: the HEAD commit SHA }
- findings: array of issues found (empty if approved)

For reviewed_ref.head, run \`git rev-parse HEAD\` to get the current commit SHA.`;

async function spawn(
  cmd: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
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

  const parsed: CodeReviewResult = JSON.parse(result.stdout);
  return parsed;
}

export const claudeReviewer: ReviewBackend = {
  review: reviewByClaude,
};
