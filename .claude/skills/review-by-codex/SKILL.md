---
name: review-by-codex
description: >-
  Run a single-pass code review using Codex CLI (OpenAI).
  Reports structured findings to the user for interactive triage.
disable-model-invocation: false
allowed-tools:
  - Bash(bun run tools/review-by-codex.ts *)
  - Read
argument-hint: "[description or context]"
---

# Codex Code Review

You are running a code review using Codex via `tools/review-by-codex.ts`.
Arguments: $ARGUMENTS

## Run Review

```
bun run tools/review-by-codex.ts
```

Use a timeout of 600000ms (10 minutes) for this command.

The tool outputs structured JSON (`CodeReviewResult`) with `status`, `summary`, `findings`, and `comment_markdown` fields.

## Report Findings

Parse the JSON output and relay findings to the user:

- If `status` is `"approved"`: report that the review found no actionable issues. Include the `summary`.
- If `status` is `"changes_requested"`: list all findings clearly with severity, category, file path, and line number. Include `suggested_fix` when available.

Do NOT automatically fix issues or commit changes — the user will decide how to proceed interactively.

## Important Rules

- This skill only reviews — it does NOT fix issues.
- Never push to the remote.
- Never amend existing commits.
- Never create commits.
- Do not modify any source files.
