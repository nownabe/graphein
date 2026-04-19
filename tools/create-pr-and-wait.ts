#!/usr/bin/env bun
/**
 * create-pr-and-wait: Create a PR and monitor its CI/review status.
 *
 * Usage:
 *   bun run tools/create-pr-and-wait.ts create --title <title> --body <body> [--assignee <user>]
 *   bun run tools/create-pr-and-wait.ts check <pr-number> [--reviewer <user>] [--since <iso-timestamp>] [--wait <seconds>]
 *
 * Exit codes for `check`:
 *   0 - Approved: LGTM received and all CI checks passed
 *   2 - CI failed: one or more checks failed
 *   3 - Has feedback: review comments or PR comments to address
 *   4 - Pending: CI still running, no actionable feedback yet
 */

import { parseArgs } from "util";

async function gh(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
async function create(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      title: { type: "string" },
      body: { type: "string" },
      assignee: { type: "string", default: "nownabe" },
    },
  });

  if (!values.title || !values.body) {
    console.error("Error: --title and --body are required");
    process.exit(1);
  }

  const result = await gh(
    "pr",
    "create",
    "--title",
    values.title,
    "--body",
    values.body,
    "--assignee",
    values.assignee!,
  );

  if (result.exitCode !== 0) {
    console.error(`Failed to create PR: ${result.stderr}`);
    process.exit(1);
  }

  const url = result.stdout;
  const number = url.split("/").pop();
  console.log(JSON.stringify({ url, number }, null, 2));
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

type Feedback = {
  type: "comment" | "review" | "review_comment";
  author: string;
  body: string;
  url: string;
  path?: string;
  line?: number;
};

type CheckOutput = {
  status: "approved" | "ci_failed" | "has_feedback" | "pending";
  lgtm: boolean;
  ci: {
    state: "pending" | "success" | "failure";
    failed: Array<{ name: string; url: string }>;
  };
  feedback: Feedback[];
};

async function check(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      reviewer: { type: "string", default: "nownabe" },
      since: { type: "string" },
      wait: { type: "string" },
    },
    allowPositionals: true,
  });

  const prNumber = positionals[0];
  if (!prNumber) {
    console.error("Error: PR number is required");
    process.exit(1);
  }

  // Optional wait before checking
  if (values.wait) {
    const seconds = Number.parseInt(values.wait, 10);
    if (seconds > 0) {
      await Bun.sleep(seconds * 1000);
    }
  }

  const reviewer = values.reviewer!;
  const since = values.since ? new Date(values.since) : null;

  // Fetch everything in parallel
  const [checksRes, commentsRes, reviewsRes, reviewCommentsRes] = await Promise.all([
    gh("pr", "checks", prNumber, "--json", "name,state,link"),
    gh("api", `repos/{owner}/{repo}/issues/${prNumber}/comments`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/comments`),
  ]);

  // --- CI checks ---
  let ciState: "pending" | "success" | "failure" = "pending";
  let ciFailed: Array<{ name: string; url: string }> = [];

  if (checksRes.exitCode === 0 && checksRes.stdout) {
    const checks = tryParseJson(checksRes.stdout) as Array<{
      name: string;
      state: string;
      link: string;
    }> | null;

    if (checks && checks.length > 0) {
      const failStates = ["FAILURE", "ERROR", "STARTUP_FAILURE"];
      const allSuccess = checks.every((c) => c.state === "SUCCESS");
      const hasFail = checks.some((c) => failStates.includes(c.state));

      ciState = allSuccess ? "success" : hasFail ? "failure" : "pending";
      ciFailed = checks
        .filter((c) => failStates.includes(c.state))
        .map((c) => ({ name: c.name, url: c.link }));
    }
  }

  // --- Comments, reviews, review comments ---
  const allComments =
    (commentsRes.exitCode === 0 ? (tryParseJson(commentsRes.stdout) as any[]) : null) ?? [];
  const allReviews =
    (reviewsRes.exitCode === 0 ? (tryParseJson(reviewsRes.stdout) as any[]) : null) ?? [];
  const allReviewComments =
    (reviewCommentsRes.exitCode === 0 ? (tryParseJson(reviewCommentsRes.stdout) as any[]) : null) ??
    [];

  // --- LGTM detection (all-time, not filtered by --since) ---
  const lgtm =
    allComments.some((c) => c.user?.login === reviewer && /^\s*LGTM\s*$/i.test(c.body ?? "")) ||
    allReviews.some((r) => r.user?.login === reviewer && r.state === "APPROVED");

  // --- Feedback (filtered by --since) ---
  const isAfterSince = (dateStr: string) => !since || new Date(dateStr) > since;

  const feedback: Feedback[] = [];

  for (const c of allComments) {
    if (!isAfterSince(c.created_at)) continue;
    if (c.user?.type === "Bot") continue;
    if (c.user?.login === reviewer && /^\s*LGTM\s*$/i.test(c.body ?? "")) continue;
    feedback.push({
      type: "comment",
      author: c.user?.login,
      body: c.body,
      url: c.html_url,
    });
  }

  for (const r of allReviews) {
    if (!isAfterSince(r.submitted_at)) continue;
    if (r.user?.type === "Bot") continue;
    if (r.user?.login === reviewer && r.state === "APPROVED") continue;
    if (!r.body?.trim()) continue;
    feedback.push({
      type: "review",
      author: r.user?.login,
      body: r.body,
      url: r.html_url,
    });
  }

  for (const rc of allReviewComments) {
    if (!isAfterSince(rc.created_at)) continue;
    if (rc.user?.type === "Bot") continue;
    feedback.push({
      type: "review_comment",
      author: rc.user?.login,
      body: rc.body,
      url: rc.html_url,
      path: rc.path,
      line: rc.line ?? rc.original_line,
    });
  }

  // --- Determine status ---
  let status: CheckOutput["status"];
  let exitCode: number;

  if (lgtm && ciState === "success") {
    status = "approved";
    exitCode = 0;
  } else if (ciState === "failure") {
    status = "ci_failed";
    exitCode = 2;
  } else if (feedback.length > 0) {
    status = "has_feedback";
    exitCode = 3;
  } else {
    status = "pending";
    exitCode = 4;
  }

  const output: CheckOutput = {
    status,
    lgtm,
    ci: { state: ciState, failed: ciFailed },
    feedback,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const [subcommand, ...rest] = process.argv.slice(2);

switch (subcommand) {
  case "create":
    await create(rest);
    break;
  case "check":
    await check(rest);
    break;
  default:
    console.error(`Usage:
  bun run tools/create-pr-and-wait.ts create --title <title> --body <body> [--assignee <user>]
  bun run tools/create-pr-and-wait.ts check <pr-number> [--reviewer <user>] [--since <iso-timestamp>] [--wait <seconds>]

Subcommands:
  create   Create a pull request and output its URL and number as JSON.
  check    Check PR status (CI checks, comments, reviews).
           Exit codes: 0=approved, 2=ci_failed, 3=has_feedback, 4=pending`);
    process.exit(1);
}
