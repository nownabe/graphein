# 20260418-feat-kudos-shortcut-v2

## Context

Add `add_kudos` Slack message shortcut as a manual fallback when automatic kudos event processing fails. Includes shortcut handler, modal submission handler, i18n messages (ja/en), and manifest generator update.

Issue: N/A

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [3a1284f](https://github.com/nownabe/graphein/commit/3a1284f6dbd7f507c72739a265dc367c7748d22e)

1. **Deactivated author leaves modal stuck in loading state** (`src/slack/bolt.ts`, line 954-957): When `author.deactivatedAt != null`, the handler returns early without updating the modal view. The user already sees a "Processing..." loading modal from the `ack()` response. This leaves the modal permanently stuck. Either update the modal with an informational message before returning, or remove the early return and let the flow continue (it will naturally produce zero resolved entries).

2. **Success modal shown even when no kudos were created** (`src/slack/bolt.ts`, lines 1067-1120): When `resolvedEntries.length` is 0 (e.g., all mentioned users are deactivated or unresolvable), the `if (resolvedEntries.length > 0)` block is skipped but execution falls through to the "success" modal at line 1108. The user sees "Kudos added successfully" when nothing was actually persisted. Add an `else` branch (or restructure the flow) to show an appropriate message when no entries could be resolved.

#### Fix

Fixed files:

- src/slack/bolt.ts

1. Deactivated author now updates modal with `noEntries` message before returning, instead of leaving modal stuck in loading state.
2. Moved success modal inside the `resolvedEntries.length > 0` block and added an `else` branch showing `noEntries` message when no entries could be resolved.

### Round 2

#### Review

Status: NEEDS_FIX
Reviewed commit: [f3ce66f](https://github.com/nownabe/graphein/commit/f3ce66f928fab7523e6e021a419738f6fbed8026)

1. **Success modal shown on duplicate race condition** (`src/slack/bolt.ts`, lines 1104-1137): When `createKudos` returns `null` (because `onConflictDoNothing` triggered due to a concurrent insert from the automatic event handler), the `if (created)` block at line 1104 is skipped but execution falls through to the success modal at line 1122. The user sees "Kudos added successfully" even though nothing was persisted. Move the success modal (lines 1122-1137) inside the `if (created)` block and add an `else` branch that shows the `slack.kudos.duplicate` message.

#### Fix

Fixed files:

- src/slack/bolt.ts

Moved success modal inside the `if (created)` block and added an `else` branch showing `slack.kudos.duplicate` message when `createKudos` returns null due to race condition.

### Round 3

#### Review

Status: APPROVED
Reviewed commit: [8b88ac4](https://github.com/nownabe/graphein/commit/8b88ac4118ab0e44d6c58b7708849561b306f491)

All issues from rounds 1 and 2 have been properly addressed. The shortcut handler now correctly handles every edge case: deactivated author updates the modal instead of leaving it stuck, zero resolved entries shows a `noEntries` message instead of false success, and the duplicate race condition shows a `duplicate` message. Error handling wraps the entire flow with a catch that updates the modal. The i18n messages are complete for both locales. The manifest generator update correctly includes the new shortcut. No remaining issues.
