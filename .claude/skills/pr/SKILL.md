---
name: pr
description: Create a pull request following trunk-based development workflow. Use when the user asks to create a PR, submit changes, or send changes for review.
argument-hint: "[description of the change]"
---

# Pull Request Workflow

You are creating a pull request following trunk-based development practices.
The change description is: $ARGUMENTS

## 1. Assess Current State

Run these checks in parallel to understand the situation:

```
git status
git branch --show-current
git log --oneline main..HEAD
gh pr view --json state,url --jq '{state: .state, url: .url}' 2>/dev/null || echo "no PR"
```

Based on the results, decide autonomously:

- **On `main` with uncommitted changes**: Create a new branch from `origin/main`, commit, and proceed.
- **On a feature branch with no existing PR and uncommitted changes belong to this branch**: Commit and proceed.
- **On a feature branch with an `OPEN` PR and uncommitted changes belong to this branch**: Commit, push, and update the PR.
- **On a feature branch with a `CLOSED`/`MERGED` PR**: STOP and inform the user.
- **On a feature branch whose existing commits are unrelated to the uncommitted changes**: Create a new branch from latest `origin/main`, apply the relevant changes there, commit, and proceed.

Do NOT ask the user — judge the situation and proceed. Always fetch the latest `origin/main` before creating a new branch:

```
git fetch origin main
git switch -c <branch-name> origin/main
```

Branch name should use a conventional commit prefix followed by a short descriptive name (e.g., `feat/add-user-auth`, `fix/task-ordering`, `chore/update-deps`).

## 2. Run Local Checks

Run `bun run check:all` before every push. This runs all checks: app (typecheck, test, css:build), format (oxfmt), lint (oxlint), and workflows (actionlint, ghalint, zizmor).

```
bun run check:all
```

If any check fails, fix the issues and re-run. Do NOT skip checks or push with failures.

## 3. Local Code Review

Run the `/code-review` skill to perform an automated local code review before pushing. This will loop up to 5 rounds of review and fix until approved.

If the review does not converge (not approved after 5 rounds), STOP and inform the user.

## 4. Push

```
git push -u origin HEAD
```

## 5. Create Pull Request and Wait for Approval

If a PR does not yet exist for this branch:

1. Analyze all commits on this branch (not just the latest):

   ```
   git log main..HEAD
   git diff main...HEAD
   ```

2. Create the PR and start waiting with the `create-pr-and-wait` tool. Set a 600000ms timeout:

   ```bash
   bun run tools/create-pr-and-wait.ts create --title "<title>" --body "<body>"
   ```

   - Title: concise, under 70 characters
   - Body: summary of changes with context on "why"
   - The tool creates the PR, then automatically polls every 30s (up to ~5 min) for CI and review status

3. **Handle the result based on the `status` field in the JSON output:**
   - **`approved`** (exit 0): CI passed and LGTM received. Output the PR URL and stop.

   - **`ci_failed`** (exit 2): One or more CI checks failed.
     1. Extract the run ID from the failed check URL (format: `.../actions/runs/<run-id>/...`).
     2. Get failure details:
        ```bash
        bunx @nownabe/claude-tools gh list-run-jobs <run-id>
        bunx @nownabe/claude-tools gh get-job-logs <job-id>
        ```
     3. Fix the issue locally.
     4. Run `bun run check:all` to verify.
     5. Commit the fix (using `/commit` skill) and push (`git push`).
     6. Resume waiting (see below).

   - **`has_feedback`** (exit 3): PR comments or review comments received.
     1. Read each feedback item from the JSON output (`feedback` array).
     2. For `review_comment` items, note the `path` and `line` fields to locate the code.
     3. Address each comment by making the appropriate code changes.
     4. Run `bun run check:all`.
     5. Commit the fixes (using `/commit` skill) and push (`git push`).
     6. Resume waiting (see below).

   - **`pending`** (exit 4): CI still running, no feedback yet. Resume waiting (see below).

4. **Resume waiting** after fixing issues or on pending timeout. Use `wait` with `--since` set to the current UTC timestamp to filter out already-addressed feedback. Set a 600000ms timeout:

   ```bash
   bun run tools/create-pr-and-wait.ts wait <pr-number> --since $(date -u +%Y-%m-%dT%H:%M:%SZ)
   ```

   Handle the result the same way as step 3. Repeat until `approved`.

## Important Rules

- PRs should be small and focused on a single meaningful change.
- NEVER merge the PR — merging is always done by a human via squash merge after CI passes.
- If the branch is behind `main`, rebase onto the latest `main` before pushing.
- Always run all checks (step 2) before every push, even for subsequent pushes to the same branch.
