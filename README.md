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
| `GEMINI_API_KEY`       | Google Gemini API key. Generate at [Google AI Studio](https://aistudio.google.com/apikey)               |
| `JWT_SECRET`           | Secret key for signing session and MCP OAuth tokens. Generate with `openssl rand -hex 32`               |
| `BASE_URL`             | Public URL where Graphein is hosted (e.g., `https://graphein.example.com`)                              |

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
