---
name: issue-handler
description: >-
  Handle a GitHub Issue end-to-end in an isolated worktree.
  Use when the user specifies a GitHub Issue number or URL to work on.
skills:
  - pr
  - code-review
---

# Implement GitHub Issue

Implement the changes described in a GitHub Issue and create a pull request.

Arguments: $ARGUMENTS

## 1. Parse Issue

Extract the issue number from `$ARGUMENTS`. Accept either:

- A plain number (e.g., `42`)
- A GitHub URL (e.g., `https://github.com/owner/repo/issues/42`)

Fetch the issue details:

```
gh issue view <number> --json number,title,body,labels,assignees
```

Read and understand the issue thoroughly — title, body, labels, and any linked issues or context.

If the issue has sub-issues, fetch them:

```
bunx @nownabe/claude-tools gh list-sub-issues <number>
```

## 2. Plan

Before writing any code, create a plan:

1. Identify which files need to be created or modified.
2. Determine the right approach based on the issue description and codebase conventions.
3. Consider edge cases and potential impacts.
4. If the issue is too large or ambiguous to implement confidently, STOP and ask the user for clarification.

Output the plan as a brief summary so the user can confirm or adjust before implementation.

## 3. Implement

After the user confirms the plan (or if the plan is straightforward and low-risk, proceed directly):

1. Fetch the latest main and create a feature branch:

   ```
   git fetch origin main
   git switch -c <type>/<short-description> origin/main
   ```

   Use a branch name derived from the issue (e.g., `feat/add-deadline-filter` for an issue about deadline filtering).

2. Implement the changes described in the issue.
3. Follow all project conventions from CLAUDE.md.
4. Keep changes focused — implement only what the issue asks for.

## 4. Verify

Run all checks to make sure nothing is broken:

```
bun run check:all
```

If any check fails, fix the issue and re-run until all checks pass.

## 5. Create PR

Use the `/pr` skill to commit, review, push, and create a pull request. The `/pr` skill handles committing, running checks, code review, pushing, and PR creation — all in one step.

Ensure the PR body includes:

- A reference to the issue: `Closes #<number>` (or `Refs #<number>` if the PR only partially addresses the issue)
- A clear description of what was implemented

**The workflow is complete only after the PR URL is output.**

## Important Rules

- **You are running inside an isolated git worktree.** Stay in the worktree directory and perform all work there. Do not attempt to leave the worktree or switch to the original repository directory.
- Never merge the PR — that is always done by a human.
- Keep changes minimal and focused on the issue scope.
- If the issue requires database schema changes, generate migrations with `bun run db:generate`.
- If the issue is unclear or too large, ask the user before proceeding.
- All code, comments, commit messages, and PR descriptions must be in English.
