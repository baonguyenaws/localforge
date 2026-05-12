# LocalForge

> Build apps on autopilot — powered by local AI or your favorite cloud models. No lock-in. Your choice.

LocalForge lets you describe an app in plain language and watch AI coding agents build it feature by feature. Originally designed for fully local, private AI (zero API costs, zero data sharing), it now also supports leading cloud providers — so you can use the best model for the job, whether that's a local Gemma running on your laptop or Claude Opus in the cloud.

---

## Quick Start

### 1. Prerequisites

- **Node.js 20+** — [download here](https://nodejs.org/)
- A model backend — choose **one** of:
  - **Local:** [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.com/)
  - **Cloud:** API key from OpenAI, Anthropic, Google, or a GitHub Copilot subscription

### 2. Install and run

```bash
git clone https://github.com/leonvanzyl/localforge.git
cd localforge
npm install
npm run db:migrate
npm run dev
```

Open **http://localhost:7777** in your browser.

### 3. Configure your AI model

Go to **Settings → Local** to point LocalForge at a local model server, or **Settings → Cloud** to add cloud provider credentials. You can enable multiple providers at once and pick a model per project.

### 4. Build something

1. Create a new project from the sidebar
2. Describe your app — the AI bootstrapper generates features automatically
3. Click **Start** and watch agents build it feature by feature

---

## AI Providers

### Local models (self-hosted, free)

Run models on your own hardware — no data leaves your machine.

| Tool | Default URL | Notes |
| --- | --- | --- |
| [LM Studio](https://lmstudio.ai/) | `http://127.0.0.1:1234` | Recommended for beginners. GUI model manager, OpenAI-compatible server. |
| [Ollama](https://ollama.com/) | `http://127.0.0.1:11434` | Lightweight CLI runner. Great for scripting and servers. |

Any OpenAI-compatible endpoint works — configure the base URL in **Settings → Local**.

### Cloud providers

Connect your API keys or OAuth account in **Settings → Cloud**.

| Provider | Auth | Models |
| --- | --- | --- |
| **OpenAI** | API key | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| **Anthropic** | API key | `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-3-5-haiku-latest` |
| **Google Gemini** | API key | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-1.5-pro` |
| **GitHub Copilot** | OAuth (GitHub login) | `gpt-4o`, `claude-sonnet-4-5`, `gemini-2.5-pro`, `o3-mini` |
| **OpenCode** | API key | `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.5-pro` |

Cloud credentials are stored server-side in the SQLite settings table — they are never exposed to the browser after the initial save.

---

## How the orchestrator works

1. Create a project manually or by chatting with the AI bootstrapper.
2. Features land in the **Backlog** column of the kanban, ordered by priority and respecting dependencies.
3. Click **Start** — LocalForge spawns an agent session pointed at the configured model, passes the highest-priority ready feature, and moves the card to **In Progress**.
4. The agent writes code, runs Playwright tests, and captures screenshots. Live output streams into the activity panel via SSE.
5. On success the card moves to **Completed**. On failure the feature returns to the backlog with demoted priority so other features can proceed first.
6. When all features pass — confetti.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 7777 |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm test` | Run Playwright tests |

---

## Tech stack

- **Frontend:** Next.js App Router + React 19, Tailwind CSS v4 + shadcn/ui, dnd-kit, Sonner
- **Backend:** Next.js API routes (Node.js), SQLite + Drizzle ORM, Server-Sent Events
- **Agents:** Pi coding-agent SDK — works with any OpenAI-compatible endpoint (local or cloud)
- **Testing:** Playwright

---

## Project layout

```
app/                 Next.js App Router routes + API handlers
  api/               REST API endpoints
  settings/          Settings page (General / Local / Cloud tabs)
components/          React components
  ui/                shadcn/ui primitives
lib/
  db/                Drizzle schema + SQLite connection
  agent/             Pi agent integration + orchestrator
  cloud-providers.ts Cloud provider definitions and model lists
  cloud-settings.ts  Server-side credential storage helpers
data/                SQLite database file (git-ignored)
projects/            User-created project folders (git-ignored)
drizzle/             Generated migrations
tests/               Playwright specs
```

---

## Configuration

**Model selection** can be set globally in **Settings** or overridden per project via **Project Settings**. When a cloud model is selected, its composite identifier (`cloud::<provider>::<model>`) is stored in project settings — no extra DB columns required.

**Playwright verification** (off by default) runs after each feature. Enable **Playwright headed browser** to watch a real Chromium window during verification. When the `CI` environment variable is set, verification stays headless regardless of the toggle. Headed mode uses a short `slowMo` so actions are easier to follow.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
