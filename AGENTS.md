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

The Slack bot token needs at least these scopes for full functionality:

- `chat:write`, `commands`, `im:history`, `channels:history`, `groups:history` — core message/shortcut handling
- `users:read`, `users:read.email` — resolving user mentions to members
- `usergroups:read` — resolving `<!subteam^...>` to group names
- `channels:read`, `groups:read` — resolving `<#C...>` channel mentions to names (without these, channels render as raw IDs)

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
