# Graphein

Graphein captures work from Slack — tasks, code snippets, and kudos — and surfaces them in a server-rendered web UI. It also exposes a REST API with OpenAPI documentation and an MCP (Model Context Protocol) server for AI tool integration.

The name comes from the Greek word **γραφεῖν** (graphein), meaning "to write" — turning spoken words into written action.

## Features

- **Tasks** — Convert Slack messages into trackable tasks via a message shortcut. Gemini extracts the title and deadline automatically. Assign to individual users or usergroups with per-assignee completion tracking.
- **Snippets** — Collect status updates from monitored Slack channels. Admins configure which channels to watch.
- **Kudos** — Collect recognition and appreciation messages from monitored Slack channels. Admins configure which channels to watch.
- **REST API** — JSON API at `/api/v1` authenticated via API keys. Includes an OpenAPI spec at `/api/v1/doc` and a Scalar reference UI at `/api/v1/reference`.
- **MCP Server** — Model Context Protocol endpoint at `/mcp` with full OAuth 2.0 authorization. Provides tools for tasks, snippets, kudos, and admin operations.
- **Admin** — User management (promote/demote), snippet and kudos channel monitoring configuration, and application settings.

## Requirements

- [Bun](https://bun.sh/) runtime
- PostgreSQL
- A Slack workspace with permission to install apps
- [Gemini API key](https://aistudio.google.com/apikey) (for automatic title/deadline extraction)

## Setup

### 1. Create a Slack App

Generate a manifest and create an app at [api.slack.com/apps](https://api.slack.com/apps):

```bash
./scripts/generate-slack-manifest.sh
```

Follow the prompts to configure app name, base URL, and Socket Mode. The generated YAML can be pasted into **Create New App → From a manifest**.

After creating the app:

1. Go to **Settings → OpenID Connect** and set the Redirect URL to `{BASE_URL}/auth/slack/callback`
2. Install the app to your workspace

### 2. Configure Environment Variables

| Variable               | Description                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection URL (e.g., `postgresql://user:password@host:5432/graphein`)                       |
| `SLACK_BOT_TOKEN`      | Slack Bot token. Found in your Slack App's **OAuth & Permissions** page (`xoxb-...`)                    |
| `SLACK_SIGNING_SECRET` | Slack request signing secret. Found in your Slack App's **Basic Information → App Credentials** section |
| `SLACK_CLIENT_ID`      | Slack OAuth client ID. Found in your Slack App's **Basic Information → App Credentials** section        |
| `SLACK_CLIENT_SECRET`  | Slack OAuth client secret. Found in your Slack App's **Basic Information → App Credentials** section    |
| `SLACK_TEAM_ID`        | Slack workspace (team) ID. Found in your Slack workspace's **Settings & administration** page           |
| `GEMINI_API_KEY`       | Google Gemini API key. Generate at [Google AI Studio](https://aistudio.google.com/apikey)               |
| `JWT_SECRET`           | Secret key for signing session and MCP OAuth tokens. Generate with `openssl rand -hex 32`               |
| `BASE_URL`             | Public URL where Graphein is hosted (e.g., `https://graphein.example.com`)                              |

Optional:

| Variable            | Description                                                                        | Default  |
| ------------------- | ---------------------------------------------------------------------------------- | -------- |
| `PORT`              | Server port                                                                        | `3000`   |
| `APP_TIMEZONE`      | Timezone for deadline display                                                      | `UTC`    |
| `SLACK_SOCKET_MODE` | Use Socket Mode instead of HTTP (`true`/`false`)                                   | `false`  |
| `SLACK_APP_TOKEN`   | Required only if `SLACK_SOCKET_MODE=true` (`xapp-...`)                             | —        |
| `CACHE_BACKEND`     | Cache backend: `memory` (in-process) or `redis` (shared)                           | `memory` |
| `REDIS_URL`         | Redis connection URL, e.g. `redis://localhost:16379/0`. Required when using Redis. | —        |

### 3. Run

```bash
# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Build CSS
bun run css:build

# Start the server
bun run start
```

The app is available at `http://localhost:3000` (or your configured `BASE_URL`).

## Contributing

See [docs/development.md](docs/development.md) for development setup and guidelines.

## License

[Apache License 2.0](LICENSE)
