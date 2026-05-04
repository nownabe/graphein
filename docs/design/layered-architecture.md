# Graphein Layered Architecture

## Overview

Define a layered architecture for Graphein where the layer is visible from the
directory structure.

The main purpose is to stop Web UI, JSON API, and MCP from each owning the same
business behavior in parallel.

## Goals

- Make the architectural layer obvious from the file path
- Keep transport adapters thin
- Put shared behavior in one place
- Prevent API/MCP/Web behavior drift
- Make refactoring decisions consistent

## Non-Goals

- A full clean-room rewrite of the current `src/` tree
- Introducing unnecessary abstractions for single-use code
- Forcing all existing files to move at once

---

## Directory-First Rule

When reading a file path, it should be possible to tell which layer it belongs
to before opening the file.

Target rule:

```text
src/
  adapters/        # transport and external interface adapters
  application/     # use-cases and shared application services
  domain/          # pure business logic and value-level rules
  infrastructure/  # DB and external system integrations
```

Dependencies must point inward:

```text
adapters -> application -> domain
adapters -> application -> infrastructure
application -> domain
application -> infrastructure
```

Not allowed:

```text
domain -> adapters
application -> adapters
infrastructure -> adapters
domain -> infrastructure
```

`domain -> infrastructure` is disallowed because pure business rules should not
depend on persistence or external systems.

---

## Target Structure

The intended structure is:

```text
src/
  adapters/
    web/
      auth/
      tasks/
      snippets/
      kudos/
      admin/
      api-keys/
      views/
    api/
      routes.ts
      middleware.ts
      schemas.ts
      tasks.ts
      snippets.ts
      kudos.ts
      admin.ts
    mcp/
      server.ts
      auth-provider.tsx
      resources/
      tools/
    slack/
      bolt.ts
      receiver.ts

  application/
    tasks/
      service.ts
      list-assigned-tasks.ts
      list-owned-tasks.ts
      archive-task.ts
    snippets/
      service.ts
      list-snippets.ts
    kudos/
      service.ts
      list-kudos.ts
    admin/
      manage-snippet-channels.ts
      manage-kudos-channels.ts
    users/
      service.ts
    oauth/
      service.ts

  domain/
    pagination/
      cursor.ts
      filters.ts
    time/
      iso8601.ts
    tasks/
      policies.ts
    snippets/
      policies.ts
    kudos/
      policies.ts

  infrastructure/
    db/
      client.ts
      schema.ts
    slack/
      client.ts
      labels.ts
      helpers.ts
      rich-text.ts
      mrkdwn.tsx
    llm/
      gemini.ts
```

This does not mean every file must exist immediately. It defines the direction
for future moves and new code.

---

## Layer Responsibilities

### `src/adapters/`

This layer handles protocol-specific or framework-specific entrypoints.

Owns:

- transport protocol handling
- framework-specific request/response code
- transport-shaped validation
- auth/session/context extraction
- presentation formatting

Must not own:

- shared business rules
- shared pagination semantics
- shared query semantics
- idempotency behavior reused by multiple transports
- database access patterns that define business behavior

Concrete examples:

- Hono routes
- OpenAPI route definitions
- MCP tool/resource registration
- Slack HTTP handlers
- JSX rendering
- HTTP status code mapping
- MCP `isError` mapping

Likely Graphein paths:

- `src/api/*`
- `src/mcp/*`
- `src/tasks/routes.tsx`
- `src/snippets/routes.tsx`
- `src/kudos/routes.tsx`
- `src/admin/routes.tsx`
- `src/auth/routes.tsx`
- `src/views/*`

### `src/application/`

This layer owns shared use-cases and application behavior.

Owns:

- use-case orchestration
- shared operation semantics
- cross-transport business behavior
- application-level authorization decisions
- shared result types returned to adapters

Must not own:

- Hono `Context`
- MCP SDK response types
- JSX rendering
- OpenAPI schema definitions
- raw transport response formatting

Concrete examples:

- list tasks for API and MCP
- snippet listing used by Web/API/MCP
- admin channel management semantics
- task archive / unarchive operations
- create-or-return-existing behavior
- not-found vs already-exists operation outcomes

Likely Graphein paths:

- `src/tasks/service.ts`
- `src/snippets/service.ts`
- `src/kudos/service.ts`
- future `src/application/snippets/list-snippets.ts`
- future `src/application/admin/manage-snippet-channels.ts`

This is the default place for code that is currently duplicated between
`src/api/*`, `src/mcp/*`, and Web routes.

### `src/domain/`

This layer contains pure logic.

Owns:

- pure business rules
- reusable value-level helpers
- invariants that do not require I/O
- small domain concepts and policies

Must not own:

- SQL queries
- framework types
- external API calls
- request/response objects
- persistence concerns

Concrete examples:

- cursor encoding/decoding
- filter fingerprinting
- ISO-8601 validation
- policy checks that do not need framework objects
- task ownership policy helpers

Likely Graphein candidates:

- duplicated page token helpers currently in `src/api/*` and `src/mcp/*`
- duplicated datetime validation helpers
- future `src/domain/pagination/*`
- future `src/domain/time/iso8601.ts`

This layer should be easy to unit test directly.

### `src/infrastructure/`

This layer integrates with systems outside the core behavior.

Owns:

- persistence
- external API integration
- third-party client setup
- low-level system interaction

Must not own:

- transport response formatting
- cross-transport business semantics
- business branching that should be shared in the application layer

Concrete examples:

- database client and schema
- Slack API integrations
- OAuth persistence
- LLM client integration
- Drizzle query primitives

Likely Graphein paths:

- `src/db/*`
- `src/slack/helpers.ts`
- `src/slack/labels.ts`
- `src/llm/gemini.ts`
- persistence-facing parts of OAuth storage

---

## Mapping From Current Structure

The current tree is organized mostly by feature:

```text
src/
  tasks/
  snippets/
  kudos/
  api/
  mcp/
  slack/
  db/
```

That is workable, but it hides the architectural layer. For example:

- `src/api/snippets.ts` and `src/mcp/tools/snippets.ts` look separate because of
  transport, even when they should share one use-case
- `src/tasks/service.ts` mixes application behavior under a feature directory,
  while similar shared behavior in `src/api/*` may bypass it

The target structure makes these distinctions visible:

- adapter code lives under `src/adapters/*`
- shared use-cases live under `src/application/*`
- pure helpers live under `src/domain/*`
- DB/external integrations live under `src/infrastructure/*`

---

## Concrete Rules For New Code

### If the code is only about HTTP, MCP, Slack, or JSX

Put it in `src/adapters/`.

Examples:

- OpenAPI schema definitions
- Hono route handlers
- MCP `registerTool()` calls
- rendering `c.json(...)`

### If the code is reused by Web, API, or MCP

Put it in `src/application/`.

Examples:

- task listing semantics
- snippet listing semantics
- admin channel create/remove outcomes

### If the code is pure and reusable without I/O

Put it in `src/domain/`.

Examples:

- `encodePageToken`
- `decodePageToken`
- `isValidIso8601`
- filter fingerprint helpers

### If the code talks to Postgres, Slack, or Gemini

Put it in `src/infrastructure/`.

Examples:

- Drizzle query modules
- Slack label resolution client wrappers
- LLM extraction client

---

## Result Types

Shared application code should return explicit outcomes rather than transport
responses.

Example:

```ts
type RemoveChannelResult = { ok: true } | { ok: false; error: "not_found" };
```

Then:

- Web decides how to render the result
- API decides the status code and JSON shape
- MCP decides normal content vs `isError`

This keeps the semantics in `application/` and the formatting in `adapters/`.

---

## Migration Strategy

Adopt this structure incrementally.

Recommended order:

1. Move shared pure helpers into `src/domain/`
2. Extract shared use-cases into `src/application/`
3. Make API/MCP/Web call those use-cases from `src/adapters/`
4. Move infrastructure-specific code behind `src/infrastructure/` boundaries as
   needed

For the current API/MCP refactor, the immediate targets are:

- `src/domain/pagination/*` for cursor and filter helpers
- `src/application/snippets/list-snippets.ts` for shared snippet listing
- `src/application/admin/*` for shared channel management semantics

---

## Summary

The directory structure should communicate the architecture directly:

- `src/adapters/` means transport and rendering
- `src/application/` means shared use-cases
- `src/domain/` means pure business logic
- `src/infrastructure/` means DB and external integrations

If a reader cannot tell the layer from the path, the structure is not doing its
job.
