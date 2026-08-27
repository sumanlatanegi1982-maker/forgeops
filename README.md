# ForgeOps CLI

A beautiful terminal agent for **code review** and **incident debugging**, built for the [WeMakeDevals TrueForge Hackathon](https://www.wemakedevs.org/hackathons/trueforge).

ForgeOps is a Python CLI that connects to [TrueForge](https://trueforge.dev) and uses the **Sarvam 105B** model to review pull requests, debug incidents, and analyze code — all from your terminal with a rich, colorful interface.

## ✨ Features

- **Two modes**: TrueForge mode (GitHub MCP, sandbox, approvals) and Local mode (read your own files)
- **Rich terminal UI**: Colored panels, syntax highlighting, markdown rendering
- **Streaming responses**: See the agent's reply token-by-token as it's generated
- **Tool call visualization**: Each tool call shows as a panel with arguments and results
- **Approval gate**: Interactive y/n prompt before any write/destructive action
- **Local file access**: Read files, list directories, search code, run shell commands
- **Slash commands**: `/file`, `/ls`, `/tree`, `/grep`, `/run`, `/pr`, `/help`

## 🚀 Quick Start

### Prerequisites

1. Python 3.10+
2. TrueForge running locally (`npx @truefoundry/trueforge`) or in Codespaces
3. Sarvam 105B model configured in TrueForge

### Install

```bash
git clone https://github.com/sumanlatanegi1982-maker/forgeops.git
cd forgeops
pip install -r requirements.txt
```

### Run

```bash
# Interactive REPL (connects to TrueForge at localhost:8790)
python forgeops.py

# One-shot prompt
python forgeops.py "Review PR #1 in sumanlatanegi1982-maker/forgeops"

# Local file mode (no TrueForge needed)
python forgeops.py --local

# Include a file in context
python forgeops.py --file src/main.py "review this code for bugs"

# Custom TrueForge URL (e.g. GitHub Codespaces)
python forgeops.py --url https://your-codespace-8790.app.github.dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUEFORGE_BASE_URL` | `http://localhost:8790` | TrueForge server URL |
| `FORGEOPS_MODEL` | `sarvam-105b/sarvam-105b` | Model FQN (provider/model) |

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/file <path>` | Read a local file into context |
| `/ls <dir>` | List directory contents |
| `/tree <dir>` | Show directory tree |
| `/grep <pattern> <path>` | Search for pattern in files |
| `/run <cmd>` | Run a shell command |
| `/pr <url>` | Review a GitHub PR |
| `/model` | Show current model |
| `/status` | Show session status |
| `/clear` | Clear screen |
| `/quit` | Exit |

## 🏗️ Architecture

```
forgeops.py          ← Single-file CLI (no build step, no frontend)
├── TrueForgeClient  ← REST + SSE client (httpx, no SDK dependency)
├── LocalFileTools   ← File system access (read, list, tree, grep, run)
└── ForgeOpsCLI       ← Main REPL with Rich terminal UI
```

The CLI talks to TrueForge's REST API directly:
- `POST /api/v1/sessions` — create session with inline agent spec
- `POST /api/v1/sessions/{id}/turns` — stream a turn via SSE

## 🎯 Use Cases

### Code Review
```
forgeops> Review PR #1 in sumanlatanegi1982-maker/forgeops
```
The agent fetches the PR diff via GitHub MCP, analyzes the changes, and provides a structured review.

### Incident Debugging
```
forgeops> Payment failures are spiking since the last deploy. Investigate.
```
The agent fetches recent commits, analyzes logs, and identifies the root cause.

### Local File Analysis
```
forgeops> /file src/main.py
forgeops> /file src/utils.py
forgeops> Check these files for potential memory leaks
```

## 🔧 Tech Stack

- **Python 3** — no compilation, no build step
- **[Rich](https://rich.readthedocs.io)** — beautiful terminal formatting
- **[httpx](https://www.python-httpx.org)** — HTTP client with SSE streaming
- **TrueForge** — agent harness with Sarvam 105B model
- **GitHub MCP** — pull request access
- **Daytona** — sandbox execution

## 📄 License

MIT
