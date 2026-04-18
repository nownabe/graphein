# 20260418-refactor-extract-usergroup-service

## Context

Issue: https://github.com/nownabe/graphein/issues/85

### Background

The add_kudos_modal view handler in bolt.ts depends on snippetService for usergroup operations (findOrCreateUsergroup, isUsergroupMembershipStale, syncUsergroupMembers), creating a cross-domain dependency where the kudos feature relies on the snippet service for usergroup management.

### Summary

Extract usergroup operations from snippetService into a shared usergroupService that both snippets and kudos (via bolt.ts) depend on, since usergroups are a cross-cutting Slack concept.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [e81ce32](https://github.com/nownabe/graphein/commit/e81ce32db6fc14911e5587cabcacae5113d0b1e0)

Clean mechanical extraction of usergroup operations from snippetService into a dedicated usergroupService. The new service code is identical to the removed code. All call sites (bolt.ts, snippets/routes.tsx) are correctly updated, dependency wiring (index.ts, app.ts, config.ts, test/helpers.ts) is complete, and unused imports (usergroupMembers) were properly cleaned up from snippets/service.ts. No logic changes, no missed references.
