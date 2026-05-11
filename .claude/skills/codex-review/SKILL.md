---
name: codex-review
description: >-
  Run a single-pass code review using Codex CLI (OpenAI).
  Reports findings to the user for interactive triage.
disable-model-invocation: false
allowed-tools:
  - Bash(git branch --show-current)
  - Bash(git rev-parse *)
  - Bash(gh pr view *)
  - Bash(gh issue view *)
  - Bash(codex review *)
  - Read
  - Glob
argument-hint: "[PR URL or description]"
---

# Codex CLI Code Review

You are running a code review using [Codex CLI](https://github.com/openai/codex) (`codex review`).
Arguments: $ARGUMENTS

## Run Codex Review

Run the Codex CLI review command against the main branch:

```
codex review --base main
```

Use a timeout of 300000ms (5 minutes) for this command.

If `$ARGUMENTS` contains additional context (PR URL, issue number, description), include it in the review prompt.

## Report Findings

Analyze the Codex CLI output and relay findings to the user:

- If there are **no actionable findings** (bugs, security issues, logic errors, missing edge cases): report that the review found no issues.
- If there **are actionable findings**: list them clearly with file paths and line numbers where possible.

Ignore style/formatting nits that linters handle.

Do NOT automatically fix issues or commit changes — the user will decide how to proceed interactively.

## Important Rules

- This skill only reviews — it does NOT fix issues.
- Never push to the remote.
- Never amend existing commits.
- Never create commits.
- Do not modify any source files.
