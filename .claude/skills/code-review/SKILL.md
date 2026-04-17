---
name: code-review
description: >-
  Run local code review with autonomous sub-agents.
  Loops up to 5 rounds of review → fix until approved.
  Logs each round to .agents/code-review/.
disable-model-invocation: false
allowed-tools:
  - Agent(code-reviewer)
  - Bash(git branch --show-current)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(gh pr view *)
  - Bash(gh issue view *)
  - Bash(date *)
  - Bash(bun run check:all)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
argument-hint: "[PR URL or description]"
---

# Local Code Review

You are running an automated local code review loop.
Arguments: $ARGUMENTS

## CRITICAL CONSTRAINT

**You (the main agent) MUST NOT look at the diff or changed files yourself.**
You must NOT run `git diff`, `git show`, `git log -p`, or read any source files to review them.
All code review is delegated to the review sub-agent.
Your role is purely orchestration: launch sub-agents, read their results, and coordinate fixes.

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
4. Initialize the log file with the header:
   ```markdown
   # {yyyyMMdd}-{branch_name}

   ## Context

   [Brief description of the changes — from PR title/body if available, otherwise from recent commit messages]

   Issue: [Issue link or "N/A"]

   ## Reviews
   ```

## Review Loop (max 5 rounds)

For each round N (1–5):

### Review Phase

Launch the **code-reviewer** custom sub-agent with `subagent_type: "code-reviewer"`.

Pass this prompt (fill in the variables):

```
Review round {N}. Log file: {log_file_path}
Repository: {owner}/{repo}
```

After the sub-agent returns, read the log file to determine the status.

If status is **APPROVED**: proceed to Summary (skip fix phase and remaining rounds).

### Fix Phase

If status is **NEEDS_FIX**:

1. Read the review comments from the log file to understand what needs fixing.
2. Fix ALL the issues listed by the reviewer. You may read and edit source files for this purpose.
3. Run `bun run check:all` to verify fixes don't break anything. If checks fail, fix those too.
4. Stage and commit the fixes:
   ```
   git add <specific files>
   git commit -m "fix: address review round {N} feedback"
   ```
5. Append the fix section to the log file:
   ```markdown

   #### Fix

   Fixed files:
   - file1.ts
   - file2.tsx

   [Brief summary of what was changed and why]
   ```
6. Stage and commit the log file update:
   ```
   git add .agents/code-review/
   git commit -m "docs: update review log for round {N}"
   ```

Then continue to the next round.

## After Loop Ends

If 5 rounds complete without APPROVED status, inform the user that manual intervention is needed.

## Summary

After the loop ends (either by approval or exhausting rounds), output a summary:

```
**Finished local review**

Round: {final_round}/5
Result: ✅ APPROVED  (or)  ⚠ Review did not converge within 5 rounds — manual intervention needed

- Round 1: {N issues found} → {N fixed}
- Round 2: Approved
```

Count issues and fixes from the log file content for each round.

## Important Rules

- **NEVER look at the diff or source files yourself for review purposes.** Only the sub-agent reviews.
- You MAY read source files during the fix phase to make corrections.
- Always commit after fixes and after log updates separately.
- Never push to the remote — the user will push when ready.
- Never amend existing commits.
