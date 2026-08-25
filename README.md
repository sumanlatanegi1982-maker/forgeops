# ForgeOps

> A custom web UI for a TrueForge agent that does **code review** and **incident debugging**.
> Built for the [Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge).

ForgeOps is a React + TypeScript frontend that connects to a TrueForge server via the `@truefoundry/trueforge-sdk`. It replaces the default TrueForge terminal / bundled UI with a custom dashboard — chat with the agent, see tool calls as they happen, and approve or deny write/destructive actions before they run.

---

## What the agent does

Two features, both powered by TrueForge's three pillars (MCP tools, sandbox, human approval):

### 1. Code Review
- Fetches the PR diff and changed files via the GitHub MCP server
- Clones the repo into the sandbox and runs the test suite
- Analyzes the code for bugs, security issues, and logic errors
- **Pauses for approval** before posting the review comment (write action)

### 2. Incident Debugging → Post-mortem → Fix
- Fetches recent deploys and relevant code via the GitHub MCP
- Writes and runs a bisect script in the sandbox to find the culprit commit
- Identifies the root cause
- **Pauses for approval** before any rollback or destructive action

---

## Architecture

```
Browser (React UI)
    │
    │  @truefoundry/trueforge-sdk (HTTP + SSE)
    │
    ▼
TrueForge Server (localhost:8790)
    │
    ├── Model Provider (OpenAI / Anthropic / Gemini)
    ├── MCP Server: GitHub (OAuth, connected in Settings)
    └── Sandbox: Daytona (isolated code execution)
```

### Project structure

```
forgeops/
├── index.html                 # HTML entry point
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript config
├── tsconfig.node.json         # TypeScript config for Vite
├── vite.config.ts             # Vite config (with proxy to TrueForge)
├── .env.example               # Environment variable template
├── .gitignore
├── public/
│   └── forgeops.svg           # Logo
└── src/
    ├── main.tsx               # React entry point
    ├── vite-env.d.ts          # Vite type declarations
    ├── components/
    │   ├── App.tsx            # Main app layout
    │   ├── Sidebar.tsx        # Agent status & navigation
    │   ├── ChatMessage.tsx    # Renders agent/user messages (markdown)
    │   ├── ChatInput.tsx      # Message input bar
    │   ├── ApprovalCard.tsx   # Human-in-the-loop approval UI
    │   └── ToolCallBadge.tsx  # Tool call status indicators
    ├── hooks/
    │   └── useAgentSession.ts # TrueForge session lifecycle (stream, approve, reset)
    ├── lib/
    │   ├── env.ts             # Environment loader
    │   ├── trueforge-client.ts # TrueForge SDK client
    │   └── agent-spec.ts      # Agent definition (model, MCP, sandbox, approval)
    ├── types/
    │   └── events.ts          # Event type definitions
    └── styles/
        └── app.css            # Full dark-theme styling
```

---

## Prerequisites

1. **Node.js 20+** — for running the frontend
2. **TrueForge server** — installed and running locally
3. **A model provider** — an API key for OpenAI, Anthropic, or Gemini
4. **Daytona account** — for the sandbox (free tier works)
5. **GitHub MCP** — connected via TrueForge's Settings → Connectors

---

## Setup

### 1. Start the TrueForge server

```bash
npx @truefoundry/trueforge
```

This runs on `http://localhost:8790` with SQLite storage — no extra infra needed.

### 2. Configure TrueForge (in the TrueForge UI at localhost:8790)

- **Settings → Models**: Add your model provider (e.g. OpenAI or Anthropic)
- **Settings → Connectors**: Pick GitHub from the catalog, complete OAuth
- **Settings → Sandbox providers**: Pick Daytona, paste your API key

### 3. Clone and install this frontend

```bash
git clone <your-repo-url> forgeops
cd forgeops
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if your TrueForge server is not at the default URL.

### 5. Run the frontend

```bash
npm run dev
```

Open `http://localhost:3000` — you should see the ForgeOps dashboard.

---

## Using the agent

Click one of the suggestion cards on the empty state, or type a message:

- **"Review PR #42"** — the agent fetches the PR, runs tests in the sandbox, and pauses before posting the review
- **"Payment failures are spiking. Investigate recent deploys."** — the agent bisects in the sandbox and pauses before any rollback

When the agent hits a write or destructive action, an **Approval Card** appears showing the tool name and arguments. Click **Allow** or **Deny**.

---

## Qodo code review setup

Every submission must run substantive changes through Qodo-reviewed pull requests. The README must link to at least one reviewed PR.

### One-time setup per team

1. One teammate with admin access to the repository signs in to [Qodo](https://www.qodo.ai/)
2. Go to **Integrations → SaaS → GitHub → Add installation**
3. Authorise Qodo for the hackathon repository

### Workflow for every change

1. Create a branch: `git checkout -b feat/your-feature`
2. Make your changes and commit
3. Push and open a Pull Request
4. Qodo starts reviewing automatically (if it doesn't, comment `/qodo` on the PR)
5. Fix every **High** severity finding before merging
6. If a finding is wrong or intentional, dismiss it in the Qodo thread with a reason
7. Merge the PR after review
8. **Do not push directly to `main`** — direct pushes don't count as reviewed work

### Link to a reviewed PR

Add your reviewed PR link here before submission:

> **Reviewed PR:** https://github.com/<your-org>/forgeops/pull/1

---

## Development

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run typecheck  # Type-check without emitting
npm run preview    # Preview production build
```

---

## Hackathon submission checklist

- [ ] Public repo with a working README
- [ ] Agent runs through TrueForge (not a thin wrapper)
- [ ] Judge can see: real tool reached (GitHub MCP), code run in sandbox, pause for approval
- [ ] Demo video (~3 minutes) showing all three pillars
- [ ] Short write-up of what the agent does and how it uses TrueForge
- [ ] At least one Qodo-reviewed PR linked in this README
- [ ] No secrets or personal data in the repo or video

---

## Tech stack

- **React 19** + **TypeScript** — frontend
- **Vite 6** — build tool & dev server
- **@truefoundry/trueforge-sdk** — TrueForge client (HTTP + SSE)
- **react-markdown** — rendering agent responses
- **Daytona** — sandbox provider (via TrueForge)
- **GitHub MCP** — tool access (via TrueForge)

---

## License

MIT
