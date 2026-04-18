/**
 * Interactive script to generate a Slack App manifest for Graphein.
 *
 * Prompts for environment-specific values (app name, URLs, etc.)
 * and outputs a complete YAML manifest to stdout.
 *
 * Usage: bun run scripts/generate-slack-manifest.ts
 */

import { readSync } from "node:fs";

// ---------------------------------------------------------------------------
// Interactive prompt helpers (synchronous fd reads — works reliably in Bun)
// ---------------------------------------------------------------------------

const buf = Buffer.alloc(1);

function readLine(): string {
  let line = "";
  while (true) {
    const bytesRead = readSync(0, buf, 0, 1, null);
    if (bytesRead === 0) return line;
    const ch = buf.toString("utf8", 0, 1);
    if (ch === "\n") return line;
    if (ch !== "\r") line += ch;
  }
}

function ask(question: string, defaultValue: string): string {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  process.stdout.write(`${question}${suffix}: `);
  const answer = readLine().trim();
  return answer || defaultValue;
}

function askYesNo(question: string, defaultValue: boolean): boolean {
  const hint = defaultValue ? "[Y/n]" : "[y/N]";
  process.stdout.write(`${question} ${hint}: `);
  const a = readLine().trim().toLowerCase();
  if (a === "") return defaultValue;
  return a === "y" || a === "yes";
}

// ---------------------------------------------------------------------------
// Minimal YAML serializer (no external deps)
// ---------------------------------------------------------------------------

function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === "boolean") return `${pad}${obj}`;
  if (typeof obj === "number") return `${pad}${obj}`;
  if (typeof obj === "string") return `${pad}${yamlString(obj)}`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]`;
    return obj
      .map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const inner = toYamlObject(item as Record<string, unknown>, indent + 1);
          return `${pad}- ${inner.trimStart()}`;
        }
        return `${pad}- ${toYaml(item, 0).trimStart()}`;
      })
      .join("\n");
  }

  if (typeof obj === "object") {
    return toYamlObject(obj as Record<string, unknown>, indent);
  }

  return `${pad}${String(obj)}`;
}

function toYamlObject(obj: Record<string, unknown>, indent: number): string {
  const pad = "  ".repeat(indent);
  return Object.entries(obj)
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${pad}${key}: null`;
      if (typeof value === "boolean" || typeof value === "number") return `${pad}${key}: ${value}`;
      if (typeof value === "string") return `${pad}${key}: ${yamlString(value)}`;
      return `${pad}${key}:\n${toYaml(value, indent + 1)}`;
    })
    .join("\n");
}

function yamlString(s: string): string {
  if (/[:#{}[\],&*?|>!%@`"']/.test(s) || s.trim() !== s) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Manifest builder
// ---------------------------------------------------------------------------

interface ManifestOptions {
  appName: string;
  redirectUrl: string;
  socketMode: boolean;
}

function buildManifest(opts: ManifestOptions): Record<string, unknown> {
  return {
    display_information: {
      name: opts.appName,
      description: "Turn Slack messages into tasks, snippets, and kudos",
      background_color: "#1a1a2e",
    },
    features: {
      bot_user: {
        display_name: opts.appName,
        always_online: true,
      },
      shortcuts: [
        {
          name: `${opts.appName}: Create Task`,
          type: "message",
          callback_id: "create_task",
          description: "Create a task on Graphein from this message",
        },
        {
          name: `${opts.appName}: Add Snippet`,
          type: "message",
          callback_id: "add_snippet",
          description: "Add a message to Graphein as a snippet",
        },
        {
          name: `${opts.appName}: Add Kudos`,
          type: "message",
          callback_id: "add_kudos",
          description: "Add a message to Graphein as kudos",
        },
      ],
    },
    oauth_config: {
      redirect_urls: [opts.redirectUrl],
      scopes: {
        bot: [
          "channels:history",
          "channels:read",
          "chat:write",
          "reactions:write",
          "users:read",
          "users:read.email",
          "usergroups:read",
        ],
      },
    },
    settings: {
      event_subscriptions: {
        bot_events: ["message.channels"],
      },
      interactivity: {
        is_enabled: true,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: opts.socketMode,
      token_rotation_enabled: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("=== Graphein Slack App Manifest Generator ===\n");

const appName = ask("App name", "Graphein");
const baseUrl = ask("Base URL (e.g. https://graphein.example.com)", "http://localhost:3000");
const socketMode = askYesNo("Enable Socket Mode?", true);

const redirectUrl = `${baseUrl.replace(/\/$/, "")}/auth/slack/callback`;
console.log(`\n  Redirect URL: ${redirectUrl}`);

const manifest = buildManifest({ appName, redirectUrl, socketMode });
const yaml = toYaml(manifest);

console.log("\n--- Generated Manifest (YAML) ---\n");
console.log(yaml);

const outputPath = ask("\nWrite to file? (leave empty to skip)", "");
if (outputPath) {
  await Bun.write(outputPath, yaml + "\n");
  console.log(`\nWritten to ${outputPath}`);
}
