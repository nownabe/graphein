# 20260419-feat-api-auth-middleware

## Context

Issue: https://github.com/nownabe/graphein/issues/137

### Background

Implement API authentication middleware (Bearer token validation) and fixed-window rate limiting for all API endpoints, as part of the broader API infrastructure (#132).

### Summary

Add Bearer token auth middleware, in-memory fixed-window rate limiter (60 req/min per API key), CSRF exemption for /api/ paths, and unit tests covering auth, rate limiting, and error responses.

## Reviews

### Round 1

Skipped: sub-agent infrastructure not available in worktree agent context. All checks pass via `bun run check:all`.
