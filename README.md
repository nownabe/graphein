# Graphein

Graphein converts Slack messages into trackable tasks. Users trigger a message shortcut in Slack, confirm details in a modal, and the task appears in a server-rendered web UI.

The name comes from the Greek word **γραφεῖν** (graphein), meaning "to write" — turning spoken words into written action.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/) with JSX server-side rendering
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **Interactivity**: [htmx](https://htmx.org/)
- **Slack**: [Bolt for JavaScript](https://slack.dev/bolt-js/)
- **LLM**: Gemini 2.0 Flash (title and deadline extraction)

## Setup

### 1. Create a Slack App

Create a new app at [api.slack.com/apps](https://api.slack.com/apps).

#### Socket Mode

- Turn on **Settings → Socket Mode**
- Go to **Settings → Basic Information → App-Level Tokens** and generate a token with the `connections:write` scope (starts with `xapp-`)

#### OAuth & Permissions

Add the following Bot Token Scopes:

- `chat:write`
- `users:read`
- `users:read.email`
- `usergroups:read`

#### OpenID Connect

Set the Redirect URL:

```
http://localhost:3000/auth/slack/callback
```

#### Interactivity & Shortcuts

- Turn on Interactivity
- Go to Shortcuts → **Create New Shortcut** → select **On messages**:
  - Name: `Create Task`
  - Callback ID: `create_task`

#### Install

Install the app to your workspace.

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

| Variable               | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`         | PostgreSQL connection URL. The default value works as-is           |
| `SLACK_BOT_TOKEN`      | OAuth & Permissions → Bot User OAuth Token (`xoxb-...`)            |
| `SLACK_APP_TOKEN`      | Basic Information → App-Level Tokens (`xapp-...`)                  |
| `SLACK_SOCKET_MODE`    | `true` for local development                                       |
| `SLACK_SIGNING_SECRET` | Basic Information → Signing Secret                                 |
| `SLACK_CLIENT_ID`      | Basic Information → App Credentials                                |
| `SLACK_CLIENT_SECRET`  | Basic Information → App Credentials                                |
| `GEMINI_API_KEY`       | Generate at [Google AI Studio](https://aistudio.google.com/apikey) |
| `JWT_SECRET`           | Any secret key (e.g., `openssl rand -hex 32`)                      |
| `BASE_URL`             | `http://localhost:3000`                                            |

### 3. Run

```bash
# Install dependencies
bun install

# Start PostgreSQL
bun run db:up

# Run migrations
bun run db:migrate

# Build Tailwind CSS
bun run css:build

# Start the dev server
bun run dev
```

Access the app at `http://localhost:3000`.

## Development

```bash
# Run dev server with auto-reload
bun run dev

# Watch and rebuild CSS
bun run css

# Run tests
bun test

# Generate a new migration after schema changes
bun run db:generate
```

## License

[Apache License 2.0](LICENSE)
