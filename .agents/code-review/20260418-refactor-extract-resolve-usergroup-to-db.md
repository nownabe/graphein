# 20260418-refactor-extract-resolve-usergroup-to-db

## Context

Issue: https://github.com/nownabe/graphein/issues/80

### Background

The usergroup resolution logic (resolve handle → find/create in DB → stale check → sync membership) was duplicated across the snippet shortcut handler, kudos shortcut handler, and event listener in bolt.ts. This refactoring extracts a shared helper to eliminate the duplication.

### Summary

Extract a shared `resolveUsergroupToDb` helper function inside `createBolt` that all three handlers now call, replacing ~110 lines of duplicated code with ~47 lines of shared logic.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [f470e15](https://github.com/nownabe/graphein/commit/f470e155bd2783523b9ef47d42ed5674417e4a01)

The refactoring cleanly extracts three shared helpers (`resolveSlackUserToDb`, `resolveUsergroupToDb`, `infoModal`) and applies them consistently across all shortcut handlers and event listeners. The i18n key renames from `slack.modal.*` to `slack.task.*` and `snippets.*` to `snippet.*` are consistent across both locale maps and all view references. The new `add_kudos` shortcut follows the established patterns correctly. One intentional behavioral change: `resolveSlackUserToDb` now returns `null` when a Slack user has no email (previously some call sites passed `email: ""`), but all callers properly handle the `null` case, and this is a safer default for bot/system users.
