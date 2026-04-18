# 20260418-fix-handle-issue-complete-all-steps

## Context

Issue: N/A

### Background

The handle-issue skill sometimes stops after committing without proceeding to create a PR. This fix adds explicit instructions to ensure all steps are completed.

### Summary

Add continuation instructions after commit and code review steps in the handle-issue skill, plus a top-level rule requiring all 7 steps to complete through PR creation.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [56278ff](https://github.com/nownabe/graphein/commit/56278ffa0cce3e012058408d8fdbe2ef4d1e8d23)

All changes are correct and consistent with existing patterns. The bot/system message rejection in `src/slack/bolt.ts` properly checks for missing `user` field before any fallback, and the deactivated author fix correctly uses `views.update` to replace the loading modal. Both fixes follow the established `infoModal` pattern with appropriate callback_id suffixes. The i18n keys are present for both locales. The SKILL.md changes are documentation-only and improve workflow reliability.
