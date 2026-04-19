# 20260419-feat-tasks-api

## Context

Issue: https://github.com/nownabe/graphein/issues/139

### Background

Implement the Tasks API endpoints as part of the broader JSON API for Graphein. This allows external tools (CI bots, dashboards, scripts) to interact with tasks programmatically via API keys.

### Summary

Add five Tasks API endpoints: GET /tasks (list assigned), GET /tasks/owned (list owned), GET /tasks/owned/:id/assignees (list assignees), POST /tasks/owned/:id/archive, and POST /tasks/owned/:id/unarchive. Includes cursor-based pagination, authorization checks, OpenAPI schemas, and unit tests.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [2cd0506](https://github.com/nownabe/graphein/commit/2cd0506c4cf8d3758ee08179cf92866273879e2c)

Code is well-structured with proper authorization checks, cursor-based pagination with filter fingerprinting, idempotent archive/unarchive operations, and comprehensive test coverage. All endpoints follow the API design doc conventions.
