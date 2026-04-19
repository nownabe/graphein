# 20260419-feat-api-schemas-and-scaffold

## Context

Issue: https://github.com/nownabe/graphein/issues/138

### Background

Create the shared Zod schemas for pagination, error responses, and common embedded objects, and set up the OpenAPIHono sub-app scaffold. This is part of the larger API implementation effort (parent issue #132).

### Summary

Add reusable Zod schemas (pagination, error, embedded user/usergroup/createdBy) in `src/api/schemas.ts`. Create OpenAPIHono sub-app with `/doc` and `/reference` endpoints in `src/api/routes.ts`, mounted at `/api/v1` in the main app.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [7120095](https://github.com/nownabe/graphein/commit/7120095ff150fcd43ba0df230e88e8fce2f12e70)

Changes are clean and well-structured. Schemas match the API design doc. OpenAPI scaffold is correctly wired. All checks pass.
