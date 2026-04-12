---
name: pr
description: Create a pull request following trunk-based development workflow. Use when the user asks to create a PR, submit changes, or send changes for review.
disable-model-invocation: true
argument-hint: "[description of the change]"
---

# Pull Request Workflow

You are creating a pull request following trunk-based development practices.
The change description is: $ARGUMENTS

## 1. Ensure Feature Branch

- If currently on `main`, create a new branch from the latest `main`:
  ```
  git pull origin main
  git switch -c <branch-name>
  ```
- Branch name should be short and descriptive (e.g., `add-user-auth`, `fix-task-ordering`).
- If already on a feature branch, proceed.

## 2. Check Working Tree

- Run `git status`. If there are uncommitted changes, ask the user what to do before proceeding.

## 3. Run Local Checks

Run `bun run check:all` before every push. This runs all checks: app (typecheck, test, css:build), format (oxfmt), lint (oxlint), and workflows (actionlint, ghalint, zizmor).

```
bun run check:all
```

If any check fails, fix the issues and re-run. Do NOT skip checks or push with failures.

## 4. Check Existing PR State

Before pushing, check if there is an existing PR for this branch:

```
gh pr view --json state --jq '.state'
```

- If the PR is `CLOSED` or `MERGED`, STOP and inform the user. Do NOT push to a closed/merged PR's branch.
- If no PR exists or the PR is `OPEN`, proceed.

## 5. Push

```
git push -u origin HEAD
```

## 6. Create Pull Request

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
