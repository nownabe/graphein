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
