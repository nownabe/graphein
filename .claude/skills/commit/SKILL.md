---
name: commit
description: >-
  Create a git commit with a Conventional Commits message.
  Use when the user wants to commit current changes, save progress, or finalize work.
  Automatically creates a feature branch if on main.
disable-model-invocation: false
allowed-tools:
  - Bash(git status)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git branch *)
  - Bash(git switch *)
  - Bash(git add *)
  - Bash(git commit *)
argument-hint: "[scope or message hint]"
---

Create a git commit for the current staged and unstaged changes.

`$ARGUMENTS` may specify:

- **File names or paths** — commit ONLY those files. Do not stage anything else.
- **A message hint** — use it to guide the commit message.
- **Both** — interpret accordingly.

If no arguments are provided, consider all changes as candidates.

## Steps

1. Run `git branch --show-current`. If on `main`, inspect the diff to determine an appropriate branch name in `<type>/<short-description>` format (lowercase, hyphens). Run `git switch -c <branch-name>`.
2. Run `git status` and `git diff` (staged + unstaged) to understand the changes.
3. Run `git log --oneline -10` to check recent commit message style.
4. Draft a commit message following the commit message rules below.
5. Stage files with `git add`. If `$ARGUMENTS` specifies files or paths, stage ONLY those — do not include unrelated changes. Otherwise, stage all relevant files (prefer specific files over `git add -A`). Never stage files that likely contain secrets (`.envrc`, credentials, tokens) — warn instead.
6. Create the commit by passing the message directly with `-m`:
   ```
   git commit -m "subject line" -m "optional body"
   ```
7. Run `git status` to verify success.

## Commit message rules

Format: `<type>: <description>`

| Type       | When to use                                                                            |
| ---------- | -------------------------------------------------------------------------------------- |
| `feat`     | A new **user-facing** feature (not dev tooling)                                        |
| `fix`      | A bug fix                                                                              |
| `docs`     | Documentation-only changes (README, CLAUDE.md, comments, etc.)                         |
| `style`    | Formatting changes that do not affect code meaning (whitespace, semicolons, etc.)      |
| `refactor` | Code changes that neither fix a bug nor add a feature (renames, restructuring, etc.)   |
| `perf`     | Performance improvements                                                               |
| `test`     | Adding or updating tests                                                               |
| `deps`     | Dependency updates (version bumps, lock file changes, etc.)                            |
| `build`    | Changes to the build system or build configuration                                     |
| `ci`       | CI/CD configuration changes (GitHub Actions, workflows, etc.)                          |
| `chore`    | Dev tooling, config, and other non-user-facing tasks (skills, agents, gitignore, etc.) |

- Subject line: imperative mood, lowercase, no period, max 72 characters.
- Add a body (separated by a blank line) only when the "why" is not obvious from the subject.

## Guardrails

- Never commit on `main` — always create a feature branch first.
- Never amend existing commits unless explicitly requested.
- Never push to the remote.
- If a pre-commit hook fails, fix the issue and create a NEW commit (do not `--amend`).
