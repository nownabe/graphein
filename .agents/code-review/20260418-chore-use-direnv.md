# 20260418-chore-use-direnv

## Context

Issue: N/A

### Background

Switch environment variable management from `.env` files to `.envrc` (direnv) for a more standard developer experience with automatic environment loading.

### Summary

Replace `.env`/`.env.local` with `.envrc` in `.gitignore`, rename `.env.example` to `.envrc.example` with `export` prefixes, add direnv to `mise.toml`, and update all documentation references.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [2808fc1](https://github.com/nownabe/graphein/commit/2808fc1c7fa93ebcc8c09cf619094828d8374778)

1. **`.gitignore` no longer ignores `.env` files** (`/.gitignore`): The old `.gitignore` ignored both `.env` and `.env.local`. The new version only ignores `.envrc`. If a developer (or any tool) creates a `.env` file, it could be accidentally committed with secrets. Add `.env` and `.env.local` back to `.gitignore` alongside `.envrc` to prevent accidental secret exposure.

2. **DB connection leak in `global-setup.ts`** (`/test/e2e/global-setup.ts`, line 10-11): `createDb()` opens a postgres connection pool but never closes it. This can cause the Playwright global setup to hang instead of completing cleanly. After `migrate()`, call `await db.$client.end()` (or equivalent) to close the connection. *(Pre-existing issue, out of scope for this PR.)*

#### Fix

Fixed files:

- .gitignore

Added `.env` and `.env.local` back to `.gitignore` alongside `.envrc` to prevent accidental secret commits. Issue 2 is a pre-existing problem unrelated to this change.
