# 20260418-refactor-extract-slack-user-resolver

## Context

Issue: https://github.com/nownabe/graphein/issues/79

### Background

The pattern `client.users.info → userService.findOrCreateUser` was repeated multiple times across add_snippet, add_kudos shortcuts, add_task handlers, and the message event listener in `src/slack/bolt.ts`. The add_kudos handler had already extracted a local helper, but it wasn't shared. This refactor consolidates all occurrences into a single shared helper.

### Summary

Extract a shared `resolveSlackUserToDb` helper at the `createBolt` scope level, replacing all inline and local duplications of the Slack user resolution pattern across all handlers.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [ea8c5c6](https://github.com/nownabe/graphein/commit/ea8c5c63589645e53470584348f11c2b3909b0b4)

Clean mechanical refactor that extracts a shared `resolveSlackUserToDb(client, slackUid)` helper, eliminating 7+ duplications of the `client.users.info` + `findOrCreateUser` pattern. The consolidation is complete (only one `users.info` call and one `findOrCreateUser` call remain). One minor behavioral change: call sites that previously created users with empty email (`email: ""`) when profile email was missing now return `null` instead -- this is arguably an improvement. The null checks are correctly added at all affected call sites.
