# 20260418-chore/add-handle-issue-skill

## Context

Issue: N/A

### Background

Adding a new `/handle-issue` skill that takes a GitHub Issue number or URL and autonomously implements the changes, runs checks, performs code review, and creates a PR.

### Summary

New skill at `.claude/skills/handle-issue/SKILL.md` and permission entry in `.claude/settings.json`.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [af5acf1](https://github.com/nownabe/graphein/commit/af5acf18b1f5428b5031d1b4f123e312d63a91d9)

The changes are well-structured. The `usergroupService` extraction is a clean separation of concerns, moving usergroup CRUD and membership sync logic out of `snippetService` into its own module. The shared helpers (`resolveSlackUserToDb`, `resolveUsergroupToDb`, `infoModal`) eliminate significant code duplication across shortcut handlers. The i18n key renames (`slack.modal.*` to `slack.task.*`, `snippets.*` to `snippet.*`) are fully migrated with no stale references. The new `add_kudos` shortcut follows the established patterns from `add_snippet`. All wiring (config, index, test helpers, routes) is consistent. No bugs, security issues, or convention violations found.
