<div align="center">

# ⚒️ ForgeOps

### Terminal-native CLI agent for code review & incident debugging

Built on [TrueForge](https://trueforge.dev) · Powered by Sarvam 105B · Made for the WeMakeDevs Agent Harness Hackathon

</div>

---

<div align="center">

**🎬 Demo Video**

[![ForgeOps CLI Demo](https://img.youtube.com/vi/JEb6dS337SM/maxresdefault.jpg)](https://youtu.be/JEb6dS337SM)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Quick Start](#-quick-start)
- [Usage](#-usage)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Demo Tasks](#-demo-tasks)
- [Approval Flow](#-approval-flow)
- [Qodo PR Reviews](#-qodo-pr-reviews)
- [Troubleshooting](#-troubleshooting)
- [Built For](#-built-for)

---

## 🎯 Overview

ForgeOps is a lightweight Node.js CLI that connects to a pre-configured TrueForge agent (`forgeopsv1s`) from your terminal. Instead of building a web UI or managing connectors in code, ForgeOps treats the agent as a remote service — you just open a session, type a message, and watch the agent work in real time.

**The agent does the heavy lifting.** It has the Sarvam 105B model, a GitHub MCP connector, a sandbox, and skills — all configured in the TrueForge UI. The CLI is just a thin client that streams responses, shows agent steps, and enforces human approval before any irreversible action.

### Why a CLI?

- **No setup friction** — clone, `npm install`, run
- **Works in any terminal** — VS Code, Codespaces, Windows CMD, Linux, macOS
- **Full visibility** — every tool call is numbered and labeled, like the TrueForge web UI's "Agent Steps" panel
- **Human-in-the-loop** — the harness pauses before write actions; the CLI shows exactly what tool will run and asks `y/N`

---

<div align="center">

### 📸 CLI Startup — ForgeOps Banner

![ForgeOps CLI Banner](screenshots/cli-banner.jpg)

</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Terminal                        │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │              ForgeOps CLI (cli.mjs)              │   │
│   │                                                 │   │
│   │  • REPL prompt (forgeops>_)                     │   │
│   │  • ANSI spinner + colors                         │   │
│   │  • Streaming token display                       │   │
│   │  • Agent step tracker (Step N: ⚙ tool_name)     │   │
│   │  • Approval gate (y/N prompt)                    │   │
│   └───────────────────┬─────────────────────────────┘   │
│                       │                                 │
│                TrueForge SDK                            │
│          (@truefoundry/trueforge-sdk)                   │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │  HTTP + SSE (Server-Sent Events)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                 TrueForge Server                         │
│                 (localhost:8790)                         │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │           Agent: forgeopsv1s                     │   │
│   │                                                 │   │
│   │  ┌───────────┐  ┌────────────┐  ┌───────────┐   │   │
│   │  │  Model    │  │ GitHub MCP │  │  Sandbox  │   │   │
│   │  │ Sarvam    │  │ Connector  │  │           │   │   │
│   │  │ 105B      │  │            │  │           │   │   │
│   │  └───────────┘  └────────────┘  └───────────┘   │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   GitHub API     │
              │ (repos, issues,  │
              │  PRs, files...)  │
              └──────────────────┘
```

### Key Design Decision: Connectors Live in the Agent, Not the CLI

The CLI does **not** contain any GitHub API code, token management, or connector logic. The agent `forgeopsv1s` has everything configured in the TrueForge UI:

| Component | Configured In | What It Does |
|-----------|--------------|--------------|
| **Model** (Sarvam 105B) | TrueForge UI → Agent Settings | The LLM that generates responses |
| **GitHub MCP** | TrueForge UI → Settings → Connectors | Reads/writes repos, issues, PRs |
| **Sandbox** | TrueForge UI → Agent Settings | Isolated execution environment |
| **Skills** | TrueForge UI → Agent Settings | Specialized instruction packs |

To add/remove a connector, you change it in the TrueForge UI and re-attach it to the agent. The CLI code doesn't change.

---

<div align="center">

### 📸 TrueForge Web UI — Agent Configuration

![TrueForge Web UI](screenshots/trueforge-ui.jpg)

</div>

---

## ✨ Features

### Streaming Responses
The agent's text is streamed token-by-token — you see the response appear in real time, just like the TrueForge web UI.

### Agent Steps (Like the Web UI)
Every tool call the agent makes is displayed as a numbered step with the tool name and truncated arguments. When the result comes back, a `✓ done` or `✗ error` appears below it. At the end of the turn, a summary shows the total tool call count.

```
┌─ You
│ review the code in my test-shop repo
└─

  Step 1: ⚙ get_file_contents
         {"owner":"sumanlatanegi1982-maker","repo":"test-shop","path":""}
         ✓ done
  Step 2: ⚙ get_file_contents
         {"owner":"sumanlatanegi1982-maker","repo":"test-shop","path":"test-shop.html"}
         ✓ done
  ── 2 tool call(s) completed ──

Now I have a clear picture of the repository. Let me conduct
a thorough code review...
```

### Approval Gate
Before any irreversible action (writing files, creating issues, pushing code), the TrueForge harness pauses the turn. The CLI shows:

- The tool name (e.g., `create_or_update_file_contents`)
- The full arguments (truncated if very long)
- A `y/N` prompt

Only after you type `y` does the agent resume and execute the tool.

---

<div align="center">

### 📸 Approval Gate — CLI pauses before write actions

![Approval Flow](screenshots/approval-flow.jpg)

</div>

---

### Multi-Turn Sessions
The session persists context across turns. You can ask a follow-up question and the agent remembers the entire conversation — no need to resend history.

### Works Everywhere
- VS Code terminal
- GitHub Codespaces
- Windows CMD (with Node.js installed)
- Linux / macOS terminal

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- TrueForge running locally or in a Codespace

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/sumanlatanegi1982-maker/forgeops.git
cd forgeops

# 2. Copy env file and edit
cp .env.example .env
# Edit .env — set TRUEFORGE_BASE_URL to your TrueForge server URL

# 3. Install dependencies
npm install

# 4. Start TrueForge (in a separate terminal)
npx @truefoundry/trueforge

# 5. Run the CLI
node cli.mjs
```

You should see:

```
  ███████╗ ██████╗ ███████╗███████╗██████╗  ██████╗██╗  ██╗███████╗██████╗
  ██╔════╝██╔═══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔══██╗
  █████╗  ██║   ██║███████╗█████╗  ██████╔╝██║   ██║███████║█████╗  ██║  ██║
  ██╔══╝  ██║   ██║╚════██║██╔══╝  ██╔══██╗██║   ██║╚════██║██╔══╝  ██║  ██║
  ██║     ╚██████╔╝███████║███████╗██║  ██║╚██████╔╝███████║███████╗██████╔╝
  ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝╚═════╝
  v3.6.0 · Agent: forgeopsv1s · http://localhost:8790

✓ Connected to agent forgeopsv1s (session: a1b2c3d4e5f6...)

Type your message and press Enter. Ctrl+C to quit.

forgeops> _
```

---

## 💬 Usage

### Interactive REPL

```bash
node cli.mjs
```

Then type any message at the `forgeops>` prompt:

```
forgeops> review the code in sumanlatanegi1982-maker/test-shop and tell me what bugs you find
```

### One-Shot Mode

```bash
node cli.mjs "review the last PR in my repo"
```

### Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/quit` or `/exit` | Exit the CLI |
| `Ctrl+C` | Force quit |

---

## 🔧 Environment Variables

Create a `.env` file (or export them in your shell):

```env
# Local TrueForge (VS Code / Codespace terminal)
TRUEFORGE_BASE_URL=http://localhost:8790

# In Codespaces, TrueForge port gets forwarded — use the forwarded URL:
# TRUEFORGE_BASE_URL=https://your-codespace-name-8790.preview.app.github.dev

TRUEFORGE_AGENT=forgeopsv1s

# Only needed when OIDC login is enabled in TrueForge:
# TRUEFORGE_TOKEN=your-oidc-token
```

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUEFORGE_BASE_URL` | `http://localhost:8790` | TrueForge server URL |
| `TRUEFORGE_AGENT` | `forgeopsv1s` | Agent name in TrueForge |
| `TRUEFORGE_TOKEN` | *(empty)* | OIDC token (only when login is enabled) |

---

## 📁 Project Structure

```
forgeops/
├── cli.mjs              # The entire CLI (~400 lines, single file)
├── package.json         # Node.js dependencies
├── .env.example         # Environment variable template
├── .gitignore           # Ignores node_modules, .env
├── screenshots/         # Demo screenshots
│   ├── cli-banner.jpg   # CLI startup banner
│   ├── approval-flow.jpg # Approval gate in action
│   └── trueforge-ui.jpg # TrueForge web UI
└── README.md            # This file
```

No build step. No framework. Just one file.

---

## 🎮 Demo Tasks

Here are prompts you can try with the CLI:

### 1. Code Review (Read-Only)
```
review the code in sumanlatanegi1982-maker/test-shop and tell me what bugs you find
```
Shows: streaming, agent steps, tool calls (get_file_contents), step summary.

### 2. Fix & Write (Triggers Approval)
```
fix the bug you found and write the corrected file to the repo
```
Shows: approval gate, tool name + arguments, `y/N` prompt, resume after approval.

### 3. Create GitHub Issue (Triggers Approval)
```
create a GitHub issue in sumanlatanegi1982-maker/test-shop for each bug you found
```
Shows: second approval gate, real GitHub issue creation via MCP.

### 4. Multi-Turn Context
```
now summarize what you did and suggest 3 next steps for this repo
```
Shows: session memory — agent references previous turns without resending history.

---

## 🔐 Approval Flow

The TrueForge harness automatically pauses before tools marked as `@write` or `@destructive`. Here's the exact flow:

```
1. User sends message
   ↓
2. Agent calls a write tool (e.g., create_or_update_file_contents)
   ↓
3. TrueForge emits tool.approval_required event
   ↓
4. CLI shows: ⚠ Approval Required + tool name + arguments
   ↓
5. User types y (allow) or N (deny)
   ↓
6. CLI sends approval: { approval: { status: "allow" } }
   ↓
7. TrueForge resumes the turn
   ↓
8. Agent executes the tool and continues
```

The approval payload follows the [TrueForge SDK specification](https://www.truefoundry.com/docs/agent-platform/agent-harness/sdk/runtime-api-reference#usertoolapprovalevent):

```json
{
  "type": "user.tool_approval",
  "threadId": "main",
  "toolCallId": "call_xxx",
  "approval": { "status": "allow" }
}
```

---

## 🔍 Qodo PR Reviews

This project uses [Qodo](https://app.qodo.ai) for automated code review on all pull requests. Qodo was set up from day one as required by the hackathon rules.

| PR | Title | Status | Qodo Review |
|----|-------|--------|-------------|
| [#1](https://github.com/sumanlatanegi1982-maker/forgeops/pull/1) | Initial CLI implementation | ✅ Merged | [Reviewed by Qodo](https://github.com/sumanlatanegi1982-maker/forgeops/pull/1) |
| [#2](https://github.com/sumanlatanegi1982-maker/forgeops/pull/2) | Approval flow & streaming fixes | ✅ Merged | [Reviewed by Qodo](https://github.com/sumanlatanegi1982-maker/forgeops/pull/2) |
| [#3](https://github.com/sumanlatanegi1982-maker/forgeops/pull/3) | Node.js CLI with TrueForge SDK | ✅ Merged | [Reviewed by Qodo](https://github.com/sumanlatanegi1982-maker/forgeops/pull/3) |

---

## 🛠️ Troubleshooting

### "Could not connect to TrueForge"
Make sure the TrueForge server is running:
```bash
npx @truefoundry/trueforge
```

### GitHub MCP returns 403
The GitHub token in your TrueForge connector needs `repo` scope. Go to **TrueForge UI → Settings → Connectors → GitHub MCP** and update the token.

### Agent is slow to respond
The Sarvam 105B model takes 30–60 seconds for the first token. The spinner shows the agent is working — just wait.

### Approval 422 error
Make sure you're on the latest version:
```bash
git fetch origin && git reset --hard origin/main
```

---

## 🏆 Built For

<div align="center">

**[WeMakeDevs Agent Harness Hackathon](https://wemakedevs.org)**

August 24–30, 2026

Categories: **Code Review Agent** · **Approval-Gated Assistant**

</div>

---

## 📋 Submission Checklist

- [x] Agent running on TrueForge with harness doing approvals
- [x] Public GitHub repo with clean code
- [x] CLI shows agent steps (tool calls) like the web UI
- [x] Approval gate before irreversible actions
- [x] Qodo PR review (PRs #1, #2, #3)
- [x] Demo video — [Watch on YouTube](https://youtu.be/JEb6dS337SM)

---

<div align="center">

**ForgeOps** — Built by [Raghav Negi](https://github.com/sumanlatanegi1982-maker)

</div>
