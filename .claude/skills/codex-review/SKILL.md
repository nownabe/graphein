---
name: codex-review
description: >-
  Run code review using Codex CLI (OpenAI).
  Appends findings to .agents/code-review/ log in the same format as the code-review skill.
disable-model-invocation: false
allowed-tools:
  - Bash(git branch --show-current)
  - Bash(git rev-parse *)
  - Bash(gh pr view *)
  - Bash(gh issue view *)
  - Bash(date *)
  - Bash(codex review *)
  - Read
  - Edit
  - Write
  - Glob
argument-hint: "[PR URL or description]"
---

# Codex CLI Code Review

You are running a code review using [Codex CLI](https://github.com/openai/codex) (`codex review`).
Arguments: $ARGUMENTS

## Setup

1. Get the current branch name and today's date:
   ```
   git branch --show-current
   date +%Y%m%d
   ```
2. Determine the issue link:
   - If `$ARGUMENTS` contains an issue URL or number, use it.
   - Otherwise try to extract issue references from `gh pr view --json body --jq '.body'` (if a PR exists).
   - If no issue is found, set to "N/A".
3. Compute the log file path: `.agents/code-review/{yyyyMMdd}-{branch_name}.md`
   - Replace all `/` in branch_name with `-`
4. Get the HEAD commit SHA:
   ```
   git rev-parse HEAD
   git rev-parse --short HEAD
   ```

## Run Codex Review

Run the Codex CLI review command against the main branch:

```
codex review --base main
```

Use a timeout of 300000ms (5 minutes) for this command.

Capture the full output.

## Process Results

Analyze the Codex CLI output. Determine:

- Whether there are any actionable findings (bugs, security issues, logic errors, missing edge cases).
- Ignore style/formatting nits that linters handle.

### If there are NO actionable findings

Set status to **APPROVED**.

### If there ARE actionable findings

Set status to **NEEDS_FIX**. Prepare a numbered list of issues with file paths and line numbers where possible.

## Write Review Log

Check if the log file already exists. If it does, read it to find the latest round number and increment. If it doesn't exist, create it with the header first, then add Round 1.

### Log file header (only if creating new file)

```markdown
# {yyyyMMdd}-{branch_name}

## Context

Issue: [Issue link or "N/A"]

### Background

[Why these changes are being made — extract from PR body, issue description, or commit messages. If unclear, write "N/A".]

### Summary

[Brief description of the changes — from PR title/body if available, otherwise from recent commit messages]

## Reviews
```

### Review entry (append to log file)

```markdown
### Round {N} (Codex)

#### Review

Status: [APPROVED or NEEDS_FIX]
Reviewed commit: [{short_sha}](https://github.com/nownabe/graphein/commit/{full_sha})
Reviewer: Codex CLI (OpenAI)

[If APPROVED: brief summary of what was checked and why it looks good]
[If NEEDS_FIX: numbered list of issues with file paths and line numbers]
```

Note: Include `(Codex)` in the round header and `Reviewer: Codex CLI (OpenAI)` to distinguish from Claude-based reviews.

## Output Summary

After writing the log, output a summary:

```
**Codex CLI Review Complete**

Result: APPROVED (or) NEEDS_FIX
Log: .agents/code-review/{log_file_name}

[If NEEDS_FIX: list the issues found]
```

## Important Rules

- This skill only reviews — it does NOT fix issues. The user can use the regular `/code-review` skill or fix manually.
- Never push to the remote.
- Never amend existing commits.
- Do not modify any source files.
