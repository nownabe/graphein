# 20260419-docs-mcp-design-doc

## Context

Issue: N/A

### Background

Adding a design document for implementing an MCP (Model Context Protocol) server in Graphein. The MCP server will allow AI assistants to interact with tasks, snippets, and kudos via standardized MCP tools and resources, authenticated with OAuth 2.1.

### Summary

New design doc at `docs/design/mcp.md` covering technology selection (Streamable HTTP transport, @hono/mcp, @modelcontextprotocol/sdk), OAuth 2.1 authentication flow, MCP tools/resources mapping to existing API endpoints, database schema additions, and implementation structure.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [cdd4fe4](https://github.com/nownabe/graphein/commit/cdd4fe4a4c8ea7612142e51a3bad889568972cd3)

Design document is comprehensive and well-structured. No code logic changes to review. Minor implementation notes for future reference: (1) ensure JWT `aud` claim validation distinguishes MCP access tokens from session tokens since they share the same HS256 signing secret, (2) consider storing `code_challenge_method` in the `oauth_authorization_codes` table for forward compatibility, (3) verify that the MCP SDK supports multiple concurrent `connect()` calls to a single `McpServer` instance in stateless mode.
