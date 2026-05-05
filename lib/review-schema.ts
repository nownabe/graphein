/**
 * Shared code review result schema and types.
 *
 * Used by both review-by-claude and review-by-codex to produce
 * consistent, structured review output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewSeverity = "high" | "medium" | "low";

export type ReviewCategory =
  | "correctness"
  | "regression"
  | "security"
  | "performance"
  | "reliability"
  | "missing_test";

export type ReviewConfidence = "high" | "medium" | "low";

export type ReviewStatus = "approved" | "changes_requested";

export type FindingLocation = {
  path: string;
  line: number | null;
  end_line: number | null;
};

export type ReviewFinding = {
  title: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  description: string;
  suggested_fix: string | null;
  confidence: ReviewConfidence;
  location: FindingLocation;
  snippet: string | null;
};

export type ReviewedRef = {
  base: string;
  head: string;
};

export type CodeReviewResult = {
  schema_version: "1.0";
  status: ReviewStatus;
  summary: string;
  comment_markdown: string;
  reviewed_ref: ReviewedRef;
  findings: ReviewFinding[];
};

// ---------------------------------------------------------------------------
// Common interface for review backends
// ---------------------------------------------------------------------------

export type ReviewOptions = {
  /** Base branch/ref to diff against (default: "main"). */
  base?: string;
  /** Working directory for CLI commands (must be inside the target repo). */
  cwd?: string;
};

export type ReviewBackend = {
  review(options?: ReviewOptions): Promise<CodeReviewResult>;
};

// ---------------------------------------------------------------------------
// Shared review prompt
// ---------------------------------------------------------------------------

/**
 * Common review prompt used by both Claude and Codex backends.
 * Replace `{base}` with the target base branch before use.
 */
export const REVIEW_PROMPT = `You are a code reviewer. Review the changes on the current branch compared to the base branch.

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
   - **Test coverage**: new logic or bug fixes without corresponding tests, untested edge cases
   - **Consistency**: adherence to project conventions

## Standards

- Be pragmatic. Only flag things that actually matter.
- Do NOT nitpick style or formatting that linters handle.
- Do NOT suggest adding comments, documentation, or type annotations unless something is genuinely confusing.
- Focus on bugs, logic errors, security issues, missing error handling at boundaries, insufficient test coverage, and violations of project conventions.
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

// ---------------------------------------------------------------------------
// JSON Schema (mirrors the TypeScript types above)
// ---------------------------------------------------------------------------

export const CODE_REVIEW_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "CodeReviewResult",
  type: "object",
  properties: {
    schema_version: {
      type: "string",
      const: "1.0",
    },
    status: {
      type: "string",
      enum: ["approved", "changes_requested"],
    },
    summary: {
      type: "string",
      description: "Short human-readable summary of the review result.",
    },
    comment_markdown: {
      type: "string",
      description: "Ready-to-post PR comment in markdown. Derivative of the structured findings.",
    },
    reviewed_ref: {
      type: "object",
      properties: {
        base: { type: "string" },
        head: { type: "string" },
      },
      required: ["base", "head"],
      additionalProperties: false,
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Concise one-line finding title.",
          },
          severity: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          category: {
            type: "string",
            enum: [
              "correctness",
              "regression",
              "security",
              "performance",
              "reliability",
              "missing_test",
            ],
          },
          description: {
            type: "string",
            description: "What is wrong and why it matters.",
          },
          suggested_fix: {
            type: ["string", "null"],
            description: "Concrete fix direction for the implementation agent.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          location: {
            type: "object",
            properties: {
              path: { type: "string" },
              line: { type: ["integer", "null"] },
              end_line: { type: ["integer", "null"] },
            },
            required: ["path", "line", "end_line"],
            additionalProperties: false,
          },
          snippet: {
            type: ["string", "null"],
            description: "Optional short code excerpt for human context.",
          },
        },
        required: [
          "title",
          "severity",
          "category",
          "description",
          "suggested_fix",
          "confidence",
          "location",
          "snippet",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["schema_version", "status", "summary", "comment_markdown", "reviewed_ref", "findings"],
  additionalProperties: false,
} as const;
