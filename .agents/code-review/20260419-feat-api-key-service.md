# 20260419-feat-api-key-service

## Context

Issue: https://github.com/nownabe/graphein/issues/135

### Background

Implement the API key management service that handles key generation, hashing, listing, revocation, and verification. This is part of the larger JSON API feature (#132) that adds programmatic access to Graphein.

### Summary

Add `src/api-keys/service.ts` with four functions: `createApiKey`, `listApiKeys`, `revokeApiKey`, and `verifyApiKey`. Includes integration tests covering all acceptance criteria.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [a615e50](https://github.com/nownabe/graphein/commit/a615e506226dec05b292504101dc1a74989974e2)

The implementation is correct and well-structured:

- `createApiKey` uses `crypto.getRandomValues` for secure random generation and `crypto.subtle.digest` for SHA-256 hashing. Raw key is only returned from this function, never stored.
- `listApiKeys` explicitly selects columns excluding `keyHash`, preventing accidental exposure.
- `revokeApiKey` correctly checks ownership/admin before revoking and is idempotent.
- `verifyApiKey` performs all required checks (hash match, revocation, expiration, role consistency) and auto-revokes admin keys held by demoted users.
- Integration tests cover all acceptance criteria including edge cases (key limit, revoked keys not counting toward limit, idempotent revocation, role demotion auto-revoke).
- Test helpers properly updated with `apiKeys` cleanup (before users, respecting FK order).

### Round 2

#### Review

Status: APPROVED
Reviewed commit: [5e1f56a](https://github.com/nownabe/graphein/commit/5e1f56a180ced85612136c71b1589a70c68e7d14)

Addresses PR review feedback:

- Role validation added: `createApiKey` now looks up the user's role from DB and returns `admin_role_required` error when a non-admin tries to create an admin key. Check is done before key generation to avoid wasted work.
- Concurrency safety: count+insert wrapped in `db.transaction()` with `pg_advisory_xact_lock(hashtext('api_key_limit'), hashtext(userId))`, following the same advisory lock pattern used in `users/service.ts`. The per-user lock key means different users are not blocked by each other.
- Three new integration tests: non-admin cannot create admin key, admin can create admin key, concurrent requests respect the limit via advisory lock.
- Existing test fixed: `listApiKeys` ordering test now uses an admin user since it creates an admin-scoped key.
