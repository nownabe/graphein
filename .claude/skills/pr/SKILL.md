---
name: pr
description: Create a pull request following trunk-based development workflow. Use when the user asks to create a PR, submit changes, or send changes for review.
argument-hint: "[description of the change]"
---

# Pull Request Workflow

You are creating a pull request following trunk-based development practices.
The change description is: $ARGUMENTS

## 1. Ensure Feature Branch

- If currently on `main`, create a new branch from the latest `origin/main`:
  ```
  git fetch origin main
  git switch -c <branch-name> origin/main
  ```
- Branch name should use a conventional commit prefix followed by a short descriptive name (e.g., `feat/add-user-auth`, `fix/task-ordering`, `chore/update-deps`).
- If already on a feature branch, proceed.

## 2. Check Working Tree

- Run `git status`. If there are uncommitted changes, ask the user what to do before proceeding.

## 3. Run Local Checks

Run `bun run check:all` before every push. This runs all checks: app (typecheck, test, css:build), format (oxfmt), lint (oxlint), and workflows (actionlint, ghalint, zizmor).

```
bun run check:all
```

If any check fails, fix the issues and re-run. Do NOT skip checks or push with failures.

## 4. Local Code Review

Run the `/code-review` skill to perform an automated local code review before pushing. This will loop up to 5 rounds of review and fix until approved.

If the review does not converge (not approved after 5 rounds), STOP and inform the user.

## 5. Check Existing PR State

Before pushing, check if there is an existing PR for this branch:

```
gh pr view --json state --jq '.state'
```

- If the PR is `CLOSED` or `MERGED`, STOP and inform the user. Do NOT push to a closed/merged PR's branch.
- If no PR exists or the PR is `OPEN`, proceed.

## 6. Push

```
git push -u origin HEAD
```

## 7. Create Pull Request

If a PR does not yet exist for this branch:

1. Analyze all commits on this branch (not just the latest):

   ```
   git log main..HEAD
   git diff main...HEAD
   ```

2. Create the PR with `gh pr create`:
   - Title: concise, under 70 characters
   - Body: summary of changes with context on "why"
   - Always assign `nownabe` as assignee

3. Output the PR URL so the user can see it.

## Important Rules

- PRs should be small and focused on a single meaningful change.
- NEVER merge the PR — merging is always done by a human via squash merge after CI passes.
- If the branch is behind `main`, rebase onto the latest `main` before pushing.
- Always run all checks (step 3) before every push, even for subsequent pushes to the same branch.
