# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Graphein - a web service that converts Slack posts into tasks, built with Bun/TypeScript.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (with JSX SSR)
- **Database**: PostgreSQL + Drizzle ORM
- **Slack**: Slack Bolt (custom HonoReceiver)
- **LLM**: Gemini 2.0 Flash via @google/genai
- **Frontend**: Hono JSX (SSR) + htmx + Tailwind CSS v4

## Commands

- `bun run dev` — start dev server with watch mode
- `bun run db:up` — start PostgreSQL via Docker Compose
- `bun run db:down` — stop Docker Compose services
- `bun run db:generate` — generate Drizzle migration files
- `bun run db:migrate` — apply migrations
- `bun run css` — watch & build Tailwind CSS
- `bun run css:build` — build & minify Tailwind CSS
- `bun run tsc --noEmit` — type check
- `bun test` — run `bun:test` unit tests (files: `src/**/*.test.ts{,x}`)

## Definition of done

Before reporting that a task is complete, you MUST:

1. Run `bun run tsc --noEmit` and make sure it passes.
2. Run `bun test` and make sure all tests pass. Add or update tests when you
   change behavior.
3. **Visually verify the change in the browser** using the chrome-devtools MCP
   tools (`navigate_page` / `take_screenshot`). Do not trust code-level
   reasoning alone for UI changes — actually look at the rendered result. Save
   the screenshot to the repo root with a descriptive name if it's useful for
   the user to inspect.
4. Only after all three steps succeed may you report the work as done.

## Slack bot required scopes

### Production (runtime)

These are the scopes the running web service needs. The shortcut handler
receives the source message (including `blocks`) directly in the shortcut
payload, so it does not need history scopes at runtime.

- `commands` — receive the "Create task" message shortcut
- `chat:write` — post task-created confirmation + ephemeral error messages
- `users:read`, `users:read.email` — resolve `<@U...>` mentions to members
- `usergroups:read` — resolve `<!subteam^...>` group handles
- `channels:read`, `groups:read` — resolve `<#C...>` channel names
  (without these, channels render as raw IDs)

### Development / maintenance only

Only needed when running `scripts/rehydrate-descriptions.ts` to backfill
existing task descriptions by re-fetching the original Slack messages.
Not required by the running service.

- `channels:history`, `groups:history`, `im:history`, `mpim:history` —
  read the original message via `conversations.history` to recover the
  rich_text blocks

## Architecture

- `src/index.ts` — Bun server entry point
- `src/app.ts` — Hono app with route integration
- `src/env.ts` — environment variable validation
- `src/db/` — Drizzle schema and client
- `src/auth/` — Slack OAuth (OpenID Connect) + JWT cookie auth
- `src/tasks/` — task CRUD routes and service
- `src/members/` — member lookup/upsert service
- `src/slack/` — Bolt app, HonoReceiver, mention helpers
- `src/llm/` — Gemini structured output for task generation
- `src/views/` — Hono JSX components and pages

## Conventions

- Files using JSX must have `.tsx` extension
- Route files importing JSX components use `.tsx` extension with explicit import paths
- `HX-Request` header is used to serve partial (htmx) vs full page responses
- Database port is 15432 (mapped from container's 5432)
