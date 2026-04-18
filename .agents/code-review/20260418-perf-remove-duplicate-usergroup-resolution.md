# 20260418-perf/remove-duplicate-usergroup-resolution

## Context

Issue: #84

### Background

In the add_kudos_modal view handler and message event handler, after calling resolveUsergroupToDb (which internally calls usergroups.users.list and resolves all members), the code immediately calls usergroups.users.list again and resolves the same members a second time. This doubles the Slack API calls and DB lookups for every usergroup mention.

### Summary

Modified resolveUsergroupToDb to return activeMemberDbIds alongside the usergroup object, so callers can reuse the already-resolved member IDs instead of making redundant API calls.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [1b77c88](https://github.com/nownabe/graphein/commit/1b77c8873f97237c269c2e418730dcf7e3f7f4cd)

1. **Bug: `activeMemberDbIds` is empty when usergroup membership cache is fresh** (`/home/nownabe/src/github.com/nownabe/graphein/src/slack/bolt.ts`, lines 79-101). When `isUsergroupMembershipStale()` returns `false`, the code skips the Slack API call and the `activeMemberDbIds` array remains empty. Callers at lines ~993 and ~1296 then push nothing into `mentionedUserIds`, meaning no group members get assigned to the task. Before this change, the callers made their own independent `usergroups.users.list` call every time, so members were always resolved regardless of cache state. Fix: when the membership is not stale, load the active member IDs from the database (e.g., add a `getActiveUsergroupMembers` method to `usergroupService`) and populate `activeMemberDbIds` from that result. Alternatively, always resolve members in `resolveUsergroupToDb` but only call `syncUsergroupMembers` when stale.

#### Fix

Fixed files:

- src/slack/bolt.ts

Always resolve members via `usergroups.users.list` regardless of cache staleness. The `isStale` check now only gates the `syncUsergroupMembers` call, not the member resolution itself.
