# 20260426-feat-comment-pr-tool

## Context

Issue: N/A

### Background

Add a CLI tool for posting PR comments with an agent/model footer, and enforce its usage via Claude hooks.

### Summary

New `tools/comment-pr.ts` that wraps `gh pr comment` with required `--agent` and `--model` options, automatically appending a footer. CLAUDE.md updated with documentation, and `.claude/nownabe-claude-hooks.json` updated with a forbidden pattern to enforce usage.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [447264f](https://github.com/nownabe/graphein/commit/447264f4b0ccf31662f097576b7666927fd2ebf9)

The changes are clean and well-structured. The new `tools/comment-pr.ts` CLI tool correctly validates inputs, handles both inline and file-based body content, and properly appends the agent/model footer. The Claude hooks enforcement is a good safeguard. The OAuth consent page refactor from raw HTML string to a proper JSX component using the shared Layout is a solid improvement -- it gains i18n support, theme consistency, and proper `hx-boost="false"` to prevent htmx from intercepting OAuth redirects. The CSRF exemptions for MCP/OAuth paths are correct (using `startsWith` matching) and the test correctly verifies that `/oauth/authorize` remains protected. The OpenAPI schema additions (401/429 responses, security scheme) are documentation-only improvements with no behavioral changes.
