---
name: handle-issue
description: >-
  Handle a GitHub Issue end-to-end in an isolated worktree.
  Use when the user specifies a GitHub Issue number or URL to work on.
disable-model-invocation: false
allowed-tools:
  - Agent
  - SendMessage
  - Bash
argument-hint: "<issue number or URL>"
---

# Handle Issue — Multi-Phase Orchestrator

This skill orchestrates handling a GitHub issue across multiple phases, providing visibility to the user between long-running steps. A subagent handles implementation in an isolated worktree. The orchestrator runs `wait-pr.ts` directly (no worktree needed) and only delegates back to the subagent for code fixes.

## Phase 1: Implement and Create PR

Spawn a **named** `issue-handler` agent in an isolated worktree.

Use the `Agent` tool with the following parameters:

- `subagent_type`: `"issue-handler"`
- `isolation`: `"worktree"`
- `name`: `"issue-handler"`
- `prompt`:

  ```
  Handle issue $ARGUMENTS

  IMPORTANT: When creating the PR (step 5 of /pr skill), use subagent mode:
  only run `gh pr create`, do NOT run wait-pr.ts. The parent orchestrator
  handles the wait loop. Return the PR URL in your response.
  ```

- `description`: `"Implement issue $ARGUMENTS"`

## Phase 2: Notify User and Wait for CI/Review

After the agent returns:

1. **Parse the PR info** from the agent's response (look for the PR URL like `https://github.com/.../pull/123` and extract the number from the path).

2. **Notify the user** by outputting a message:

   ```
   PR created: <url>
   Waiting for CI checks and review...
   ```

3. **Run `wait-pr.ts` directly** from the orchestrator using the `Bash` tool (set timeout to 600000ms):

   ```bash
   bun run tools/wait-pr.ts <pr-number>
   ```

   This does NOT require worktree access, so run it directly — do not delegate to the subagent.

4. **Handle the result** based on the `status` field in the JSON output:
   - **`approved`**: Notify user "PR approved!" with the URL. Done.
   - **`merged`**: Notify user "PR merged!" with the URL. Done.
   - **`closed`**: Notify user "PR was closed." Done.
   - **`ci_failed`** or **`has_feedback`**: Proceed to Phase 3.
   - **`pending`**: Notify user "Still waiting for CI/review..." and run `wait-pr.ts` again (repeat this step).

## Phase 3: Fix Issues

If CI failed or review feedback was received:

1. **Notify the user** what happened:
   - For `ci_failed`: "CI failed on PR #N. Fixing..."
   - For `has_feedback`: "Review feedback received on PR #N. Addressing..."

2. **Send fix instructions to the subagent** via `SendMessage`:

   For CI failures:

   ```
   to: "issue-handler"
   message: "The PR has CI failures. Fix them.

   CI result JSON:
   <paste full JSON>

   Steps:
   1. Extract the run ID from failed check URLs (format: .../actions/runs/<run-id>/...)
   2. Get failure details: bunx @nownabe/claude-tools gh list-run-jobs <run-id> and bunx @nownabe/claude-tools gh get-job-logs <job-id>
   3. Fix the issues
   4. Run bun run check:all
   5. Commit and push (git push)"
   ```

   For review feedback:

   ```
   to: "issue-handler"
   message: "The PR has review feedback. Address it.

   Feedback JSON:
   <paste full JSON>

   Steps:
   1. Read each feedback item (check path and line fields for review_comments)
   2. Make the appropriate code changes
   3. Run bun run check:all
   4. Commit and push (git push)"
   ```

3. **If `SendMessage` fails or the agent does not respond**, re-spawn a new agent in the **same worktree** to apply fixes. Use the `Agent` tool with:
   - `subagent_type`: `"issue-handler"`
   - `isolation`: `"worktree"`
   - `prompt`: Include the full fix instructions (same as the `SendMessage` content above), plus:

     ```
     The previous agent became unresponsive. You are resuming work in an
     existing worktree. The branch is already checked out and the PR already
     exists. Your job is ONLY to fix the issues described below, run
     bun run check:all, commit, and push.
     ```

   - `description`: `"Fix CI/review issues for PR #<number>"`

4. After the agent responds (via either path), **go back to Phase 2** (run `wait-pr.ts` again).

## Important Notes

- **Run `wait-pr.ts` directly** from the orchestrator (via `Bash`), not via the subagent. It only calls GitHub APIs and does not need worktree access.
- Always notify the user BEFORE sending a message to the agent, so they know what's happening.
- Use `SendMessage` first to resume the existing agent; only re-spawn if it fails or times out.
- Repeat Phase 2 <-> Phase 3 until the PR reaches `approved`, `merged`, or `closed` status.
- If the loop does not converge after 5 iterations of Phase 3, STOP and inform the user.
