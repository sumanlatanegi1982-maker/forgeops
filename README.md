# ForgeOps CLI

A clean terminal client for your **forgeopsv1s** TrueForge agent.  
Connects directly to your saved agent — it already has your connectors (GitHub MCP, sandbox, model) configured, so no `/connect` commands or extra config needed here.

---

## What's fixed vs before


| Problem                                    | Fix                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Blank/empty output after sending a message | Proper `model.message.delta` streaming — text prints token-by-token                                                  |
| No loading indicator                       | Animated spinner (`⣾⣽⣻…`) that updates label per event type                                                          |
| GitHub / file editing not working          | Agent already has GitHub MCP connector — the CLI just passes your message through; all tools are handled server-side |
| Commands not running                       | No custom slash-command layer; your agent's connectors do the work                                                   |
| Can't see connectors                       | Connectors are part of the `forgeopsv1s` agent in TrueForge UI — change them there                                   |
| Run in CMD (not VS Code terminal)          | Works in any terminal — see below                                                                                    |


---

## Setup

### 1. Copy `.env.example` → `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Local TrueForge (VS Code / Codespace terminal)
TRUEFORGE_BASE_URL=http://localhost:8790

# In Codespaces, TrueForge port gets forwarded — use the forwarded URL instead:
# TRUEFORGE_BASE_URL=https://your-codespace-name-8790.preview.app.github.dev

TRUEFORGE_AGENT=forgeopsv1s

```

### 2. Install dependencies

```bash
npm install

```

### 3. Start TrueForge (if not already running)

In a **separate** terminal:

```bash
npx @truefoundry/trueforge

```

This starts the server at `http://localhost:8790`.

### 4. Run the CLI

```bash
# Interactive REPL
node cli.mjs

# One-shot (pipe-friendly)
node cli.mjs "Review the last PR in my repo"

```

---

## Running in Windows CMD (not VS Code terminal)

1. Install Node.js 22+ from https://nodejs.org
2. Open CMD and `cd` to this folder
3. Run `npm install` once
4. Run `node cli.mjs`

> If TrueForge is running in a Codespace, set `TRUEFORGE_BASE_URL` to the forwarded public URL for port 8790 (visible in the Codespace ports panel).

---

## How it works

```
Your terminal
     │  node cli.mjs
     ▼
TrueForge SDK  (@truefoundry/trueforge-sdk)
     │  sessions.create({ agent: { name: "forgeopsv1s" } })
     │  sessions.createTurnStream(sessionId, { input: [...] })
     ▼
TrueForge server  (localhost:8790)
     │
     ├── Model you configured in forgeopsv1s
     ├── GitHub MCP connector you attached in forgeopsv1s
     └── Sandbox / skills you attached in forgeopsv1s

```

All connectors and the model live in the **forgeopsv1s agent definition** in TrueForge — the CLI just opens a session and streams turns. To add/remove a connector, change it in the TrueForge UI (`Settings → Connectors`) and re-attach it to the agent.

---

## Approval prompts

When the agent wants to take a write action (push to GitHub, edit a file, etc.) it will pause and ask:

```
  ⚠  Approval required
     Function     : github_create_or_update_file
     Arguments    : {"owner":"you","repo":"forgeops",...}

  Allow this? [y/N]

```

Type `y` to allow, anything else to deny.

---

## Environment variables


| Variable             | Default                 | Description                              |
| -------------------- | ----------------------- | ---------------------------------------- |
| `TRUEFORGE_BASE_URL` | `http://localhost:8790` | TrueForge server URL                     |
| `TRUEFORGE_AGENT`    | `forgeopsv1s`           | Agent name in TrueForge                  |
| `TRUEFORGE_TOKEN`    | *(empty)*               | OIDC token (only when login is enabled)  |
