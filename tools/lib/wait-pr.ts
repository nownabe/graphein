/**
 * wait-pr library: Poll a PR until CI passes and LGTM is received,
 * or an actionable state is reached.
 *
 * Status values:
 *   approved      LGTM received and all CI checks passed
 *   ci_failed     one or more CI checks failed
 *   has_feedback  review comments or PR comments to address
 *   merged        PR was merged
 *   closed        PR was closed without merging
 *   pending       nothing actionable yet (poll timed out, call again)
 */

const DEFAULT_POLL_INTERVAL_SEC = 30;
const DEFAULT_MAX_POLLS = 10;
const SETTLE_DELAY_SEC = 5;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function gh(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
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

export type Feedback = {
  type: "comment" | "review" | "review_comment";
  author: string;
  body: string;
  url: string;
  path?: string;
  line?: number;
};

export type WaitPrResult = {
  status: "approved" | "ci_failed" | "has_feedback" | "pending" | "merged" | "closed";
  lgtm: boolean;
  pr: { url: string; number: string };
  ci: {
    state: "pending" | "success" | "failure";
    failed: Array<{ name: string; url: string }>;
  };
  feedback: Feedback[];
};

export type WaitPrOptions = {
  prNumber: string;
  reviewer?: string;
  since?: Date;
  pollIntervalSec?: number;
  maxPolls?: number;
  /** Working directory for gh CLI commands (must be inside the target repo). */
  cwd?: string;
};

// ---------------------------------------------------------------------------
// snapshot — lightweight counts for change detection
// ---------------------------------------------------------------------------

type Snapshot = {
  prState: string;
  ciFinished: boolean;
  ciHasFail: boolean;
  commentCount: number;
  reviewCount: number;
  reviewCommentCount: number;
};

async function takeSnapshot(prNumber: string, since: Date, cwd?: string): Promise<Snapshot> {
  const [prViewRes, checksRes, commentsRes, reviewsRes, reviewCommentsRes] = await Promise.all([
    gh(["pr", "view", prNumber, "--json", "state", "--jq", ".state"], cwd),
    gh(["pr", "checks", prNumber, "--json", "state"], cwd),
    gh(["api", `repos/{owner}/{repo}/issues/${prNumber}/comments`], cwd),
    gh(["api", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`], cwd),
    gh(["api", `repos/{owner}/{repo}/pulls/${prNumber}/comments`], cwd),
  ]);

  const prState = prViewRes.exitCode === 0 ? prViewRes.stdout : "OPEN";

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
  const isAfterSince = (dateStr: string) => new Date(dateStr) > since;

  const comments =
    (commentsRes.exitCode === 0 ? (tryParseJson(commentsRes.stdout) as any[]) : null) ?? [];
  const reviews =
    (reviewsRes.exitCode === 0 ? (tryParseJson(reviewsRes.stdout) as any[]) : null) ?? [];
  const reviewComments =
    (reviewCommentsRes.exitCode === 0 ? (tryParseJson(reviewCommentsRes.stdout) as any[]) : null) ??
    [];

  return {
    prState,
    ciFinished,
    ciHasFail,
    commentCount: comments.filter((c: any) => isAfterSince(c.created_at)).length,
    reviewCount: reviews.filter((r: any) => isAfterSince(r.submitted_at)).length,
    reviewCommentCount: reviewComments.filter((rc: any) => isAfterSince(rc.created_at)).length,
  };
}

function snapshotChanged(prev: Snapshot, curr: Snapshot): boolean {
  return (
    curr.prState !== prev.prState ||
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
  since: Date,
  cwd?: string,
): Promise<WaitPrResult> {
  const [checksRes, commentsRes, reviewsRes, reviewCommentsRes, prViewRes] = await Promise.all([
    gh(["pr", "checks", prNumber, "--json", "name,state,link"], cwd),
    gh(["api", `repos/{owner}/{repo}/issues/${prNumber}/comments`], cwd),
    gh(["api", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`], cwd),
    gh(["api", `repos/{owner}/{repo}/pulls/${prNumber}/comments`], cwd),
    gh(["pr", "view", prNumber, "--json", "url,state"], cwd),
  ]);

  let prUrl = "";
  let prState = "OPEN";
  if (prViewRes.exitCode === 0 && prViewRes.stdout) {
    const prData = tryParseJson(prViewRes.stdout) as { url?: string; state?: string } | null;
    prUrl = prData?.url ?? "";
    prState = prData?.state ?? "OPEN";
  }

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

  // --- LGTM detection (filtered by since) ---
  const isAfterSince = (dateStr: string) => new Date(dateStr) > since;

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

  // --- Feedback (filtered by since) ---
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
  let status: WaitPrResult["status"];

  if (prState === "MERGED") {
    status = "merged";
  } else if (prState === "CLOSED") {
    status = "closed";
  } else if (lgtm && ciState === "success") {
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
// waitPr — poll loop, returns result instead of exiting
// ---------------------------------------------------------------------------

export async function waitPr(options: WaitPrOptions): Promise<WaitPrResult> {
  const {
    prNumber,
    reviewer = "nownabe",
    since = new Date(),
    pollIntervalSec = DEFAULT_POLL_INTERVAL_SEC,
    maxPolls = DEFAULT_MAX_POLLS,
    cwd,
  } = options;

  // Take initial snapshot as baseline
  let baseline = await takeSnapshot(prNumber, since, cwd);

  for (let i = 0; i < maxPolls; i++) {
    await Bun.sleep(pollIntervalSec * 1000);

    const current = await takeSnapshot(prNumber, since, cwd);

    if (snapshotChanged(baseline, current)) {
      // Change detected — wait for related data to settle before collecting
      process.stderr.write("\r\x1b[KChange detected, waiting for data to settle...\n");
      await Bun.sleep(SETTLE_DELAY_SEC * 1000);

      const result = await collectResult(prNumber, reviewer, since, cwd);

      if (result.status === "pending") {
        // Not actionable yet (e.g., LGTM received but CI still running).
        // Update baseline and keep polling.
        baseline = current;
        continue;
      }

      return result;
    }
  }

  // Timed out — collect final result anyway
  return collectResult(prNumber, reviewer, since, cwd);
}
