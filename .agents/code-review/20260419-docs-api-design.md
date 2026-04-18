# 20260419-docs-api-design

## Context

Issue: N/A

### Background

Adding a JSON API to Graphein to allow external tools (CI bots, dashboards, scripts) to interact with tasks, snippets, and kudos programmatically. This PR adds the design document and updates AGENTS.md with AIP guidelines.

### Summary

Add API design document (`docs/design/api.md`) covering authentication, endpoints, pagination, rate limiting, and error handling. Add API design section to AGENTS.md referencing Google AIP conventions.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [2216c98](https://github.com/nownabe/graphein/commit/2216c987233b430de98f7e88230ddeaf4c46ae11)

Documentation-only change adding a well-structured API design document and corresponding AGENTS.md section. The design covers authentication (API keys with hash-only storage), endpoints, cursor-based pagination (AIP-158), rate limiting, and error handling. The auth model correctly handles admin demotion via auto-revocation. No issues found.
