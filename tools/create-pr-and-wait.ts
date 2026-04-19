#!/usr/bin/env bun
/**
 * create-pr-and-wait: Create a PR and block until CI passes and LGTM is received.
 *
 * Usage:
 *   bun run tools/create-pr-and-wait.ts create --title <title> --body <body> [--assignee <user>] [--reviewer <user>] [--labels <l1,l2>] [--draft] [--base <branch>]
 *   bun run tools/create-pr-and-wait.ts wait <pr-number> [--reviewer <user>] [--since <iso-timestamp>]
 *
 * Both subcommands poll every 30s (up to 10 times = ~5 min). When a change is
 * detected the tool waits a few seconds for all related data to settle, then
 * re-fetches everything and exits with the final result.
 *
 * The JSON output includes a `status` field indicating the result:
 *   approved      LGTM received and all CI checks passed
 *   ci_failed     one or more CI checks failed
 *   has_feedback  review comments or PR comments to address
 *   pending       nothing actionable yet (poll timed out, call `wait` again)
 *
 * Exit code is always 0 on success. Non-zero only on errors (e.g., PR creation failure).
 */

import { parseArgs } from "util";

const POLL_INTERVAL_SEC = 30;
const MAX_POLLS = 10;
const SETTLE_DELAY_SEC = 5;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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
// types
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
  pr: { url: string; number: string };
  ci: {
    state: "pending" | "success" | "failure";
    failed: Array<{ name: string; url: string }>;
  };
  feedback: Feedback[];
};

// ---------------------------------------------------------------------------
// snapshot — lightweight counts for change detection
// ---------------------------------------------------------------------------

type Snapshot = {
  ciFinished: boolean;
  ciHasFail: boolean;
  commentCount: number;
  reviewCount: number;
  reviewCommentCount: number;
};

async function takeSnapshot(prNumber: string, since: Date | null): Promise<Snapshot> {
  const [checksRes, commentsRes, reviewsRes, reviewCommentsRes] = await Promise.all([
    gh("pr", "checks", prNumber, "--json", "state"),
    gh("api", `repos/{owner}/{repo}/issues/${prNumber}/comments`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/comments`),
  ]);

  // CI
  let ciFinished = false;
  let ciHasFail = false;
  if (checksRes.exitCode === 0 && checksRes.stdout) {
    const checks = (tryParseJson(checksRes.stdout) as Array<{ state: string }>) ?? [];
    if (checks.length > 0) {
      const failStates = ["FAILURE", "ERROR", "STARTUP_FAILURE"];
      const doneStates = ["SUCCESS", "SKIPPED", ...failStates];
      ciFinished = checks.every((c) => doneStates.includes(c.state));
      ciHasFail = checks.some((c) => failStates.includes(c.state));
    }
  }

  // Counts (filtered by since)
  const isAfterSince = (dateStr: string) => !since || new Date(dateStr) > since;

  const comments =
    (commentsRes.exitCode === 0 ? (tryParseJson(commentsRes.stdout) as any[]) : null) ?? [];
  const reviews =
    (reviewsRes.exitCode === 0 ? (tryParseJson(reviewsRes.stdout) as any[]) : null) ?? [];
  const reviewComments =
    (reviewCommentsRes.exitCode === 0 ? (tryParseJson(reviewCommentsRes.stdout) as any[]) : null) ??
    [];

  return {
    ciFinished,
    ciHasFail,
    commentCount: comments.filter((c: any) => isAfterSince(c.created_at)).length,
    reviewCount: reviews.filter((r: any) => isAfterSince(r.submitted_at)).length,
    reviewCommentCount: reviewComments.filter((rc: any) => isAfterSince(rc.created_at)).length,
  };
}

function snapshotChanged(prev: Snapshot, curr: Snapshot): boolean {
  return (
    curr.ciFinished !== prev.ciFinished ||
    curr.ciHasFail !== prev.ciHasFail ||
    curr.commentCount !== prev.commentCount ||
    curr.reviewCount !== prev.reviewCount ||
    curr.reviewCommentCount !== prev.reviewCommentCount
  );
}

// ---------------------------------------------------------------------------
// full fetch — collect all data for the final result
// ---------------------------------------------------------------------------

async function collectResult(
  prNumber: string,
  reviewer: string,
  since: Date | null,
): Promise<CheckOutput> {
  const [checksRes, commentsRes, reviewsRes, reviewCommentsRes, prViewRes] = await Promise.all([
    gh("pr", "checks", prNumber, "--json", "name,state,link"),
    gh("api", `repos/{owner}/{repo}/issues/${prNumber}/comments`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`),
    gh("api", `repos/{owner}/{repo}/pulls/${prNumber}/comments`),
    gh("pr", "view", prNumber, "--json", "url", "--jq", ".url"),
  ]);

  const prUrl = prViewRes.exitCode === 0 ? prViewRes.stdout : "";

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
      const passStates = ["SUCCESS", "SKIPPED"];
      const allSuccess = checks.every((c) => passStates.includes(c.state));
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

  // --- LGTM detection (filtered by --since) ---
  const isAfterSince = (dateStr: string) => !since || new Date(dateStr) > since;

  const lgtm =
    allComments.some(
      (c) =>
        isAfterSince(c.created_at) &&
        c.user?.login === reviewer &&
        /^\s*LGTM\s*$/i.test(c.body ?? ""),
    ) ||
    allReviews.some(
      (r) => isAfterSince(r.submitted_at) && r.user?.login === reviewer && r.state === "APPROVED",
    );

  // --- Feedback (filtered by --since) ---
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

  if (lgtm && ciState === "success") {
    status = "approved";
  } else if (ciState === "failure") {
    status = "ci_failed";
  } else if (feedback.length > 0) {
    status = "has_feedback";
  } else {
    status = "pending";
  }

  return {
    status,
    lgtm,
    pr: { url: prUrl, number: prNumber },
    ci: { state: ciState, failed: ciFailed },
    feedback,
  };
}

// ---------------------------------------------------------------------------
// poll loop — detect change, settle, then collect final result
// ---------------------------------------------------------------------------

async function pollLoop(prNumber: string, reviewer: string, since: Date | null): Promise<never> {
  // Take initial snapshot as baseline
  let baseline = await takeSnapshot(prNumber, since);

  for (let i = 0; i < MAX_POLLS; i++) {
    await Bun.sleep(POLL_INTERVAL_SEC * 1000);

    const current = await takeSnapshot(prNumber, since);

    if (snapshotChanged(baseline, current)) {
      // Change detected — wait for related data to settle before collecting
      console.error("Change detected, waiting for data to settle...");
      await Bun.sleep(SETTLE_DELAY_SEC * 1000);

      const result = await collectResult(prNumber, reviewer, since);

      if (result.status === "pending") {
        // Not actionable yet (e.g., LGTM received but CI still running).
        // Update baseline and keep polling.
        baseline = current;
        continue;
      }

      // Actionable result — return to caller
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
  }

  // Timed out — collect final result anyway
  const result = await collectResult(prNumber, reviewer, since);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// create — create PR then poll
// ---------------------------------------------------------------------------

async function create(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      title: { type: "string" },
      body: { type: "string" },
      assignee: { type: "string", default: "nownabe" },
      reviewer: { type: "string", default: "nownabe" },
      labels: { type: "string" },
      draft: { type: "boolean", default: false },
      base: { type: "string" },
    },
  });

  if (!values.title || !values.body) {
    console.error("Error: --title and --body are required");
    process.exit(1);
  }

  const ghArgs = [
    "pr",
    "create",
    "--title",
    values.title,
    "--body",
    values.body,
    "--assignee",
    values.assignee!,
  ];

  if (values.labels) {
    ghArgs.push("--label", values.labels);
  }
  if (values.draft) {
    ghArgs.push("--draft");
  }
  if (values.base) {
    ghArgs.push("--base", values.base);
  }

  const result = await gh(...ghArgs);

  if (result.exitCode !== 0) {
    console.error(`Failed to create PR: ${result.stderr}`);
    process.exit(1);
  }

  const url = result.stdout;
  const number = url.split("/").pop()!;
  const since = new Date();

  console.error(`PR created: ${url}`);
  console.error(`Polling PR #${number} every ${POLL_INTERVAL_SEC}s (max ${MAX_POLLS} checks)...`);

  await pollLoop(number, values.reviewer!, since);
}

// ---------------------------------------------------------------------------
// wait — resume polling an existing PR
// ---------------------------------------------------------------------------

async function wait(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      reviewer: { type: "string", default: "nownabe" },
      since: { type: "string" },
    },
    allowPositionals: true,
  });

  const prNumber = positionals[0];
  if (!prNumber) {
    console.error("Error: PR number is required");
    process.exit(1);
  }

  const since = values.since ? new Date(values.since) : null;

  console.error(`Polling PR #${prNumber} every ${POLL_INTERVAL_SEC}s (max ${MAX_POLLS} checks)...`);

  await pollLoop(prNumber, values.reviewer!, since);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const [subcommand, ...rest] = process.argv.slice(2);

switch (subcommand) {
  case "create":
    await create(rest);
    break;
  case "wait":
    await wait(rest);
    break;
  default:
    console.error(`Usage:
  bun run tools/create-pr-and-wait.ts create --title <title> --body <body> [--assignee <user>] [--reviewer <user>] [--labels <l1,l2>] [--draft] [--base <branch>]
  bun run tools/create-pr-and-wait.ts wait <pr-number> [--reviewer <user>] [--since <iso-timestamp>]

Subcommands:
  create   Create a PR then poll until CI passes and LGTM is received.
           Options: --title, --body, --assignee, --reviewer, --labels, --draft, --base
  wait     Resume polling an existing PR (use after fixing issues).

Both subcommands poll every ${POLL_INTERVAL_SEC}s (up to ${MAX_POLLS} times) and exit when
an actionable state is reached.

The JSON output includes a "status" field: approved, ci_failed, has_feedback, or pending.
Exit code is always 0 on success. Non-zero only on errors.`);
    process.exit(1);
}
