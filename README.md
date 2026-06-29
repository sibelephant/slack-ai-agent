# 🤖 Slack AI Agent

An AI-powered Slack bot that automatically analyzes new workspace members, provides community managers with actionable intelligence, and delivers personalized onboarding experiences — all powered by Google Gemini.

## ✨ Features

### Automated Member Intelligence

- **Auto-analysis on join** — When a new member joins your workspace or a public channel, the agent automatically fetches their profile, researches their background, and generates a structured AI analysis.
- **Profile change tracking** — Detects profile updates and re-analyzes members, posting update notes as threaded replies on the original analysis.
- **Departure tracking** — Records when members leave channels and annotates their analysis thread.

### AI-Powered Analysis

Each analysis includes:

| Field | Description |
|---|---|
| **Summary** | 2–3 sentence professional summary of who the person is |
| **Expertise** | Identified areas of expertise |
| **Potential Contributions** | How they could contribute to the community |
| **Conversation Starters** | Suggested icebreakers tailored to their background |
| **Engagement Score** | 1–10 prediction of how active/valuable they'll be |
| **Suggested Channels** | Channels they might find relevant |
| **Risk Flags** | Potential concerns (competitor, spam patterns, etc.) |

### Background Research

The agent enriches profiles with external data before analysis:

- **Company lookup** — If the member has a work email, scrapes their company website for context.
- **GitHub discovery** — Searches GitHub for matching profiles and pulls bio, repo count, and follower data.

### Slash Commands

| Command | Description |
|---|---|
| `/analyze @user` | Analyze a specific user on demand |
| `/analyze all` | Bulk-analyze all unanalyzed workspace members |
| `/analyze status` | View aggregate analysis statistics |
| `/analyze` | Show command help |

### @Mention Support

Mention the bot in any channel to trigger analysis:

```
@Agent analyze @someone
```

### Interactive Actions

Analysis cards posted to your designated channel include action buttons:

- **🔄 Re-analyze** — Re-run the full pipeline with fresh data and update the card in-place.
- **📨 Send Welcome DM** — Generate and send a personalized welcome message via DM.
- **📢 Invite to Channels** — Opens a modal to select channels and invite the member.

### App Home Dashboard

The App Home tab displays a live dashboard with:

- Total members analyzed, weekly activity, and average engagement scores.
- Welcome DM and departure counters.
- Recent analysis cards with color-coded engagement scores (🟢 🟡 🔴).
- Quick action button to analyze a user via modal.

### Personalized Welcome DMs

AI-generated welcome messages that:

- Reference the member's name, title, and background.
- Suggest relevant channels based on their expertise.
- Include a low-pressure call to action.
- Use Slack-native markdown formatting.

---

## 🏗️ Architecture

```
slack-ai-agent/
├── index.ts                    # Root entry point
├── tsconfig.json               # TypeScript configuration (strict mode)
├── package.json
├── .env.example                # Environment variable reference
└── src/
    ├── index.ts                # App bootstrap & graceful shutdown
    ├── config.ts               # Validated environment config
    ├── logger.ts               # Structured logger (info/warn/error/debug)
    ├── types.ts                # Shared TypeScript interfaces
    ├── ai/
    │   └── analyzer.ts         # Gemini LLM integration (analysis + welcome messages)
    ├── db/
    │   ├── pool.ts             # PostgreSQL connection pool
    │   ├── migrate.ts          # Auto-migrations (CREATE TABLE IF NOT EXISTS)
    │   └── members.ts          # Member analysis CRUD operations
    ├── research/
    │   └── researcher.ts       # Company & GitHub background research
    ├── server/
    │   └── express.ts          # Express health check & dev test routes
    └── slack/
        ├── app.ts              # Bolt app & WebClient setup, user info helpers
        ├── events.ts           # Core analysis pipeline & event handlers
        ├── commands.ts         # /analyze slash command
        ├── messages.ts         # Block Kit message builders & senders
        ├── interactions.ts     # Button click & modal submission handlers
        └── home.ts             # App Home dashboard view
```

### Data Flow

```
New Member Joins
       │
       ▼
  Event Handler (team_join / member_joined_channel)
       │
       ▼
  Deduplication Check (in-memory + database)
       │
       ▼
  Fetch Slack Profile  ──►  Background Research (company + GitHub)
       │                            │
       ▼                            ▼
  AI Analysis (Gemini)  ◄─── Research Context
       │
       ▼
  Save to PostgreSQL
       │
       ├──►  Post Analysis Card to Channel
       │
       └──►  Send Personalized Welcome DM
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** database
- **Slack App** configured with Socket Mode
- **Google Gemini API** key

### 1. Clone & Install

```bash
git clone <your-repo-url> slack-ai-agent
cd slack-ai-agent
npm install
```

### 2. Configure Slack App

Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) with the following configuration:

#### OAuth Scopes (Bot Token)

| Scope | Purpose |
|---|---|
| `channels:read` | List public channels |
| `channels:history` | Read channel messages |
| `chat:write` | Post messages and analysis cards |
| `commands` | Register `/analyze` slash command |
| `im:write` | Send welcome DMs |
| `users:read` | Fetch user profiles |
| `users:read.email` | Access user email for research |
| `users.profile:read` | Read detailed profile info |

#### Event Subscriptions

Subscribe to these bot events:

- `team_join`
- `member_joined_channel`
- `member_left_channel`
- `user_change`
- `app_mention`
- `app_home_opened`

#### Socket Mode

Enable Socket Mode and generate an **App-Level Token** with `connections:write` scope.

#### Slash Command

Create a `/analyze` slash command (the request URL is handled automatically via Socket Mode).

### 3. Set Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Slack (required)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_ANALYSIS_CHANNEL_ID=C0123456789    # Channel to post analysis cards

# AI (required)
GEMINI_API_KEY=your-gemini-api-key

# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Optional
GITHUB_TOKEN=ghp_your-github-token       # Increases GitHub API rate limits
GEMINI_MODEL=gemini-2.0-flash            # Default model
PORT=3000                                 # Express server port
NODE_ENV=dev                              # Set to 'dev' for debug logging & test routes
```

> **Note**: `SLACK_ANALYSIS_CHANNEL_ID` is the channel where analysis cards will be posted. Create a private `#member-analysis` channel and add the bot to it.

### 4. Run

```bash
# Development (with watch mode)
npm run dev

# Production
npm start
```

The agent will:

1. Connect to PostgreSQL and run migrations automatically.
2. Register all Slack event, command, and interaction handlers.
3. Start the Slack app via Socket Mode.
4. Start an Express health check server on the configured port.

---

## 🛠️ Development

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot-reload via `tsx watch` |
| `npm start` | Start the application |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting files |

### Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-06-29T00:00:00.000Z",
  "uptime": 3600,
  "db": "connected"
}
```

### Dev-Only Test Route

When `NODE_ENV=dev`, a test endpoint is available:

```bash
curl -X POST http://localhost:3000/test/analyze-member \
  -H "Content-Type: application/json" \
  -d '{"userId": "U0123456789"}'
```

### Database

The agent automatically creates and migrates its table on startup:

```sql
CREATE TABLE IF NOT EXISTS member_analyses (
  id              SERIAL PRIMARY KEY,
  slack_user_id   VARCHAR(32) UNIQUE NOT NULL,
  username        VARCHAR(255),
  display_name    VARCHAR(255),
  email           VARCHAR(255),
  title           VARCHAR(500),
  analysis        JSONB NOT NULL,
  research_data   JSONB,
  welcome_dm_sent BOOLEAN DEFAULT FALSE,
  sent_to_slack   BOOLEAN DEFAULT FALSE,
  message_ts      VARCHAR(64),
  channel_id      VARCHAR(32),
  left_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| **TypeScript** | Type-safe application code (strict mode) |
| **[Slack Bolt](https://github.com/slackapi/bolt-js)** | Slack app framework (Socket Mode) |
| **[LangChain](https://js.langchain.com/)** | Google Gemini LLM integration |
| **[Express](https://expressjs.com/)** | Health check & dev test routes |
| **[PostgreSQL](https://www.postgresql.org/)** (via `pg`) | Persistent analysis storage |
| **[Axios](https://axios-http.com/)** | HTTP client for background research |
| **[tsx](https://github.com/privatenumber/tsx)** | TypeScript runtime (zero-config, no compile step) |
