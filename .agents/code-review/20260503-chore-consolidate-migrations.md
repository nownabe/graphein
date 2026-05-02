# 20260503-chore-consolidate-migrations

## Context

Issue: N/A

### Background

The application has not been deployed to production yet, so incremental migrations (0001–0009) can be safely consolidated into a single initial schema migration. This reduces migration file clutter and simplifies the migration history.

### Summary

Consolidate all Drizzle migration files (0000–0009) into a single `0000_initial_schema.sql` generated from the current schema definition.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [1ae9a6c](https://github.com/nownabe/graphein/commit/1ae9a6c674061b30b86d10645036fe293e4d5d2b)

1. **Missing `drizzle/meta/0000_snapshot.json` from commit** (`drizzle/meta/`): The journal (`_journal.json`) references migration `0000_initial_schema`, but the corresponding `0000_snapshot.json` file exists only on disk as an untracked file -- it was never staged and committed. All old snapshot files (0002, 0003, 0008, 0009) were correctly deleted, but the replacement snapshot was not added. Drizzle requires the snapshot file for each journal entry to function correctly (e.g., for generating future migrations). Run `git add drizzle/meta/0000_snapshot.json` and include it in the commit.

#### Fix

Fixed files:

- .gitignore
- drizzle/meta/0000_snapshot.json
- drizzle/meta/_journal.json

Removed `drizzle/meta/` from `.gitignore` so snapshot files are tracked, added the missing `0000_snapshot.json`, and formatted both JSON files with oxfmt.

### Round 2

#### Review

Status: APPROVED
Reviewed commit: [90b17f8](https://github.com/nownabe/graphein/commit/90b17f8d0c9e9011d585b2bdd5855f5c6988016b)

Round 1 issue resolved. The consolidated migration correctly includes all tables, foreign keys, and indexes from the original 10 migrations. The journal and snapshot metadata are consistent, and `drizzle/meta/` is now properly tracked in git.
