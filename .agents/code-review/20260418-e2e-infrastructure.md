# 20260418-e2e-infrastructure

## Context

Issue: https://github.com/nownabe/graphein/issues/100

### Background

Set up the foundation for Playwright-based E2E tests. The project currently has unit and integration tests but no E2E test infrastructure. E2E tests will verify the full Slack → Graphein integration paths using the Slack Web API (not browser automation).

### Summary

Install Playwright, create playwright.config.ts, set up test helpers for Slack API interactions, database verification, JWT-based auth, and custom Playwright fixtures. Add npm scripts and documentation.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [f5dbcf3](https://github.com/nownabe/graphein/commit/f5dbcf3346232a12b96f717780ec6002d536a5dc)

The E2E test infrastructure is well-structured and consistent with the project's conventions. The Playwright config, custom fixtures, and helper modules (auth, db, env, slack) are cleanly separated with clear responsibilities. The JWT-based auth bypass correctly mirrors the app's session logic. The `waitFor` polling helper has sensible defaults. No correctness, security, or performance issues found.
