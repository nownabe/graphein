# 20260427-chore-handle-issue-logging

## Context

Issue: N/A

### Background

The `bin/handle-issue` script orchestrates GitHub issue handling end-to-end. When the script fails, there was no way to investigate the root cause because stdout was captured (piped) but discarded on failure, and stderr was inherited but not preserved. This change adds structured per-issue logging so failures can be diagnosed after the fact.

### Summary

Add per-issue structured logging to `bin/handle-issue`. Logs are written to `logs/issue-<N>/` with separate files per phase (orchestrator, implement, codex-review, fix rounds, wait-pr). All stdout/stderr from spawned processes are captured and persisted. Error messages now point to the specific log file.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [71b0427](https://github.com/nownabe/graphein/commit/71b0427ac53383ecbdf34675aeb6b0f59bea74d5)

1. **Missing header when only stderr is present** (`bin/handle-issue`, line 94-96): When `stdout` is empty but `stderr` is not, the header (timestamp, command, exit code) is skipped and only `--- stderr ---\n...` is written. This means stderr-only entries have no context about which command produced them. Fix: always write the header when there is any output (stdout or stderr).

   ```typescript
   // Current (broken):
   if (stdout) await writeLog(logType, `${header}--- stdout ---\n${stdout}\n`);
   if (stderr) await writeLog(logType, `--- stderr ---\n${stderr}\n`);

   // Suggested fix:
   if (stdout || stderr) {
     let entry = header;
     if (stdout) entry += `--- stdout ---\n${stdout}\n`;
     if (stderr) entry += `--- stderr ---\n${stderr}\n`;
     await writeLog(logType, entry);
   }
   ```

#### Fix

Fixed files:

- bin/handle-issue

Wrapped stdout/stderr writes in a single `if (stdout || stderr)` block so the header is always written when any output exists.
