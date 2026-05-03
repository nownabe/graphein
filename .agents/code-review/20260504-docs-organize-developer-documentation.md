# 20260504-docs-organize-developer-documentation

## Context

Issue: N/A

### Background

Developer documentation was mixed into README.md alongside user-facing content. The goal is to separate concerns: README.md for self-hosters, and a dedicated docs/development.md for contributors.

### Summary

Move development commands, testing instructions, coding conventions, and API design guidelines from README.md into a new docs/development.md. README.md now links to the developer docs instead of inlining them.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [147e3b0](https://github.com/nownabe/graphein/commit/147e3b0d42bf34954c15d9277a706c97cb1f0367)

Documentation-only change. Moves developer commands from README.md into a dedicated docs/development.md with expanded content (database, testing, conventions, API design sections). No issues found.
