#!/usr/bin/env bun
/**
 * PreToolUse hook: auto-approve all tools in handle-issue sessions.
 *
 * Logs every tool invocation as JSONL to <logDir>/tools.jsonl with structured
 * metadata including whether the tool is already in the settings.json allow
 * list. The log directory is read from `.handle-issue.json` written by
 * bin/handle-issue.
 *
 * When `.handle-issue.json` does not exist, exits silently (no decision
 * output) so normal permission rules apply.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
const toolName: string = input.tool_name ?? "unknown";
const toolInput: Record<string, unknown> = input.tool_input ?? {};

// Detect handle-issue session via config file written by bin/handle-issue.
// Environment variables are not reliably propagated to hook subprocesses by
// Claude CLI, so we use a file-based mechanism instead.
// Use `input.cwd` (the session's working directory) to resolve the config path,
// since the hook's cwd is the main repo root, not the worktree.
const configPath = resolve(input.cwd ?? ".", ".handle-issue.json");
if (!existsSync(configPath)) {
  process.exit(0);
}
const handleIssueConfig: { logDir: string } = JSON.parse(readFileSync(configPath, "utf-8"));

// ---------------------------------------------------------------------------
// Permission key (mirrors settings.json allow-list format)
// ---------------------------------------------------------------------------

function buildPermissionKey(): string {
  switch (toolName) {
    case "Bash":
      return `Bash(${toolInput.command ?? ""})`;
    case "Skill":
      return `Skill(${toolInput.skill ?? ""})`;
    default:
      return toolName;
  }
}

// ---------------------------------------------------------------------------
// Allow-list matching
// ---------------------------------------------------------------------------

function loadAllowList(): string[] {
  try {
    const settings = JSON.parse(readFileSync(".claude/settings.json", "utf-8"));
    return settings?.permissions?.allow ?? [];
  } catch {
    return [];
  }
}

function isAllowed(permKey: string, allowList: string[]): boolean {
  for (const pattern of allowList) {
    // Exact match
    if (pattern === permKey) return true;

    // Glob suffix without parens: "mcp__chrome-devtools__*" → prefix match
    if (pattern.endsWith("*") && !pattern.includes("(")) {
      if (permKey.startsWith(pattern.slice(0, -1))) return true;
    }

    // Tool-arg glob: "Bash(git push:*)" matches "Bash(git push origin main)"
    const m = pattern.match(/^(\w+)\((.+):\*\)$/);
    if (m) {
      const [, patternTool, patternPrefix] = m;
      const km = permKey.match(/^(\w+)\(([\s\S]*)\)$/);
      if (km && km[1] === patternTool && km[2].startsWith(patternPrefix)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Log & approve
// ---------------------------------------------------------------------------

const permKey = buildPermissionKey();
const allowList = loadAllowList();

const record = {
  timestamp: new Date().toISOString(),
  tool_name: toolName,
  permission_key: permKey.length > 500 ? `${permKey.slice(0, 500)}…` : permKey,
  already_allowed: isAllowed(permKey, allowList),
  ...(toolName === "Bash" && {
    command: String(toolInput.command ?? "").slice(0, 500),
  }),
  ...(toolName === "Skill" && { skill: toolInput.skill }),
  ...(toolName === "Read" && { file_path: toolInput.file_path }),
  ...(toolName === "Write" && { file_path: toolInput.file_path }),
  ...(toolName === "Edit" && { file_path: toolInput.file_path }),
  ...(toolName === "Glob" && { pattern: toolInput.pattern }),
  ...(toolName === "Grep" && { pattern: toolInput.pattern }),
};

const logDir = handleIssueConfig.logDir;
mkdirSync(logDir, { recursive: true });
appendFileSync(resolve(logDir, "tools.jsonl"), JSON.stringify(record) + "\n");

console.log(JSON.stringify({ decision: "allow" }));
