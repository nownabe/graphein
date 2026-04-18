---
name: handle-issue
description: >-
  Handle a GitHub Issue end-to-end: implement, review, and create a PR.
  Use when the user specifies a GitHub Issue number or URL to work on.
disable-model-invocation: false
allowed-tools:
  - Agent
  - Bash(gh issue view:*)
  - Bash(gh pr view:*)
  - Bash(gh pr create:*)
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(git switch:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git fetch:*)
  - Bash(git push:*)
  - Bash(git stash:*)
  - Bash(bun run check:all)
  - Bash(bun run tools/run-sql.ts:*)
  - Bash(bunx @nownabe/claude-tools:*)
  - Bash(date:*)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Skill(commit)
  - Skill(pr)
  - Skill(code-review)
argument-hint: "<issue number or URL>"
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

## 5. Commit

Use the `/commit` skill to create well-structured commits. For complex changes, make multiple logical commits rather than one large commit.

If the issue number is known, reference it in the commit body (e.g., `Refs #42`).

**After committing, you MUST continue to step 6. The workflow is NOT complete until the PR is created.**

## 6. Code Review

Run the `/code-review` skill to perform an automated local code review. Fix any issues found.

**After code review, you MUST continue to step 7. The workflow is NOT complete until the PR is created.**

## 7. Create PR

Use the `/pr` skill to push and create a pull request.

Ensure the PR body includes:

- A reference to the issue: `Closes #<number>` (or `Refs #<number>` if the PR only partially addresses the issue)
- A clear description of what was implemented

**The workflow is complete only after the PR URL is output.**

## Important Rules

- **You MUST complete ALL steps 1–7. Never stop after committing — always proceed through code review and PR creation.**
- Never merge the PR — that is always done by a human.
- Keep changes minimal and focused on the issue scope.
- If the issue requires database schema changes, generate migrations with `bun run db:generate`.
- If the issue is unclear or too large, ask the user before proceeding.
- All code, comments, commit messages, and PR descriptions must be in English.
