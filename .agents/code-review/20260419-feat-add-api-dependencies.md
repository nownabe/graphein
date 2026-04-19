# 20260419-feat-add-api-dependencies

## Context

Issue: https://github.com/nownabe/graphein/issues/133

### Background

Install the required npm packages for the JSON API implementation as part of the API feature (#132).

### Summary

Add zod, @hono/zod-openapi, and @scalar/hono-api-reference as project dependencies.

## Reviews

### Round 1

**Status: APPROVED**

This is a dependency-only change adding three packages (zod, @hono/zod-openapi, @scalar/hono-api-reference) to package.json. The packages are correctly listed as production dependencies with appropriate version ranges. All existing tests pass and the packages are importable.
