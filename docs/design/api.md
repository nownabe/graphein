# Graphein API

## Overview

Add a JSON API to Graphein, allowing external tools (CI bots, dashboards, scripts) to interact with tasks, snippets, and kudos programmatically.

## Goals

- Provide access to tasks, snippets, and kudos via JSON API
- Authenticate via API keys issued per user through the Web UI
- API key permissions mirror the issuing user's access level
- Support filtering and cursor-based pagination

## Non-Goals

- Full CRUD via API (only specific write operations are supported)
- API key management via API (managed exclusively through Web UI)
- Slack OAuth as an API authentication method (remains Web UI only)

---

## Authentication

### API Key

All API requests are authenticated with a Bearer token in the `Authorization` header:

```
Authorization: Bearer gph_a1b2c3d4e5f6...
```

### Key Format

- Prefix: `gph_`
- Body: 32 bytes of cryptographically random data, base62 encoded
- Storage: only the SHA-256 hash is persisted; the raw key is shown once at creation time

### Key Properties

| Property       | Description                           |
| -------------- | ------------------------------------- |
| Name           | User-assigned label (e.g. "CI bot")   |
| Role           | `user` or `admin` (admin-only option) |
| Expiration     | Optional; `NULL` means never expires  |
| Revocation     | Can be revoked at any time            |
| Per-user limit | Maximum 10 active keys per user       |

### Key Issuance

The key's role is determined at creation time based on the issuing user's role:

| User role | Allowed key roles              |
| --------- | ------------------------------ |
| admin     | `admin` or `user` (selectable) |
| user      | `user` only                    |

### Request-Time Validation

On each API request, the middleware checks both the key's role and the user's current role:

| User role | Key role | Result                              |
| --------- | -------- | ----------------------------------- |
| admin     | admin    | Proceed as `admin`                  |
| admin     | user     | Proceed as `user`                   |
| user      | user     | Proceed as `user`                   |
| user      | admin    | **Auto-revoke the key**, return 401 |

If an admin user is later demoted to `user`, their `admin`-role keys are automatically revoked on next use (sets `revoked_at`) and the request fails with 401. This ensures admin-scoped keys never silently downgrade — the owner must explicitly create a new `user`-role key.

---

## Database Schema

### `api_keys` Table

```sql
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  key_hash      BYTEA NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Column       | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `key_hash`   | SHA-256 hash of the raw API key (32 bytes, fixed-length binary)            |
| `key_prefix` | First 12 characters (e.g. `gph_a1b2c3d4`) for display in the management UI |
| `role`       | `"user"` or `"admin"`                                                      |
| `expires_at` | `NULL` = never expires                                                     |
| `revoked_at` | `NULL` = active; set on revocation                                         |

---

## API Key Management (Web UI)

API keys are managed through the Web UI under `/settings/api-keys`, protected by existing JWT cookie authentication.

### Operations

- **List**: shows name, key_prefix, role, expires_at, last_used_at, revoked_at
- **Create**: inputs are name, expiration (days or no expiration), admin toggle (admin users only). The raw key is displayed once immediately after creation.
- **Revoke**: marks key as revoked (sets `revoked_at`)

---

## API Endpoints

**Base path**: `/api/v1`

All endpoints return `application/json`.

### `GET /api/v1/tasks`

Returns tasks assigned to the authenticated user, with the user's own completion status.

#### Query Parameters

All filters are combined with **AND**.

| Param            | Type                   | Default  | Description                          |
| ---------------- | ---------------------- | -------- | ------------------------------------ |
| `status`         | `active` \| `archived` | `active` | Task archive status                  |
| `done`           | `true` \| `false`      | _(any)_  | The user's own completion status     |
| `deadlineBefore` | ISO 8601               |          | Tasks with deadline before this time |
| `deadlineAfter`  | ISO 8601               |          | Tasks with deadline after this time  |
| `pageSize`       | integer                | 50       | Max results per page (max 100)       |
| `pageToken`      | string                 |          | Cursor for the next page             |

#### Authorization

Returns only tasks where the authenticated user is an assignee, regardless of role (admin included).

#### Response

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Fix the login bug",
      "body": "<@U123|alice> please check this",
      "archived": false,
      "done": false,
      "deadline": "2026-04-20T09:00:00Z",
      "slackPermalink": "https://slack.com/...",
      "createdBy": {
        "id": "uuid",
        "displayName": "Bob"
      },
      "createdAt": "2026-04-15T10:00:00Z",
      "updatedAt": "2026-04-16T12:00:00Z"
    }
  ],
  "totalSize": 42,
  "nextPageToken": "eyJpZCI6IjAxOTNhYi..."
}
```

### `GET /api/v1/tasks/owned`

Returns tasks owned by the authenticated user, with aggregated progress.

#### Query Parameters

All filters are combined with **AND**.

| Param            | Type                   | Default  | Description                          |
| ---------------- | ---------------------- | -------- | ------------------------------------ |
| `status`         | `active` \| `archived` | `active` | Task archive status                  |
| `deadlineBefore` | ISO 8601               |          | Tasks with deadline before this time |
| `deadlineAfter`  | ISO 8601               |          | Tasks with deadline after this time  |
| `pageSize`       | integer                | 50       | Max results per page (max 100)       |
| `pageToken`      | string                 |          | Cursor for the next page             |

#### Authorization

| Effective role | Scope                                 |
| -------------- | ------------------------------------- |
| `user`         | Only tasks where the user is an owner |
| `admin`        | All tasks                             |

#### Response

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Fix the login bug",
      "body": "<@U123|alice> please check this",
      "archived": false,
      "deadline": "2026-04-20T09:00:00Z",
      "slackPermalink": "https://slack.com/...",
      "createdBy": {
        "id": "uuid",
        "displayName": "Bob"
      },
      "progress": {
        "total": 3,
        "done": 1
      },
      "createdAt": "2026-04-15T10:00:00Z",
      "updatedAt": "2026-04-16T12:00:00Z"
    }
  ],
  "totalSize": 42,
  "nextPageToken": "eyJpZCI6IjAxOTNhYi..."
}
```

### `GET /api/v1/tasks/owned/:id/assignees`

Returns the assignee list with completion status for a specific owned task. Intended for tracking who has and hasn't completed a task.

#### Query Parameters

All filters are combined with **AND**.

| Param       | Type              | Default | Description                    |
| ----------- | ----------------- | ------- | ------------------------------ |
| `done`      | `true` \| `false` | _(any)_ | Filter by completion status    |
| `pageSize`  | integer           | 50      | Max results per page (max 100) |
| `pageToken` | string            |         | Cursor for the next page       |

#### Authorization

| Effective role | Scope                                    |
| -------------- | ---------------------------------------- |
| `user`         | Only if the user is an owner of the task |
| `admin`        | Any task                                 |

Returns 403 if the user is not an owner (and not admin). Returns 404 if the task does not exist.

#### Response

```json
{
  "taskId": "uuid",
  "assignees": [
    {
      "userId": "uuid",
      "displayName": "Alice",
      "done": true
    },
    {
      "userId": "uuid",
      "displayName": "Charlie",
      "done": false
    }
  ],
  "totalSize": 1500,
  "nextPageToken": "eyJ1c2VyX2lkIjoiMDEuLi4ifQ=="
}
```

### `POST /api/v1/tasks/owned/:id/archive`

Archives a task. Idempotent — archiving an already-archived task returns 200.

#### Authorization

| Effective role | Scope                                    |
| -------------- | ---------------------------------------- |
| `user`         | Only if the user is an owner of the task |
| `admin`        | Any task                                 |

Returns 403 if the user is not an owner (and not admin). Returns 404 if the task does not exist.

#### Response

```json
{
  "id": "uuid",
  "title": "Fix the login bug",
  "archived": true,
  "updatedAt": "2026-04-18T12:00:00Z"
}
```

### `POST /api/v1/tasks/owned/:id/unarchive`

Unarchives a task. Idempotent — unarchiving an already-active task returns 200.

#### Authorization

| Effective role | Scope                                    |
| -------------- | ---------------------------------------- |
| `user`         | Only if the user is an owner of the task |
| `admin`        | Any task                                 |

Returns 403 if the user is not an owner (and not admin). Returns 404 if the task does not exist.

#### Response

```json
{
  "id": "uuid",
  "title": "Fix the login bug",
  "archived": false,
  "updatedAt": "2026-04-18T12:00:00Z"
}
```

### `GET /api/v1/snippets`

Returns snippets. All users (regardless of role) can see all snippets.

#### Query Parameters

All filters are combined with **AND**, except `mentionedUser` and `mentionedUsergroup` which are combined with **OR** when both are specified.

| Param                | Type     | Default | Description                           |
| -------------------- | -------- | ------- | ------------------------------------- |
| `postedBy`           | UUID     |         | Filter by poster                      |
| `mentionedUser`      | UUID     |         | Filter by mentioned user              |
| `mentionedUsergroup` | UUID     |         | Filter by mentioned usergroup         |
| `periodStart`        | ISO 8601 |         | Snippets posted at or after this time |
| `periodEnd`          | ISO 8601 |         | Snippets posted before this time      |
| `pageSize`           | integer  | 50      | Max results per page (max 100)        |
| `pageToken`          | string   |         | Cursor for the next page              |

#### Response

```json
{
  "snippets": [
    {
      "id": "uuid",
      "content": "Finished the API design today...",
      "postedAt": "2026-04-18T06:30:00Z",
      "slackPermalink": "https://slack.com/...",
      "postedBy": {
        "id": "uuid",
        "displayName": "Alice",
        "avatarUrl": "https://..."
      },
      "mentionedUsers": [{ "id": "uuid", "displayName": "Bob" }],
      "mentionedUsergroups": [{ "id": "uuid", "name": "Backend Team", "handle": "backend" }]
    }
  ],
  "totalSize": 10,
  "nextPageToken": ""
}
```

### `GET /api/v1/kudos`

Returns kudos entries. All users (regardless of role) can see all kudos.

#### Query Parameters

All filters are combined with **AND**.

| Param         | Type     | Default | Description                          |
| ------------- | -------- | ------- | ------------------------------------ |
| `postedBy`    | UUID     |         | Filter by sender                     |
| `user`        | UUID     |         | Filter by recipient (mentioned user) |
| `periodStart` | ISO 8601 |         | Kudos posted at or after this time   |
| `periodEnd`   | ISO 8601 |         | Kudos posted before this time        |
| `pageSize`    | integer  | 50      | Max results per page (max 100)       |
| `pageToken`   | string   |         | Cursor for the next page             |

#### Response

```json
{
  "kudos": [
    {
      "id": "uuid",
      "message": "Great work on the release! :tada:",
      "postedBy": {
        "id": "uuid",
        "displayName": "Alice",
        "avatarUrl": "https://..."
      },
      "postedAt": "2026-04-17T08:00:00Z",
      "slackPermalink": "https://slack.com/..."
    }
  ],
  "totalSize": 5,
  "nextPageToken": ""
}
```

### `GET /api/v1/admin/users`

Returns all users. Requires `admin` effective role.

#### Query Parameters

| Param       | Type    | Default | Description                                                      |
| ----------- | ------- | ------- | ---------------------------------------------------------------- |
| `query`     | string  |         | Search by display name or email (case-insensitive partial match) |
| `pageSize`  | integer | 50      | Max results per page (max 100)                                   |
| `pageToken` | string  |         | Cursor for the next page                                         |

#### Response

```json
{
  "users": [
    {
      "id": "uuid",
      "slackUserId": "U1234ABC",
      "email": "alice@example.com",
      "displayName": "Alice",
      "avatarUrl": "https://...",
      "role": "admin",
      "locale": "en",
      "deactivatedAt": null,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "totalSize": 150,
  "nextPageToken": "eyJ1c2VyX2lkIjoiMDEuLi4ifQ=="
}
```

### `POST /api/v1/admin/users/:id/deactivate`

Deactivates a user. Idempotent. Requires `admin` effective role.

Returns 404 if the user does not exist.

#### Response

```json
{
  "id": "uuid",
  "displayName": "Alice",
  "deactivatedAt": "2026-04-19T12:00:00Z"
}
```

### `GET /api/v1/admin/snippetChannels`

Returns all snippet-monitored channels. Requires `admin` effective role.

#### Response

```json
{
  "snippetChannels": [
    {
      "id": "uuid",
      "slackChannelId": "C1234ABC",
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ]
}
```

### `POST /api/v1/admin/snippetChannels`

Adds a snippet-monitored channel. Idempotent — adding an already-registered channel returns 200. Requires `admin` effective role.

#### Request

```json
{
  "slackChannelId": "C1234ABC"
}
```

#### Response (201 or 200)

```json
{
  "id": "uuid",
  "slackChannelId": "C1234ABC",
  "createdAt": "2026-04-19T12:00:00Z"
}
```

### `DELETE /api/v1/admin/snippetChannels/:id`

Removes a snippet-monitored channel. Requires `admin` effective role.

Returns 404 if the channel does not exist. Returns 204 on success (no body).

### `GET /api/v1/admin/kudosChannels`

Returns all kudos-monitored channels. Requires `admin` effective role.

#### Response

```json
{
  "kudosChannels": [
    {
      "id": "uuid",
      "slackChannelId": "C5678DEF",
      "createdAt": "2026-02-01T00:00:00Z"
    }
  ]
}
```

### `POST /api/v1/admin/kudosChannels`

Adds a kudos-monitored channel. Idempotent — adding an already-registered channel returns 200. Requires `admin` effective role.

#### Request

```json
{
  "slackChannelId": "C5678DEF"
}
```

#### Response (201 or 200)

```json
{
  "id": "uuid",
  "slackChannelId": "C5678DEF",
  "createdAt": "2026-04-19T12:00:00Z"
}
```

### `DELETE /api/v1/admin/kudosChannels/:id`

Removes a kudos-monitored channel. Requires `admin` effective role.

Returns 404 if the channel does not exist. Returns 204 on success (no body).

---

## Pagination

All list endpoints use **cursor-based pagination** following [AIP-158](https://google.aip.dev/158).

### Request

- **`pageSize`** (optional) — maximum number of results to return. If unspecified or `0`, the API defaults to 50. Values above 100 are coerced down to 100. Negative values return 422 (`validation_error`).
- **`pageToken`** (optional) — opaque cursor string from a previous response's `nextPageToken`. When paginating, all other filter parameters must remain the same as the original request; changing them returns 422 (`validation_error`).

### Response

- **`nextPageToken`** — an opaque, URL-safe string. If empty (`""`), the end of the collection has been reached. This is the only signal for end-of-collection.
- **`totalSize`** (optional) — total number of items matching the filters. This may be an estimate for expensive queries.

### Constraints

- Page tokens must not be user-parseable or constructed by clients. Internally they encode cursor position as a base64-encoded JSON object.
- The API may return fewer results than `pageSize` (including zero results), even when more pages exist.
- The results field is always the first field in the response object.

---

## Error Responses

All errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid or expired API key"
  }
}
```

| HTTP Status | Code               | Description                                   |
| ----------- | ------------------ | --------------------------------------------- |
| 401         | `unauthorized`     | Missing, invalid, expired, or revoked API key |
| 403         | `forbidden`        | Insufficient permissions                      |
| 404         | `not_found`        | Resource not found                            |
| 422         | `validation_error` | Invalid query parameters                      |
| 429         | `rate_limited`     | Rate limit exceeded                           |

---

## Rate Limiting

Per API key, **60 requests per minute** using a fixed-window algorithm.

### Algorithm

**Fixed window** — each API key gets a 1-minute window starting from its first request in that window. The window resets every 60 seconds on the minute boundary (i.e. truncated to the minute).

### Storage

In-memory `Map<string, { count: number; windowStart: number }>` keyed by API key hash. This is simple and sufficient for a single-process deployment. No external store (Redis etc.) is needed.

- On each request, compute the current window (`Math.floor(Date.now() / 60000)`)
- If the key's `windowStart` matches, increment `count`; otherwise reset to `{ count: 1, windowStart: current }`
- If `count > 60`, return 429
- Stale entries are lazily cleaned up (evicted when accessed in a new window)

### Response Headers

Set on every API response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1713456060
```

`X-RateLimit-Reset` is a Unix timestamp (seconds) of when the current window ends.

### 429 Response

When the limit is exceeded, the API returns HTTP 429 with the standard error body and a `Retry-After` header (seconds until window reset).

---

## Implementation Structure

```
src/
├── db/
│   └── schema.ts         # api_keys table added here (alongside existing tables)
├── api/
│   ├── middleware.ts     # Bearer token auth, rate limiting, role resolution
│   ├── tasks.ts          # /api/v1/tasks, /api/v1/tasks/owned/* routes
│   ├── snippets.ts       # /api/v1/snippets routes
│   ├── kudos.ts          # /api/v1/kudos routes
│   ├── admin.ts          # /api/v1/admin/* routes (users, snippetChannels, kudosChannels)
│   └── serializers.ts    # DB row -> JSON response (camelCase keys)
├── api-keys/
│   ├── service.ts        # create, list, revoke, verify, hash lookup
│   └── routes.tsx        # Web UI routes (/settings/api-keys)
```

The API routes reuse existing `taskService`, `snippetService`, `kudosService`, and `userService` for data access. The `serializers.ts` module converts DB rows to the JSON response format with camelCase keys, following [AIP-140](https://google.aip.dev/140).

---

## References

- [AIP-122: Resource names](https://google.aip.dev/122) — collection identifiers use camelCase
- [AIP-140: Field names](https://google.aip.dev/140) — field naming conventions; JSON output uses camelCase via [protobuf JSON mapping](https://protobuf.dev/programming-guides/json/)
- [AIP-158: Pagination](https://google.aip.dev/158) — `pageSize`, `pageToken`, `nextPageToken`, `totalSize`
- [AIP-190: Naming conventions](https://google.aip.dev/190) — general naming guidelines
