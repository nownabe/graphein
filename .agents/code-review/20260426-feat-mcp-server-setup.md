# 20260426-feat-mcp-server-setup

## Context

Issue: https://github.com/nownabe/graphein/issues/163

### Background

Graphein needs an MCP server to allow AI assistants to interact with tasks, snippets, and kudos through the Model Context Protocol. This change adds the server factory and mounts the MCP + OAuth endpoints.

### Summary

Add MCP server factory (createMcpServer) and mount mcpAuthRouter + /mcp endpoint in app.ts with Bearer auth, rate limiting, and contextStorage.

## Reviews
