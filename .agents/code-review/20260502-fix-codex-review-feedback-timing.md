# 20260502-fix-codex-review-feedback-timing

## Context

Issue: N/A

### Background

When `bin/handle-issue` runs with `--codex-review`, the Codex review comment posted to the PR was being picked up as actionable feedback in the Phase 3 wait-and-fix loop, causing Claude to unnecessarily attempt to "fix" the review comment.

### Summary

Move `prCreatedAt` assignment to after the Codex review comment is posted, so the `waitPr` baseline excludes the Codex comment from feedback detection.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [c10c9b6](https://github.com/nownabe/graphein/commit/c10c9b6702e5b127cdcfb2c9839cb65818d8221c)

The change correctly moves the `prCreatedAt` timestamp assignment to after the codex review comment is posted, preventing the wait-pr loop from treating the bot's own comment as actionable feedback. The two assignment sites for `prCreatedAt` are in mutually exclusive branches (codex-review enabled vs disabled), so there is no risk of the variable being unset when used at line 473.
