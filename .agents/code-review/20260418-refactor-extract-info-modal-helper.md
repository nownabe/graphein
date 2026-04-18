# 20260418-refactor-extract-info-modal-helper

## Context

Issue: https://github.com/nownabe/graphein/issues/78

### Background

Both `add_snippet` and `add_kudos` shortcuts in `src/slack/bolt.ts` have heavily duplicated modal creation code. Every info/error/success/loading modal follows the exact same structure, differing only in `callback_id`, title i18n key, and message i18n key. The `add_task` shortcut has the same pattern as well.

### Summary

Extract a shared `infoModal` helper function to reduce boilerplate across all shortcut handlers (task, snippet, kudos) in `src/slack/bolt.ts`. Replaces 18 nearly identical modal definitions with calls to the helper.

## Reviews

### Round 1

**Status: APPROVED**

No issues found. The changes are correct and consistent. The `infoModal` helper correctly encapsulates the repeated modal structure (type, callback_id, title, optional close, single mrkdwn section block). All 18 substitution sites produce output structurally identical to the original inline definitions, including correct handling of the optional `closeKey` parameter (processing/loading modals omit it; info/error/success/done modals include it). The remaining inline modal definitions that were not refactored all have additional elements (submit buttons, private_metadata, input blocks, or dynamic message interpolation) that properly fall outside the helper's scope.
