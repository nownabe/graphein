# 20260419-feat-codex-review-skill

## Context

Issue: N/A

### Background

Adding a new Claude Code skill that uses the Codex CLI (`codex review`) to perform code reviews. This provides an alternative reviewer (OpenAI-based) alongside the existing Claude-based code-review skill, with findings logged in the same format.

### Summary

Add `.claude/skills/codex-review/SKILL.md` — a skill that runs `codex review --base main`, analyzes the output, and appends review findings to `.agents/code-review/` logs with a `(Codex)` tag to distinguish from Claude-based reviews.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [3540b50](https://github.com/nownabe/graphein/commit/3540b5034a2122e17d8303f5157f161b014a3979)

The branch includes multiple changes: a new Codex review skill, API keys service with schema/migration/tests, kudos self-post exclusion fix, snippet label cleanup, and E2E test improvements. All look correct.

Key observations:
- API keys service: proper SHA-256 hashing, advisory lock for concurrency control on the per-user limit, role consistency auto-revocation, and thorough integration tests covering edge cases including concurrent key creation.
- Kudos fix: correctly excludes self-posted kudos from the "To" filter and updates `getDistinctMentionedUsers` to stay consistent.
- Snippet label change: drops the `@` prefix from usergroup handles in filter options and switches from truthiness to nullish coalescing -- both intentional and safe given handles are never empty strings.
- No missing index on `api_keys.user_id` but acceptable at current scale (max 10 keys per user).
- The `verifyApiKey` comment says "fire-and-forget" but the code awaits -- the await is actually the better behavior, so this is a harmless comment inaccuracy.
