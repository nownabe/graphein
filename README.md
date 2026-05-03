# Graphein

Graphein converts Slack messages into trackable tasks. Users trigger a message shortcut in Slack, confirm details in a modal, and the task appears in a server-rendered web UI.

The name comes from the Greek word **γραφεῖν** (graphein), meaning "to write" — turning spoken words into written action.

## Requirements

- [Bun](https://bun.sh/) runtime
- PostgreSQL
- A Slack workspace with permission to install apps
- [Gemini API key](https://aistudio.google.com/apikey) (for automatic title/deadline extraction)

## Setup

### 1. Create a Slack App

Generate a manifest and create an app at [api.slack.com/apps](https://api.slack.com/apps):

```bash
bun run slack:manifest
```

Follow the prompts to configure app name, base URL, and Socket Mode. The generated YAML can be pasted into **Create New App → From a manifest**.

After creating the app:

1. Go to **Settings → OpenID Connect** and set the Redirect URL to `{BASE_URL}/auth/slack/callback`
2. Install the app to your workspace

### 2. Configure Environment Variables

```bash
cp .envrc.example .envrc
```

| Variable               | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`         | PostgreSQL connection URL                                          |
| `SLACK_BOT_TOKEN`      | OAuth & Permissions → Bot User OAuth Token (`xoxb-...`)            |
| `SLACK_SIGNING_SECRET` | Basic Information → Signing Secret                                 |
| `SLACK_CLIENT_ID`      | Basic Information → App Credentials                                |
| `SLACK_CLIENT_SECRET`  | Basic Information → App Credentials                                |
| `GEMINI_API_KEY`       | Generate at [Google AI Studio](https://aistudio.google.com/apikey) |
| `JWT_SECRET`           | Any secret key (e.g., `openssl rand -hex 32`)                      |
| `MCP_JWT_SECRET`       | Secret for MCP OAuth tokens (e.g., `openssl rand -hex 32`)         |
| `BASE_URL`             | Public URL where Graphein is hosted                                |

Optional:

| Variable            | Description                                            | Default |
| ------------------- | ------------------------------------------------------ | ------- |
| `PORT`              | Server port                                            | `3000`  |
| `APP_TIMEZONE`      | Timezone for deadline display                          | `UTC`   |
| `SLACK_SOCKET_MODE` | Use Socket Mode instead of HTTP (`true`/`false`)       | `false` |
| `SLACK_APP_TOKEN`   | Required only if `SLACK_SOCKET_MODE=true` (`xapp-...`) | —       |

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
