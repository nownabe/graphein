# 20260418-fix-handle-issue-simplify-steps

## Context

Issue: https://github.com/nownabe/graphein/issues/94

### Background

The handle-issue skill sometimes stops after committing or code review without proceeding to PR creation (the same problem #94 tried to fix with stronger language). The root cause is that steps 5-7 (/commit, /code-review, /pr) are separate steps, but /pr already covers all three.

### Summary

Consolidate handle-issue steps 5-7 into a single step that calls /pr, since /pr already handles commit, checks, code review, push, and PR creation.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [006f5e3](https://github.com/nownabe/graphein/commit/006f5e3becc8c7c506f4a4a88820d670c43cd777)

Changes are clean. The handle-issue skill simplification correctly consolidates redundant steps 5-7 into a single step delegating to /pr, and removes now-unnecessary allowed-tools entries. The kudos deactivated author i18n fix (carried from the branch) is correct and was already approved in a prior review.
