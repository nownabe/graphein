# 20260504-feat-handle-issue-session-info

## Context

Issue: N/A

### Background

When `bin/handle-issue` is running, there's no way to identify the claude process or session from the outside. This makes it difficult to monitor or debug long-running agent sessions.

### Summary

Print PID, session ID, and session file path to stdout for all claude CLI invocations in `bin/handle-issue`. For the initial implement phase, session detection is done via filesystem polling. For resume calls, session info is printed from known values.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [d811622](https://github.com/nownabe/graphein/commit/d81162279a98a199e6b87a2ac73ebad1a9d05237)

Changes are clean and well-structured. The session detection via filesystem polling is a reasonable approach for observability of long-running agent processes. No bugs, security issues, or logic errors found.
