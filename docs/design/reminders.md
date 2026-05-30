# Graphein Task Reminders

## Overview

Add a reminder system that proactively notifies task assignees about their
incomplete tasks via Slack DM, so tasks created from Slack messages don't get
forgotten over time (#327).

Today, an assignee only sees what they owe by visiting the web UI. There is no
push mechanism. Reminders close that gap with two kinds of nudges:

- **Deadline reminders** — fired as a task's `deadline` approaches, and again
  while it is overdue.
- **Periodic digest** — an optional recurring summary of a user's open assigned
  tasks.

Delivery is opt-out per user, every reminder links back to the task in both the
web UI and Slack, and the design fits Graphein's existing layered architecture
(`adapters` → `application` → `domain` / `infrastructure`).

## Goals

- Remind assignees of tasks with upcoming deadlines, before they are due
- Remind assignees of overdue tasks
- Offer an optional periodic digest of all open assigned tasks
- Deliver via Slack DM, linking back to the task (web + Slack permalink)
- Respect per-assignee completion (never remind someone already done)
- Let users opt out and configure timing
- Reuse the existing layers; no parallel business logic per transport
- Work correctly with a single instance and, optionally, multiple instances

## Non-Goals

- Reminders for owners who are not assignees
- Channels other than Slack DM (no email / web push) — matches #327
- Per-task custom reminder schedules (configuration is per user)
- Escalation or snooze workflows
- Reminders for archived tasks

---

## Architecture

Graphein currently has **no scheduler** — snippets and kudos are ingested
reactively from Slack events. Reminders need a periodic trigger. The app runs
as a single Bun process (`Bun.serve` in `src/index.ts`) and already wires a
`CacheStore` (Valkey, or in-memory fallback) via `createCache`.

### Trigger: in-process tick guarded by a cache lock

A lightweight scheduler runs inside the server process, started from the
composition root in `src/index.ts`:

```
src/index.ts
  └─ startReminderScheduler({ cache, reminderService, enabled })
        every REMINDER_TICK (default 15 min):
          1. acquire distributed lock via CacheStore (SET NX EX)  ← dedupes replicas
          2. if not acquired: skip this tick
          3. reminderService.runDue(now)
          4. release lock
```

The Valkey-backed lock (`SET reminders:lock <id> NX EX <ttl>`) means that even
if Graphein is scaled to multiple instances, only one runs a given tick — no
duplicate DMs. With the in-memory cache (single instance) the lock is trivially
held by that instance.

The 15-minute cadence is fixed; the *runner* decides who is "due now" based on
each user's local send hour, so preferences don't change the tick rate.

**Alternative — external scheduler:** expose an authenticated
`POST /internal/reminders/run` endpoint and drive it from cron / Cloud
Scheduler. Rejected as the default because it adds deployment surface (a secret,
external infra) that the project doesn't currently use, while Valkey is already
present. The endpoint can be added later for environments that prefer external
scheduling; `runDue` is the same entry point either way.

### Layering

| Layer | Responsibility | Path |
| --- | --- | --- |
| `domain` | Pure scheduling policy: given a task/assignment/prefs/now, decide *which* reminder (if any) is due. No I/O. | `src/domain/reminders/policy.ts` |
| `application` | `reminderService`: load due candidates, apply policy, render messages, send, record delivery (idempotent). Also `reminderPreferenceService`. | `src/application/reminders/service.ts` |
| `infrastructure` | DB queries (Drizzle), Slack DM client wrapper. | `src/infrastructure/db/*`, `src/infrastructure/slack/*` |
| `adapters` | The tick starter in `index.ts`; preference read/write for Web, API, MCP; Block Kit formatting. | `src/adapters/*` |

Keeping the "is a reminder due?" decision in `domain` makes it directly unit
testable (the layered-architecture doc's explicit goal) and keeps `runDue`
deterministic given a `now`.

```
tick (adapter) → reminderService.runDue (application)
                     ├─ reminderPolicy.* (domain, pure)
                     ├─ reminderRepository (infrastructure: Postgres)
                     └─ slackDmClient (infrastructure: chat.postMessage)
```

---

## Reminder types

| Type | Trigger | Cadence | Recipient |
| --- | --- | --- | --- |
| **Deadline** | `tasks.deadline` within the lead window, or in the past | One "upcoming" nudge, then at most one "overdue" nudge per 24h | Each incomplete assignee |
| **Periodic digest** | User has ≥1 open assigned task and digest enabled | `daily` or `weekly`, at the user's local `sendHour` | The user, one combined DM |

Deadline reminders are per task per assignee; the digest batches all of a user's
open tasks into a single DM to limit noise.

---

## Database changes

### New table: `reminder_preferences`

Per-user preferences live in their own table rather than widening `users`,
keeping the identity row lean and the feature self-contained. Rows are created
lazily — a missing row means defaults.

```ts
// src/infrastructure/db/schema.ts
export const reminderPreferences = pgTable("reminder_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),                 // master opt-out
  deadlineEnabled: boolean("deadline_enabled").notNull().default(true),
  deadlineLeadHours: integer("deadline_lead_hours").notNull().default(24),
  digestFrequency: text("digest_frequency").notNull().default("daily"), // off|daily|weekly
  sendHour: integer("send_hour").notNull().default(9),                  // 0–23, local
  timezone: text("timezone").notNull().default("UTC"),                  // IANA, e.g. Asia/Tokyo
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### Altered table: `task_assignees`

Deadline reminders are per assignee, so delivery state lives on the assignment
row:

```ts
// added columns
lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
reminderStage: text("reminder_stage").notNull().default("none"), // none|upcoming|overdue
```

`reminderStage` records lifecycle progress so we send exactly one "upcoming"
nudge, then transition to throttled "overdue" nudges without repeating the
upcoming one. An index on `tasks.deadline` (partial: `WHERE archived = false`)
keeps the per-tick candidate scan cheap.

### Global toggle

The feature is gated by an admin setting stored in the existing `app_settings`
key-value store (same pattern as `SettingsService`), key `reminders_enabled`
(default `false` until rollout). Plus an env var `REMINDER_TICK_MINUTES`
(default `15`) for the tick cadence.

### Timezone

`users` has no timezone column today, and `APP_TIMEZONE` is app-wide. Reminders
need *per-user* local time so DMs land at a sensible hour. The `timezone` column
on `reminder_preferences` is populated from Slack's `users.info` (`tz` field) on
login / first preference write, defaulting to `APP_TIMEZONE`, and is editable in
the UI. Deadline math is done in UTC; only the *send moment* is localized.

Migration generated with `bun run db:generate`, applied with `bun run db:migrate`.

---

## Notification delivery

Reminders are sent as Slack DMs from the Graphein bot via `chat.postMessage`
with the user's `slackUserId` as the channel (Slack opens the IM
automatically). Content is localized with the existing `t(locale, key)` using
the recipient's `users.locale`. Messages use Block Kit so titles and links
render cleanly. Links use `BASE_URL` (from `env`) plus `slackPermalink` when
present.

**Deadline reminder (single task):**

```
:alarm_clock: Reminder: "<task title>" is due <relative, localized>.
Deadline: <deadline formatted in user's tz>
[ View task ]  ·  Open in Slack
   └ BASE_URL/tasks/:id        └ slackPermalink
```

Overdue uses `:warning:` and "was due …" phrasing.

**Periodic digest (multiple tasks):**

```
:wave: You have <n> open tasks:

• "<title>" — due <relative>      <view>
• "<title>" — no deadline         <view>
...
[ See all tasks → BASE_URL/ ]
```

Send failures are logged and skipped for that tick (not retried in-pass); the
next tick re-evaluates, and idempotency (below) prevents double-sends.

---

## Configuration

Per-user preferences are edited in the web UI (a new **Settings → Reminders**
section) and read/written via the API below.

| Setting | Values | Default |
| --- | --- | --- |
| Master switch | on / off | on |
| Deadline reminders | on / off | on |
| Lead time | hours before deadline | 24 |
| Digest frequency | off / daily / weekly | daily |
| Send hour | 0–23 (local) | 9 |
| Timezone | IANA tz | from Slack, else `APP_TIMEZONE` |

Admins control only the global on/off via `app_settings.reminders_enabled`.

---

## API changes

Following the AIP conventions in `docs/design/api.md`, reminder preferences are
a singleton sub-resource of the current user. Shared semantics live in
`reminderPreferenceService` (application layer) and are reused by Web, the JSON
API, and MCP.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/users/me/reminderPreferences` | Read current user's preferences (returns defaults if unset) |
| `PATCH` | `/api/v1/users/me/reminderPreferences` | Partial update of preferences |

Response shape:

```json
{
  "enabled": true,
  "deadlineEnabled": true,
  "deadlineLeadHours": 24,
  "digestFrequency": "daily",
  "sendHour": 9,
  "timezone": "Asia/Tokyo",
  "updatedAt": "2026-05-30T01:00:00Z"
}
```

Validation (422 `validation_error`): `deadlineLeadHours` ≥ 0, `sendHour` 0–23,
`digestFrequency` ∈ {off, daily, weekly}, `timezone` a valid IANA zone.

No public endpoint triggers reminders — the in-process tick owns that. (If the
external-scheduler alternative is adopted later, it adds one internal,
secret-authenticated `POST /internal/reminders/run`.)

---

## Runner logic

```
runDue(now):
  if not app_settings.reminders_enabled: return

  # Deadline reminders — per incomplete assignment of a non-archived task with a deadline
  for assignment in candidateAssignments(now):     # done=false, archived=false, deadline not null
    prefs = preferences(assignment.userId)          # or defaults
    if not (prefs.enabled and prefs.deadlineEnabled): continue
    decision = reminderPolicy.deadlineDecision(assignment, task, prefs, now)
    switch decision:
      "upcoming":  send upcoming DM; stage=upcoming; lastRemindedAt=now
      "overdue":   send overdue DM;  stage=overdue;  lastRemindedAt=now
      "none":      skip

  # Periodic digest — per user
  for user in usersWithDigestDue(now):              # frequency != off, localHour==sendHour, due since lastDigestAt
    prefs = preferences(user.id)
    if not prefs.enabled: continue
    tasks = openAssignedTasks(user.id)
    if tasks: send digest DM; lastDigestAt=now
```

`reminderPolicy.deadlineDecision` (domain, pure):

- `now ≥ deadline` and (`stage != overdue` or `lastRemindedAt` older than 24h) → `overdue`
- `0 < deadline − now ≤ leadHours` and `stage == none` → `upcoming`
- otherwise → `none`

### Idempotency

`lastRemindedAt` / `reminderStage` (per assignment) and `lastDigestAt` (per
user) gate every send, so overlapping or retried ticks never spam. Combined
with the cache lock, at-most-one delivery per logical event holds across
restarts and replicas.

---

## Edge cases

| Case | Handling |
| --- | --- |
| Task has no deadline | No deadline reminder; still appears in the digest |
| Multiple assignees | Sent to each *incomplete* assignee independently; each has its own `lastRemindedAt` / `reminderStage` |
| Some assignees done, others not | Done assignees skipped (per-assignee `done`); others still reminded |
| Task archived | Excluded from candidate selection — no reminder |
| Deadline edited | `reminderStage` reset to `none` on deadline change so the new window re-triggers an upcoming nudge |
| User opted out (`enabled=false`) | Skipped entirely, both types |
| Deactivated user (`users.deactivatedAt`) | Skipped |
| No open IM with bot | `chat.postMessage` to the user ID opens the IM; transient failures logged, retried next tick |
| Unknown timezone | Falls back to `APP_TIMEZONE` |
| Chronically overdue | Throttled to one DM per 24h until done or archived |
| Multiple instances | Cache lock ensures one tick runs; DB gating ensures no double-send |
| DST transitions | Local hour computed from the IANA zone at send time, so the tz library handles DST |
| Tick missed (downtime) | Next tick catches up; deadline gating is window/stage-based, digest gating is "due since `lastDigestAt`" |

---

## Implementation structure

```
src/
  domain/
    reminders/
      policy.ts          # pure: deadlineDecision, isDigestDue, localHour
      policy.test.ts
  application/
    reminders/
      service.ts         # runDue, preference read/write use-cases
  infrastructure/
    db/
      schema.ts          # + reminder_preferences, task_assignees columns
    slack/
      dm.ts              # chat.postMessage DM wrapper + Block Kit builders
  adapters/
    reminders/
      scheduler.ts       # startReminderScheduler (tick + cache lock), called from index.ts
    api/
      reminder-preferences.ts   # GET/PATCH /api/v1/users/me/reminderPreferences
    web/
      settings/                 # Reminders settings UI
```

---

## Open questions

- Should owners (not just assignees) optionally get a progress summary of their
  tasks?
- Add a Block Kit "snooze 1 day" button on the DM? (Non-goal for v1, but cheap
  later via the existing Slack interaction handler.)
- Should the digest include tasks the user *owns* but isn't assigned to?
- Per-task mute for one noisy task — worth the extra config?
