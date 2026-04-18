# 20260418-fix-snippet-modal-deactivated-author

## Context

Issue: https://github.com/nownabe/graphein/issues/81

### Background

The add_snippet_modal view submission handler silently returns when the resolved author is deactivated, leaving the loading modal stuck indefinitely with no user feedback.

### Summary

Show an error modal (using the existing `infoModal` pattern) when the snippet author is deactivated, instead of silently returning. Adds i18n messages for both en and ja locales.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [bd7b39e](https://github.com/nownabe/graphein/commit/bd7b39ef00eb33b20d5868665f2b79927bad5dc1)

The change correctly fixes the stuck loading modal by showing an informational modal when the snippet author is deactivated. The pattern matches existing usage throughout the codebase (e.g., the kudos deactivated-author handler at line 938 uses the same `_done` callback_id convention). The i18n messages are added for both locales. No issues found.
