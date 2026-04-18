# 20260418-refactor-align-shortcut-naming

## Context

Issue: N/A

### Background

The three Slack message shortcuts (task, snippet, kudos) had inconsistent naming conventions across callback IDs, manifest shortcut names, i18n key prefixes, and function names. This refactor aligns them to follow a uniform pattern.

### Summary

- Unified verb to `add` across all shortcuts (`create_task` → `add_task`)
- Aligned modal callback_id pattern to `{shortcut}_modal_{state}`
- Renamed i18n prefix `slack.modal.*` → `slack.task.*` to match `slack.snippet.*` / `slack.kudos.*`
- Renamed page-level i18n prefix `snippets.*` → `snippet.*` to match `task.*` / `kudos.*`

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [803b0b0](https://github.com/nownabe/graphein/commit/803b0b0aa47c5ecd8f6593ec7ca5f284020b714a)

The naming refactor is complete and consistent. All old callback IDs (`create_task`), i18n prefixes (`slack.modal.*`, `snippets.*`), and function names (`showCreateTaskModal`) have been fully replaced with the new uniform pattern (`add_task`, `slack.task.*`, `snippet.*`, `showAddTaskModal`). No stale references remain in source code. The new kudos shortcut handler follows established patterns from the snippet shortcut. The manifest generator and README changes are clean. No bugs, security issues, or convention violations found.
