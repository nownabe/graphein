# 20260418-fix-exclude-self-posted-kudos

## Context

Issue: https://github.com/nownabe/graphein/issues/126

### Background

When users filter kudos entries by "To" (mentioned user), the results currently
include kudos that the filtered user posted themselves. These self-posted
entries are not meaningful when viewing kudos directed *at* a user, so they
should be excluded so the filter only surfaces kudos posted by other people
mentioning that user.

### Summary

Update `listKudosEntries` in `src/kudos/service.ts` to exclude rows where
`kudos.postedById` equals the filter's `mentionedUserId`. Adjust
`getDistinctMentionedUsers` so the filter dropdown hides users who only appear
as self-mentions (i.e., would yield no results under the new filter).

## Reviews

### Round 1

Status: APPROVED

Summary:

- `listKudosEntries` correctly adds `ne(kudos.postedById, filters.mentionedUserId)` only when `mentionedUserId` is set, so callers without that filter see no behavior change.
- The exclusion is applied through the shared `where` clause, so both the count query and the row-fetch query stay in sync (same total/pagination semantics).
- `getDistinctMentionedUsers` joins through `kudosEntries` → `kudos` and adds `ne(kudos.postedById, kudosEntryMentionedUsers.userId)`, which drops users that only appear as self-mentions while still surfacing users who are mentioned by at least one other poster (because `selectDistinct` will keep them via the non-self rows).
- Imports and existing comments were updated accordingly; no stray or leftover changes elsewhere.
