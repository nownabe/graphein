---
name: handle-issue
description: >-
  Handle a GitHub Issue end-to-end in an isolated worktree.
  Use when the user specifies a GitHub Issue number or URL to work on.
disable-model-invocation: false
allowed-tools:
  - Agent
  - Bash
argument-hint: "<issue number or URL>"
---

# Handle Issue — Multi-Phase Orchestrator

This skill orchestrates handling a GitHub issue across multiple phases, providing visibility to the user between long-running steps.

## Phase 1: Implement and Create PR

Spawn an `issue-handler` agent in an isolated worktree to implement the change and create a PR **without waiting**.

Use the `Agent` tool with the following parameters:

- `subagent_type`: `"issue-handler"`
- `isolation`: `"worktree"`
- `prompt`: Include the issue reference AND instruct it to use subagent mode (create only, no wait):

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

3. **Run the wait loop**. Use Bash with a 600000ms timeout:

   ```bash
   bun run tools/wait-pr.ts <pr-number>
   ```

4. **Handle the result** based on the `status` field:
   - **`approved`**: Notify user "PR approved!" with the URL. Done.
   - **`merged`**: Notify user "PR merged!" with the URL. Done.
   - **`closed`**: Notify user "PR was closed." Done.
   - **`ci_failed`** or **`has_feedback`**: Proceed to Phase 3.
   - **`pending`**: Notify user "Still waiting for CI/review..." and run wait again (repeat this step).

## Phase 3: Fix Issues

If CI failed or review feedback was received:

1. **Notify the user** what happened:
   - For `ci_failed`: "CI failed. Fixing..."
   - For `has_feedback`: "Review feedback received. Addressing..."

2. **Spawn another `issue-handler` agent** to fix the issues. Use the SAME worktree path returned from Phase 1 (do NOT use `isolation: "worktree"` — the worktree already exists).
   - `subagent_type`: `"issue-handler"`
   - `prompt`: Include the full JSON result from the wait command and instructions:

     For CI failures:

     ```
     The PR at <url> has CI failures. Fix them.

     CI result JSON:
     <paste full JSON>

     Steps:
     1. Extract the run ID from failed check URLs (format: .../actions/runs/<run-id>/...)
     2. Get failure details: bunx @nownabe/claude-tools gh list-run-jobs <run-id> and bunx @nownabe/claude-tools gh get-job-logs <job-id>
     3. Fix the issues
     4. Run bun run check:all
     5. Commit and push (git push)

     Working directory: <worktree-path>
     ```

     For review feedback:

     ```
     The PR at <url> has review feedback. Address it.

     Feedback JSON:
     <paste full JSON>

     Steps:
     1. Read each feedback item (check path and line fields for review_comments)
     2. Make the appropriate code changes
     3. Run bun run check:all
     4. Commit and push (git push)

     Working directory: <worktree-path>
     ```

   - `description`: `"Fix CI/review issues for PR #<number>"`

3. After the fix agent returns, **go back to Phase 2** (notify user and wait again).

## Important Notes

- Always notify the user BEFORE starting a wait or fix phase, so they know what's happening.
- Repeat Phase 2 ↔ Phase 3 until the PR reaches `approved`, `merged`, or `closed` status.
- If the loop does not converge after 5 iterations of Phase 3, STOP and inform the user.
