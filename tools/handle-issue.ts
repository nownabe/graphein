#!/usr/bin/env bun
/**
 * handle-issue: Orchestrate handling a GitHub issue end-to-end.
 *
 * Usage:
 *   bun run tools/handle-issue.ts <issue-number-or-url>
 *
 * This script controls the workflow deterministically:
 *   1. Spawn claude CLI in a worktree to implement the issue and create a PR
 *   2. Wait for CI/review (tools/wait-pr.ts)
 *   3. If fixes needed, resume claude CLI to fix
 *   4. Repeat 2-3 until approved or max retries
 *
 * The claude CLI uses all existing project assets (CLAUDE.md, hooks, skills, etc).
 */

const MAX_FIX_ROUNDS = 5;

const issueRef = process.argv[2];
if (!issueRef) {
  console.error("Usage: bun run tools/handle-issue.ts <issue-number-or-url>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function run(
  cmd: string[],
  opts?: { timeout?: number },
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "inherit",
    timeout: opts?.timeout,
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout: stdout.trim(), exitCode };
}

function extractPrUrl(text: string): string | null {
  const match = text.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
  return match ? match[0] : null;
}

function extractPrNumber(url: string): string {
  return url.split("/").pop()!;
}

// ---------------------------------------------------------------------------
// Phase 1: Implement and create PR
// ---------------------------------------------------------------------------

console.log(`\n📋 Implementing issue: ${issueRef}`);

const implementResult = await run(
  [
    "claude",
    "-p",
    `Handle issue ${issueRef}\n\nIMPORTANT: When creating the PR (step 5 of /pr skill), use subagent mode:\nonly run \`gh pr create\`, do NOT run wait-pr.ts. Return the PR URL at the end of your response.`,
    "-w",
    "--permission-mode",
    "bypassPermissions",
    "--output-format",
    "text",
  ],
  { timeout: 600_000 },
);

if (implementResult.exitCode !== 0) {
  console.error("❌ Implementation failed");
  process.exit(1);
}

const prUrl = extractPrUrl(implementResult.stdout);
if (!prUrl) {
  console.error("❌ Could not find PR URL in output");
  console.error("Output (last 500 chars):", implementResult.stdout.slice(-500));
  process.exit(1);
}

const prNumber = extractPrNumber(prUrl);
console.log(`\n✅ PR created: ${prUrl}`);

// ---------------------------------------------------------------------------
// Phase 2-3: Wait and fix loop
// ---------------------------------------------------------------------------

for (let round = 1; round <= MAX_FIX_ROUNDS; round++) {
  console.log(`\n⏳ Waiting for CI/review (round ${round}/${MAX_FIX_ROUNDS})...`);

  const waitResult = await run(["bun", "run", "tools/wait-pr.ts", prNumber], { timeout: 600_000 });

  if (waitResult.exitCode !== 0) {
    console.error("❌ wait-pr.ts failed");
    process.exit(1);
  }

  let status: any;
  try {
    status = JSON.parse(waitResult.stdout);
  } catch {
    console.error("❌ Failed to parse wait-pr.ts output");
    process.exit(1);
  }

  console.log(`   Status: ${status.status}`);

  if (status.status === "approved") {
    console.log(`\n🎉 PR approved: ${prUrl}`);
    process.exit(0);
  }

  if (status.status === "merged") {
    console.log(`\n🎉 PR merged: ${prUrl}`);
    process.exit(0);
  }

  if (status.status === "closed") {
    console.log(`\n⚠️  PR was closed: ${prUrl}`);
    process.exit(0);
  }

  if (status.status === "pending") {
    // Still waiting — loop again
    continue;
  }

  // ci_failed or has_feedback — fix it
  if (status.status === "ci_failed") {
    console.log(`\n🔧 CI failed. Fixing (round ${round})...`);
  } else {
    console.log(`\n💬 Review feedback received. Addressing (round ${round})...`);
  }

  const fixPrompt =
    status.status === "ci_failed"
      ? `The PR ${prUrl} has CI failures. Fix them.\n\nCI result JSON:\n${JSON.stringify(status, null, 2)}\n\nSteps:\n1. Extract the run ID from failed check URLs (format: .../actions/runs/<run-id>/...)\n2. Get failure details: bunx @nownabe/claude-tools gh list-run-jobs <run-id> and bunx @nownabe/claude-tools gh get-job-logs <job-id>\n3. Fix the issues\n4. Run bun run check:all\n5. Commit and push (git push)`
      : `The PR ${prUrl} has review feedback. Address it.\n\nFeedback JSON:\n${JSON.stringify(status, null, 2)}\n\nSteps:\n1. Read each feedback item (check path and line fields for review_comments)\n2. Make the appropriate code changes\n3. Run bun run check:all\n4. Commit and push (git push)`;

  // TODO: use -c to continue the same session for context retention
  const fixResult = await run(
    [
      "claude",
      "-p",
      fixPrompt,
      "--permission-mode",
      "bypassPermissions",
      "--output-format",
      "text",
    ],
    { timeout: 600_000 },
  );

  if (fixResult.exitCode !== 0) {
    console.error(`❌ Fix round ${round} failed`);
    process.exit(1);
  }

  console.log(`   Fix round ${round} complete. Re-checking...`);
}

console.error(
  `\n⚠️  Did not converge after ${MAX_FIX_ROUNDS} fix rounds. Manual intervention needed.`,
);
console.error(`   PR: ${prUrl}`);
process.exit(1);
