# Graphein Task Reminders

## Overview

Add a reminder system that proactively notifies task assignees about their
incomplete tasks via Slack DM, so tasks created from Slack messages don't get
forgotten over time (#327).

Today, an assignee only sees what they owe by visiting the web UI. There is no
push mechanism. Reminders close that gap with three kinds of nudges:

- **Deadline reminders** — fired automatically as a task's `deadline`
  approaches, and again while it is overdue.
- **Periodic digest** — an optional automatic recurring summary of a user's open
  assigned tasks.
- **Manual admin reminders** — an admin/owner can, at any time, send a custom
  message to all incomplete assignees of a task (or a selected subset).

Automatic delivery is opt-out per user, every reminder links back to the task in
both the web UI and Slack, and the design fits Graphein's existing layered
architecture (`adapters` → `application` → `domain` / `infrastructure`).

## Goals

- Remind assignees of tasks with upcoming deadlines, before they are due
- Remind assignees of overdue tasks
- Offer an optional periodic digest of all open assigned tasks
- Let an admin/owner manually send a reminder, with a custom message, to all
  incomplete assignees or a chosen subset, at any time
- Deliver via Slack DM, linking back to the task (web + Slack permalink)
- Respect per-assignee completion (never auto-remind someone already done)
- Support **both** an in-process scheduler and an external scheduler
  (cron / Cloud Scheduler), selectable by configuration
- Let users opt out of automatic reminders and configure timing
- Reuse the existing layers; no parallel business logic per transport

## Non-Goals

- Reminders for owners who are not assignees (automatic path)
- Channels other than Slack DM (no email / web push) — matches #327
- Per-task custom reminder schedules (automatic configuration is per user)
- Escalation or snooze workflows
- Reminders for archived tasks
- A JSON API for editing reminder preferences (managed in the web UI only)

---

## Architecture

Graphein currently has **no scheduler** — snippets and kudos are ingested
reactively from Slack events. Automatic reminders need a periodic trigger. The
app runs as a Bun process (`Bun.serve` in `src/index.ts`) and already wires a
`CacheStore` (Valkey, or in-memory fallback).

Whatever the trigger, the actual work is a single application-layer entry point:

```ts
// src/application/reminders/service.ts
reminderService.runDue(now: Date): Promise<RunSummary>
```

`runDue` is pure-ish orchestration: it loads due candidates, applies the domain
policy, sends DMs, and records delivery idempotently. Both schedulers below call
exactly this function, so the scheduling mechanism is fully decoupled from the
reminder logic.

### Both schedulers are supported

The trigger is selected by the `REMINDER_SCHEDULER` env var:

| Value | Behavior |
| --- | --- |
| `internal` (default) | In-process tick drives `runDue` on an interval |
| `external` | In-process tick is **off**; the HTTP endpoint drives `runDue` |
| `off` | Neither runs (automatic reminders disabled; manual admin sends still work) |

The internal endpoint is **always mounted** regardless of mode (it is harmless
when unused and simplifies testing), but only does work when called with a valid
secret.

#### Internal tick (`REMINDER_SCHEDULER=internal`)

A lightweight scheduler runs inside the server process, started from the
composition root in `src/index.ts`:

```
src/index.ts
  └─ startReminderScheduler({ cache, reminderService, mode, tickMinutes })
        every REMINDER_TICK_MINUTES (default 15):
          1. acquire distributed lock via CacheStore  ← dedupes replicas
          2. if not acquired: skip this tick
          3. reminderService.runDue(now)
          4. release lock (delete the key)
```

The lock reuses the existing `CacheStore` atomic primitive:
`increment("reminders:lock:<tickBucket>", ttlMs)` returns `1` only for the first
caller in that bucket (the TTL is set on creation), so exactly one instance wins
the tick. This means that even if Graphein is scaled to multiple instances, only
one runs a given tick — no duplicate DMs. With the in-memory cache (single
instance) the lock is trivially held by that instance.

Best for: single-container / always-on deployments where you don't want extra
infrastructure. Requires no external pieces; Valkey is only needed for the lock
when running multiple replicas.

#### External scheduler (`REMINDER_SCHEDULER=external`)

For serverless or scale-to-zero deployments (e.g. Cloud Run + Cloud Scheduler,
or a Kubernetes `CronJob`, or plain `cron` + `curl`), an external scheduler
POSTs to an authenticated endpoint on a fixed cadence:

```
Cloud Scheduler / cron / k8s CronJob
        │  POST /internal/reminders/run     (e.g. every 15 min)
        │  Header: Authorization: Bearer <REMINDER_RUNNER_SECRET>
        ▼
  reminder runner route (adapter) → reminderService.runDue(now)
        └─ returns 200 { summary } | 401 | 409 (already running)
```

- Auth: a shared secret in `REMINDER_RUNNER_SECRET`, checked by a tiny
  middleware. The route is **excluded from `authMiddleware`** (no user session)
  and is not part of the public `/api/v1` surface.
- Concurrency: the same `CacheStore` lock is taken inside `runDue` so overlapping
  external invocations (or an external scheduler plus a stray internal tick)
  never double-send; a second concurrent call returns `409`.
- Response: a small JSON summary (`{ deadlineSent, digestSent, skipped }`) for
  scheduler logs/observability.

Best for: environments that already centralize scheduling, or where the app may
be scaled to zero between ticks.

> Because both modes funnel through `runDue` + the same lock, switching modes is
> a config change only; no behavioral difference in what gets sent.

### Layering

| Layer | Responsibility | Path |
| --- | --- | --- |
| `domain` | Pure scheduling policy: given a task/assignment/prefs/now, decide *which* reminder (if any) is due. No I/O. | `src/domain/reminders/policy.ts` |
| `application` | `reminderService`: `runDue` (automatic) and `sendManualReminder` (admin) use-cases — load candidates, apply policy, render, send, record delivery. | `src/application/reminders/service.ts` |
| `infrastructure` | DB queries (Drizzle), Slack DM client wrapper. | `src/infrastructure/db/*`, `src/infrastructure/slack/*` |
| `adapters` | The tick starter + the `/internal/reminders/run` route (both in `index.ts`/Hono); admin manual-send route (Web/API/MCP); Block Kit formatting. | `src/adapters/*` |

Keeping the "is a reminder due?" decision in `domain` makes it directly unit
testable (the layered-architecture doc's explicit goal) and keeps `runDue`
deterministic given a `now`.

```
trigger (internal tick OR external POST)
      → reminderService.runDue (application)
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
| **Manual admin** | An admin/owner triggers it explicitly | Ad-hoc, on demand | Selected incomplete assignees (default: all incomplete) |

Deadline reminders are per task per assignee; the digest batches all of a user's
open tasks into a single DM to limit noise; manual reminders are a deliberate,
on-demand push (see below).

---

## Manual admin reminders

An admin (or a task owner) can push a reminder for a specific task at any time,
with a custom message, to either **all incomplete assignees** or a **chosen
subset** of them.

### Behavior

- Recipient set defaults to every assignee with `done = false`. The caller may
  pass an explicit `userIds` list, which must be a subset of the task's
  incomplete assignees; unknown or already-done users are rejected with a
  validation error.
- The custom `message` is included in the DM, above the standard task link block.
  If omitted, a default localized body is used.
- Manual sends are an explicit human action, so they **bypass automatic
  throttling and per-user opt-out** (`reminderPreferences.enabled`) — an admin
  asking everyone to finish a task should reach them. Deactivated users
  (`users.deactivatedAt`) are still skipped.
- Manual sends **do not** update `lastRemindedAt` / `reminderStage`; those track
  the automatic deadline lifecycle only, and a manual nudge shouldn't suppress
  the next automatic one.
- Archived tasks cannot be the target (returns `not_found`/validation error).

### Authorization

Mirrors the existing task-action model (`/api/v1/tasks/owned/:id/archive`):

| Effective role | Scope |
| --- | --- |
| `user` | Only if the user is an owner of the task |
| `admin` | Any task |

### Message shape

```
:mega: <sender display name> sent a reminder:
> <custom message>

Task: "<title>"  (due <relative> | no deadline)
[ View task → BASE_URL/tasks/:id ]  ·  Open in Slack
```

### Entry point

```ts
// src/application/reminders/service.ts
sendManualReminder(input: {
  taskId: string;
  actorUserId: string;          // for authz + "sent by" label
  message?: string;
  userIds?: string[];           // default: all incomplete assignees
}): Promise<{ ok: true; sentTo: string[] }
          | { ok: false; error: "not_found" | "forbidden" | "no_recipients" | "invalid_recipients" }>
```

Surfaced through Web, API, and MCP (see API changes).

---

## Database changes

### New table: `reminder_preferences`

Per-user preferences live in their own table rather than widening `users`,
keeping the identity row lean and the feature self-contained. Rows are created
lazily — a missing row means defaults. Preferences are edited **only in the web
UI** (no JSON API).

```ts
// src/infrastructure/db/schema.ts
export const reminderPreferences = pgTable("reminder_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),                 // master opt-out (automatic only)
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

Automatic deadline reminders are per assignee, so delivery state lives on the
assignment row:

```ts
// added columns
lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
reminderStage: text("reminder_stage").notNull().default("none"), // none|upcoming|overdue
```

`reminderStage` records lifecycle progress so we send exactly one "upcoming"
nudge, then transition to throttled "overdue" nudges without repeating the
upcoming one. An index on `tasks.deadline` (partial: `WHERE archived = false`)
keeps the per-tick candidate scan cheap.

### Global toggle and env

| Setting | Where | Default | Purpose |
| --- | --- | --- | --- |
| `reminders_enabled` | `app_settings` (admin UI) | `false` | Master switch for automatic reminders |
| `REMINDER_SCHEDULER` | env | `internal` | `internal` \| `external` \| `off` |
| `REMINDER_TICK_MINUTES` | env | `15` | Internal tick cadence |
| `REMINDER_RUNNER_SECRET` | env | — | Bearer secret for `POST /internal/reminders/run` (required when `external`) |

Manual admin reminders are **not** gated by `reminders_enabled` — they are an
explicit human action and remain available even when automatic reminders are
off (as long as `REMINDER_SCHEDULER` is not the only gate; manual send has its
own route and does not depend on a scheduler).

### Timezone

`users` has no timezone column today, and `APP_TIMEZONE` is app-wide. Automatic
reminders need *per-user* local time so digests land at a sensible hour. The
`timezone` column on `reminder_preferences` is populated from Slack's
`users.info` (`tz` field) on login / first preference write, defaulting to
`APP_TIMEZONE`, and is editable in the UI. Deadline math is done in UTC; only
the *send moment* is localized.

Migration generated with `bun run db:generate`, applied with `bun run db:migrate`.

---

## Notification delivery

All reminders are sent as Slack DMs from the Graphein bot via `chat.postMessage`
with the user's `slackUserId` as the channel (Slack opens the IM automatically).
Content is localized with the existing `t(locale, key)` using the recipient's
`users.locale`. Messages use Block Kit so titles and links render cleanly. Links
use `BASE_URL` plus `slackPermalink` when present.

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

**Manual admin reminder:** see [Manual admin reminders](#manual-admin-reminders).

Send failures are logged and skipped (not retried in-pass); for automatic
reminders the next tick re-evaluates, and idempotency (below) prevents
double-sends. For manual sends, the result reports which users were reached.

---

## Configuration

Per-user automatic preferences are edited in the web UI (a new **Settings →
Reminders** section). There is no JSON API for them.

| Setting | Values | Default |
| --- | --- | --- |
| Master switch (automatic) | on / off | on |
| Deadline reminders | on / off | on |
| Lead time | hours before deadline | 24 |
| Digest frequency | off / daily / weekly | daily |
| Send hour | 0–23 (local) | 9 |
| Timezone | IANA tz | from Slack, else `APP_TIMEZONE` |

Admins control the global automatic on/off via `app_settings.reminders_enabled`
and the scheduler mode via env.

---

## API changes

No endpoint exists for reminder preferences (web-UI only). The only new
transport surfaces are the manual admin reminder and the internal runner.

### Manual admin reminder

A custom method (AIP-136) on the owned-task resource, reusing the existing
owner/admin authorization and `application` use-case across transports.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/tasks/owned/:id/sendReminder` | Send a manual reminder DM to incomplete assignees |

Request:

```json
{
  "message": "Please wrap this up by EOD 🙏",
  "userIds": ["uuid-a", "uuid-b"]
}
```

- `message` (optional): custom text; a localized default is used if omitted.
- `userIds` (optional): subset of incomplete assignees; defaults to all
  incomplete assignees. Members must be incomplete assignees of the task.

Response:

```json
{
  "taskId": "uuid",
  "sentTo": ["uuid-a", "uuid-b"],
  "skipped": []
}
```

Errors: `404 not_found` (task missing/archived), `403 forbidden` (not
owner/admin), `422 validation_error` (`userIds` contains non-assignees or
already-done users, or empty recipient set).

The same use-case is exposed as an MCP tool (`send_task_reminder`) and a Web UI
action (button on the task status page), all delegating to
`reminderService.sendManualReminder`.

### Internal runner (external scheduler)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/internal/reminders/run` | `Authorization: Bearer <REMINDER_RUNNER_SECRET>` | Run one automatic reminder pass (`runDue`) |

Not part of `/api/v1`; excluded from `authMiddleware`. Returns `200` with a run
summary, `401` on bad secret, `409` if a pass is already in progress (lock held).
Always mounted, but only meaningful when `REMINDER_SCHEDULER=external` (or for
manual/test invocation).

---

## Runner logic

```
runDue(now):
  if not app_settings.reminders_enabled: return { skipped: "disabled" }
  if not acquireLock(): return { skipped: "locked" }   # 409 for external caller
  try:
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
  finally:
    releaseLock()
```

`reminderPolicy.deadlineDecision` (domain, pure):

- `now ≥ deadline` and (`stage != overdue` or `lastRemindedAt` older than 24h) → `overdue`
- `0 < deadline − now ≤ leadHours` and `stage == none` → `upcoming`
- otherwise → `none`

### Idempotency

`lastRemindedAt` / `reminderStage` (per assignment) and `lastDigestAt` (per
user) gate every automatic send, so overlapping or retried ticks never spam.
Combined with the cache lock — taken inside `runDue` and therefore shared by
both the internal tick and the external endpoint — at-most-one delivery per
logical event holds across restarts, replicas, and scheduler modes.

---

## Edge cases

| Case | Handling |
| --- | --- |
| Task has no deadline | No deadline reminder; still appears in the digest; can still be a manual-reminder target |
| Multiple assignees | Auto: sent to each *incomplete* assignee independently, each with its own `lastRemindedAt` / `reminderStage`. Manual: all incomplete assignees by default, or the chosen subset |
| Some assignees done, others not | Done assignees skipped (per-assignee `done`) for both automatic and manual |
| Manual `userIds` includes a done/non-assignee | Rejected with `422 validation_error` |
| Task archived | Excluded from automatic selection; manual send rejected |
| Deadline edited | `reminderStage` reset to `none` on deadline change so the new window re-triggers an upcoming nudge |
| User opted out (`enabled=false`) | Skipped for automatic; **manual admin sends still reach them** (explicit override) |
| Deactivated user (`users.deactivatedAt`) | Skipped in all paths |
| No open IM with bot | `chat.postMessage` to the user ID opens the IM; transient failures logged, retried next tick (auto) / reported in `skipped` (manual) |
| Unknown timezone | Falls back to `APP_TIMEZONE` |
| Chronically overdue | Throttled to one automatic DM per 24h until done or archived |
| Multiple instances / mixed schedulers | Cache lock ensures one pass runs; DB gating ensures no double-send regardless of `internal`/`external` |
| External POST while a pass is running | `409` (lock held); scheduler can retry next cadence |
| DST transitions | Local hour computed from the IANA zone at send time, so the tz library handles DST |
| Tick missed (downtime / scale-to-zero) | Next tick or next external POST catches up; deadline gating is window/stage-based, digest gating is "due since `lastDigestAt`" |

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
      service.ts         # runDue (automatic) + sendManualReminder (admin)
  infrastructure/
    db/
      schema.ts          # + reminder_preferences, task_assignees columns
    slack/
      dm.ts              # chat.postMessage DM wrapper + Block Kit builders
  adapters/
    reminders/
      scheduler.ts       # startReminderScheduler (internal tick + cache lock)
      runner-route.ts    # POST /internal/reminders/run (external scheduler)
    api/
      tasks.ts           # + POST /api/v1/tasks/owned/:id/sendReminder
    mcp/
      tools/tasks.ts     # + send_task_reminder tool
    web/
      tasks/             # "Send reminder" action on task status page
      settings/          # Reminders preferences UI (no API)
```

---

## Open questions

- Should owners (not just assignees) optionally get a progress summary of their
  tasks in the periodic digest?
- Add a Block Kit "snooze 1 day" button on automatic DMs? (Non-goal for v1, but
  cheap later via the existing Slack interaction handler.)
- Should manual admin reminders respect per-user opt-out instead of overriding
  it? (Current choice: override, since it's an explicit human action.)
- Should the digest include tasks the user *owns* but isn't assigned to?
- Per-task mute for one noisy task — worth the extra config?
