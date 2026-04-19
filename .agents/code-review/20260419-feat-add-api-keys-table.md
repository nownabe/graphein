# 20260419-feat-add-api-keys-table

## Context

Issue: https://github.com/nownabe/graphein/issues/134

### Background

Create the `api_keys` table in the Drizzle ORM schema and generate the corresponding database migration, as part of the API authentication feature (#132).

### Summary

Add the `apiKeys` table definition to `src/db/schema.ts` with columns for hashed key storage, key prefix, role, expiration, and revocation tracking. Define Drizzle relations between `apiKeys` and `users`. Generate and include the database migration.

## Reviews
