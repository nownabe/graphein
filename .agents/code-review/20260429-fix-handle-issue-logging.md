# 20260429-fix-handle-issue-logging

## Context

Issue: N/A

### Background

The `bin/handle-issue` script silently loses log output when a subprocess is killed by timeout (exit code 143/SIGTERM). The `implement.log` file is never created because a guard clause skips writing when stdout/stderr are empty. Additionally, `logLine` calls fire-and-forget async writes that can be lost on process exit.

### Summary

Fix handle-issue logging: always write log files (even on empty output), await all log writes, and increase implementation timeout from 10 min to 30 min.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [2f913a7](https://github.com/nownabe/graphein/commit/2f913a7ffca3e280d1ae16826c6ce7c00de36615)

All three changes are correct and address real bugs: awaiting `logLine` prevents lost writes on process exit, removing the `if (stdout || stderr)` guard ensures log files are always created (critical for debugging timeout kills), and the timeout increase to 30 minutes is reasonable for long-running implementation tasks.
