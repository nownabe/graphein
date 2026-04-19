# 20260418-fix-snippets-mentions-filter-prefix

## Context

Issue: https://github.com/nownabe/graphein/issues/107

### Background

In the snippets mentions filter, usergroup mentions display with an `@` prefix while user mentions do not. This inconsistency is confusing for users. The fix removes the `@` prefix from usergroup labels to make all mention types display consistently without a prefix.

### Summary

Remove the `@` prefix from usergroup labels in the snippets mentions filter, changing `g.handle ? \`@${g.handle}\` : g.name`to`g.handle ?? g.name`in two places in`src/snippets/routes.tsx`.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [c205817](https://github.com/nownabe/graphein/commit/c20581743c45f750c0d6b02e57af4e16e2dd35c1)

The change correctly removes the `@` prefix from usergroup labels in the snippets mentions filter for UI consistency. The switch from ternary to nullish coalescing is functionally equivalent for this use case since Slack usergroup handles are either a non-empty string or null, never an empty string.
