# 20260418-chore-slack-manifest-generator

## Context

Add an interactive script (`scripts/generate-slack-manifest.ts`) that generates a Slack App manifest YAML. Update README to replace manual Slack setup instructions with `bun run slack:manifest` workflow. Add `slack:manifest` npm script.

Issue: N/A

## Reviews

### Round 1

**Status: APPROVED**

#### Findings

No issues found. The changes are clean and well-structured:

- The manifest generator script correctly includes both `create_task` and `add_snippet` shortcuts matching the existing bolt handlers in `src/slack/bolt.ts`.
- Bot scopes (`channels:history`, `channels:read`, `chat:write`, `reactions:write`, `users:read`, `users:read.email`, `usergroups:read`) align with API calls in the codebase (`reactions.add`, `users.info`, `usergroups.list`, `conversations.info`, message listener).
- The `message.channels` bot event subscription is needed for `boltApp.message(...)` in `bolt.ts:826`.
- The custom YAML serializer handles special characters via quoting and covers edge cases (empty arrays, null values, nested objects).
- The `readLine()` function correctly handles `\r\n` and EOF.
- README simplification is a clear improvement; the redirect URL note in step 2 is retained.
- The commit type table update (`feat` vs `chore`) and code-review skill/agent additions are config-only changes with no risk.
- The `/pr` skill correctly integrates the code-review step before push.

Reviewed commit: [588f119](https://github.com/nownabe/graphein/commit/588f11911647ea29309c6f0d88868800d1ed65cf)
