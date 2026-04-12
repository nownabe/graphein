# Graphein

A web service that converts Slack posts into tasks.

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
