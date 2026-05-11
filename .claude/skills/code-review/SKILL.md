---
name: code-review
description: >-
  Run a single-pass local code review using a sub-agent.
  Reports findings to the user for interactive triage.
disable-model-invocation: false
allowed-tools:
  - Agent(code-reviewer)
  - Bash(git branch --show-current)
  - Bash(gh pr view *)
  - Bash(gh issue view *)
  - Read
  - Glob
  - Grep
argument-hint: "[PR URL or description]"
---

# Local Code Review

You are running an automated local code review.
Arguments: $ARGUMENTS

## CRITICAL CONSTRAINT

**You (the main agent) MUST NOT look at the diff or changed files yourself.**
You must NOT run `git diff`, `git show`, `git log -p`, or read any source files to review them.
All code review is delegated to the review sub-agent.
Your role is purely orchestration: launch the sub-agent and relay findings.

## Run Review

Launch the **code-reviewer** custom sub-agent with `subagent_type: "code-reviewer"`.

Pass this prompt:

```
Review the code changes on the current branch compared to main.
```

If `$ARGUMENTS` contains additional context (PR URL, issue number, description), append it to the prompt so the reviewer has context.

## Report Findings

After the sub-agent returns, relay the findings to the user:

- If **APPROVED**: report that the review found no actionable issues.
- If **NEEDS_FIX**: list all findings clearly so the user can decide what to address.

Do NOT automatically fix issues or commit changes — the user will decide how to proceed interactively.

## Important Rules

- **NEVER look at the diff or source files yourself for review purposes.** Only the sub-agent reviews.
- Never push to the remote.
- Never amend existing commits.
- Never create commits.
