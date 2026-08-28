#!/usr/bin/env python3
"""
ForgeOps CLI — A beautiful terminal agent for code review and incident debugging.
Built for the WeMakeDevals TrueForge Hackathon.

Works in three modes:
  1. TrueForge mode: Uses TrueForge agent with Sarvam 105B
  2. GitHub mode: Direct GitHub API access (read PRs, write files) — no TrueForge needed
  3. Local mode: Reads/writes files on your computer

Usage:
  python forgeops.py                              # Interactive REPL
  python forgeops.py "review PR #1"               # One-shot prompt
  python forgeops.py --local "explain main.py"    # Local file mode
  python forgeops.py --github TOKEN owner/repo    # GitHub mode

Requirements:
  pip install rich httpx
"""

import sys
import os
import json
import time
import argparse
import subprocess
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional

try:
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.table import Table
    from rich.prompt import Prompt
    from rich.text import Text
    from rich.live import Live
    from rich.spinner import Spinner
    from rich.syntax import Syntax
    from rich.tree import Tree
    from rich import box
    from rich.align import Align
    from rich.columns import Columns
    from rich.padding import Padding
    RICH_AVAILABLE = True
except ImportError:
    print("Installing required packages...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rich", "httpx", "-q"])
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.table import Table
    from rich.prompt import Prompt
    from rich.text import Text
    from rich.live import Live
    from rich.spinner import Spinner
    from rich.syntax import Syntax
    from rich.tree import Tree
    from rich import box
    from rich.align import Align
    from rich.columns import Columns
    from rich.padding import Padding
    RICH_AVAILABLE = True

try:
    import httpx
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx", "-q"])
    import httpx

console = Console()

# ─── Configuration ───────────────────────────────────────────────────────────

DEFAULT_TRUEFORGE_URL = os.environ.get("TRUEFORGE_BASE_URL", "http://localhost:8790")
MODEL_FQN = os.environ.get("FORGEOPS_MODEL", "sarvam-105b/sarvam-105b")
VERSION = "2.0.0"
CONFIG_FILE = os.path.expanduser("~/.forgeops_config.json")

BANNER = r"""
 ███████╗ ██████╗ ███████╗███████╗██████╗  ██████╗██╗  ██╗███████╗██████╗
 ██╔════╝██╔═══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔══██╗
 █████╗  ██║   ██║███████╗█████╗  ██████╔╝██║   ██║███████║█████╗  ██║  ██║
 ██╔══╝  ██║   ██║╚════██║██╔══╝  ██╔══██╗██║   ██║╚════██║██╔══╝  ██║  ██║
 ██║     ╚██████╔╝███████║███████╗██║  ██║╚██████╔╝███████║███████╗██████╔╝
 ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝╚═════╝
"""

# ─── Colors ─────────────────────────────────────────────────────────────────

C_PROMPT = "#b4a0ff"
C_THINK = "#7dd3c0"
C_TOOL = "#e0b34a"
C_DONE = "#6fcf97"
C_ERROR = "#ef6b6b"
C_APPROVAL = "#f97316"
C_DIM = "#55555c"
C_ACCENT = "#a3a3ff"


# ─── Config persistence ──────────────────────────────────────────────────────

def save_config(config: dict):
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception:
        pass

def load_config() -> dict:
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


# ─── GitHub Direct API ───────────────────────────────────────────────────────

class GitHubAPI:
    """Direct GitHub API access — no TrueForge MCP needed."""

    def __init__(self, token: str = "", repo: str = ""):
        self.token = token
        self.repo = repo
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        } if token else {}
        self.client = httpx.Client(timeout=30.0, headers=self.headers)

    def set_repo(self, repo: str):
        self.repo = repo

    def get_pr(self, pr_number: int) -> dict:
        url = f"https://api.github.com/repos/{self.repo}/pulls/{pr_number}"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        return resp.json()

    def get_pr_diff(self, pr_number: int) -> str:
        url = f"https://api.github.com/repos/{self.repo}/pulls/{pr_number}"
        resp = self.client.get(url, headers={**self.headers, "Accept": "application/vnd.github.v3.diff"})
        if resp.status_code != 200:
            return f"Error fetching diff: HTTP {resp.status_code}"
        return resp.text

    def get_pr_files(self, pr_number: int) -> list:
        url = f"https://api.github.com/repos/{self.repo}/pulls/{pr_number}/files"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return []
        return resp.json()

    def get_file(self, path: str, branch: str = "main") -> str:
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={branch}"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return f"Error: HTTP {resp.status_code} - {resp.text[:200]}"
        data = resp.json()
        if data.get("encoding") == "base64":
            import base64
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return data.get("content", "")

    def create_or_update_file(self, path: str, content: str, message: str, branch: str = "main") -> dict:
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}"
        sha = None
        check = self.client.get(f"{url}?ref={branch}")
        if check.status_code == 200:
            sha = check.json().get("sha")
        import base64
        payload = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        resp = self.client.put(url, json=payload)
        if resp.status_code in (200, 201):
            return {"success": True, "url": resp.json().get("content", {}).get("html_url", "")}
        return {"error": f"HTTP {resp.status_code}: {resp.text[:300]}"}

    def list_prs(self, state: str = "open") -> list:
        url = f"https://api.github.com/repos/{self.repo}/pulls?state={state}&per_page=10"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return []
        return resp.json()

    def get_repo_info(self) -> dict:
        url = f"https://api.github.com/repos/{self.repo}"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}
        return resp.json()

    def list_contents(self, path: str = "", branch: str = "main") -> list:
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={branch}"
        resp = self.client.get(url)
        if resp.status_code != 200:
            return []
        data = resp.json()
        if isinstance(data, list):
            return data
        return [data]


# ─── TrueForge API Client ────────────────────────────────────────────────────

AGENT_SPEC = {
    "model": {"name": MODEL_FQN},
    "instructions": """You are ForgeOps, a software engineering agent that does two jobs:

1. Code Review: When given a pull request URL or number, fetch the PR diff and changed files via the GitHub MCP. Read the surrounding code for context. Analyze the code for bugs, security issues, and logic errors. Provide a structured review summarizing findings.

2. Incident Debugging: When given an incident alert or bug report, fetch recent deploys and relevant code via the GitHub MCP. Analyze logs and test outputs. Identify the root cause. Propose a fix or rollback.

Rules:
- Show your reasoning at each step
- If you find multiple issues, prioritise by severity
- Keep explanations clear and actionable
- For local file questions, the user will provide file contents in the prompt""",
    "mcp_servers": [
        {"name": "github", "enable_tools": ["@all"], "require_approval_for_tools": ["@write", "@destructive"]},
    ],
    "config": {
        "sandbox": {"enabled": True, "file_downloads": True},
        "iteration_limit": 50,
    },
}


class TrueForgeClient:
    """Minimal TrueForge HTTP client using REST + SSE."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=httpx.Timeout(600.0, connect=10.0))

    def create_session(self) -> Optional[str]:
        try:
            resp = self.client.post(
                f"{self.base_url}/api/v1/sessions",
                json={"agent": {"spec": AGENT_SPEC}},
            )
            if resp.status_code not in (200, 201):
                console.print(f"[{C_ERROR}]Session creation failed (HTTP {resp.status_code})[/]")
                try:
                    err_data = resp.json()
                    console.print(f"[{C_ERROR}]Error detail:[/] {json.dumps(err_data, indent=2)[:1000]}")
                except Exception:
                    console.print(f"[{C_ERROR}]Response body:[/] {resp.text[:1000]}")
                return None
            data = resp.json()
            session_id = data.get("id") or data.get("data", {}).get("id")
            return session_id
        except Exception as e:
            console.print(f"[{C_ERROR}]Failed to create session:[/] {e}")
            return None

    def stream_turn(self, session_id: str, content: str):
        payload = {
            "input": [{"type": "user.message", "content": content}],
        }
        try:
            with self.client.stream(
                "POST",
                f"{self.base_url}/api/v1/sessions/{session_id}/turns",
                json=payload,
                timeout=httpx.Timeout(600.0, connect=10.0),
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            event = json.loads(data_str)
                            yield event
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield {"type": "error", "message": str(e)}

    def approve_tool(self, session_id: str, allow: bool, reason: str = ""):
        payload = {
            "input": [
                {
                    "type": "user.tool_approval",
                    "allow": allow,
                    **({"reason": reason} if reason else {}),
                }
            ],
        }
        try:
            with self.client.stream(
                "POST",
                f"{self.base_url}/api/v1/sessions/{session_id}/turns",
                json=payload,
                timeout=httpx.Timeout(600.0, connect=10.0),
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        try:
                            event = json.loads(line[6:])
                            yield event
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield {"type": "error", "message": str(e)}


# ─── Local File Tools ────────────────────────────────────────────────────────

class LocalFileTools:
    """Provides local file access for the CLI."""

    @staticmethod
    def read_file(path: str) -> str:
        try:
            p = Path(path).expanduser()
            if not p.exists():
                return f"Error: File not found: {p}"
            if p.is_dir():
                return LocalFileTools.list_dir(str(p))
            content = p.read_text(encoding="utf-8", errors="replace")
            return content
        except Exception as e:
            return f"Error reading file: {e}"

    @staticmethod
    def list_dir(path: str = ".") -> str:
        try:
            p = Path(path).expanduser()
            if not p.exists():
                return f"Error: Directory not found: {p}"
            entries = []
            for item in sorted(p.iterdir()):
                prefix = "📁 " if item.is_dir() else "📄 "
                size = ""
                if item.is_file():
                    try:
                        size = f" ({item.stat().st_size:,} bytes)"
                    except:
                        pass
                entries.append(f"{prefix}{item.name}{size}")
            return "\n".join(entries)
        except Exception as e:
            return f"Error listing directory: {e}"

    @staticmethod
    def tree(path: str = ".", max_depth: int = 3) -> str:
        try:
            p = Path(path).expanduser()
            if not p.exists():
                return f"Error: Path not found: {p}"
            lines = []
            for root, dirs, files in os.walk(p):
                depth = root.replace(str(p), "").count(os.sep)
                if depth > max_depth:
                    continue
                indent = "  " * depth
                lines.append(f"{indent}📁 {os.path.basename(root) or root}/")
                if depth < max_depth:
                    for f in sorted(files)[:20]:
                        lines.append(f"{indent}  📄 {f}")
            return "\n".join(lines)
        except Exception as e:
            return f"Error generating tree: {e}"

    @staticmethod
    def grep(pattern: str, path: str = ".") -> str:
        try:
            result = subprocess.run(
                ["grep", "-rn", "--include=*.*", pattern, path],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                output = result.stdout
                return output[:5000] if len(output) > 5000 else output
            return f"No matches for '{pattern}' in {path}"
        except Exception as e:
            return f"Error searching: {e}"

    @staticmethod
    def run_command(cmd: str) -> str:
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=30
            )
            output = ""
            if result.stdout:
                output += result.stdout
            if result.stderr:
                output += "\n[stderr]\n" + result.stderr
            output += f"\n[exit code: {result.returncode}]"
            return output[:10000]
        except subprocess.TimeoutExpired:
            return "Command timed out after 30 seconds"
        except Exception as e:
            return f"Error: {e}"


# ─── CLI UI ──────────────────────────────────────────────────────────────────

def print_banner():
    console.print(Text(BANNER, style=f"bold {C_ACCENT}"))
    console.print(Align.center(Text(f"  ForgeOps CLI v{VERSION}  ·  TrueForge Hackathon  ", style=f"bold white on {C_ACCENT}")))
    console.print()


def print_help():
    help_table = Table(title="Commands", box=box.ROUNDED, border_style=C_DIM, title_style=f"bold {C_ACCENT}")
    help_table.add_column("Command", style=f"bold {C_ACCENT}", width=25)
    help_table.add_column("Description", style="white", width=55)
    help_table.add_row("/help", "Show this help")
    help_table.add_row("/file <path>", "Read a local file into context")
    help_table.add_row("/ls [dir]", "List directory contents")
    help_table.add_row("/tree [dir]", "Show directory tree")
    help_table.add_row("/grep <pattern> [path]", "Search for pattern in files")
    help_table.add_row("/run <cmd>", "Run a shell command")
    help_table.add_row("", "")
    help_table.add_row("/connect <token>", "Set GitHub token for direct API access")
    help_table.add_row("/repo <owner/repo>", "Set active GitHub repo")
    help_table.add_row("/prs", "List open PRs in the repo")
    help_table.add_row("/pr <number>", "Fetch and review a PR")
    help_table.add_row("/ghfile <path>", "Read a file from GitHub repo")
    help_table.add_row("/ghwrite <path> <msg>", "Write file to GitHub (needs approval)")
    help_table.add_row("/ghls [path]", "List GitHub repo contents")
    help_table.add_row("", "")
    help_table.add_row("/model", "Show current model")
    help_table.add_row("/status", "Show session status")
    help_table.add_row("/clear", "Clear the screen")
    help_table.add_row("/quit", "Exit ForgeOps")
    console.print(help_table)


def print_welcome(model: str, mode: str, github_connected: bool = False):
    info = Table(box=box.SIMPLE, show_header=False, border_style=C_DIM)
    info.add_column("Key", style=f"bold {C_DIM}", width=15)
    info.add_column("Value", style="white")
    info.add_row("Version", VERSION)
    info.add_row("Model", model)
    info.add_row("Mode", mode)
    info.add_row("GitHub API", "✅ Connected" if github_connected else "❌ Not connected (/connect)")
    if mode == "TrueForge":
        info.add_row("TrueForge", DEFAULT_TRUEFORGE_URL)
    console.print(Panel(info, title="[bold]Session Info[/]", border_style=C_ACCENT, padding=(1, 2)))


def print_tool_call(tool_name: str, args: str = ""):
    console.print()
    icon = "🔧"
    console.print(
        Panel(
            f"[bold {C_TOOL}]{icon} {tool_name}[/]\n[dim]{args}[/]" if args else f"[bold {C_TOOL}]{icon} {tool_name}[/]",
            border_style=C_TOOL,
            padding=(0, 1),
            title=f"[{C_TOOL}]tool.call[/]",
            title_align="left",
        )
    )


def print_tool_result(result: str, status: str = "done"):
    color = C_DONE if status == "done" else C_ERROR
    icon = "✅" if status == "done" else "❌"
    truncated = result[:800] + "..." if len(result) > 800 else result
    console.print(
        Panel(
            f"[{color}]{icon} Result[/]\n[dim]{truncated}[/]",
            border_style=color,
            padding=(0, 1),
            title=f"[{color}]tool.result[/]",
            title_align="left",
        )
    )


def print_approval(tool_name: str, tool_args: str):
    console.print()
    console.print(
        Panel(
            f"[bold {C_APPROVAL}]⚠️  Approval Required[/]\n\n"
            f"[white]Tool:[/] [bold]{tool_name}[/]\n"
            f"[white]Args:[/] [dim]{tool_args[:300]}[/]\n\n"
            f"[{C_APPROVAL}]This is a write/destructive action.[/]",
            border_style=C_APPROVAL,
            padding=(1, 2),
            title=f"[{C_APPROVAL}]Approval Gate[/]",
            title_align="left",
        )
    )


def print_agent_response(text: str):
    console.print()
    console.print(
        Panel(
            Markdown(text) if RICH_AVAILABLE else text,
            border_style=C_DONE,
            padding=(1, 2),
            title="[bold green]🤖 Agent Response[/]",
            title_align="left",
        )
    )


def print_error(msg: str):
    console.print()
    console.print(
        Panel(
            f"[bold {C_ERROR}]❌ Error[/]\n\n[white]{msg}[/]",
            border_style=C_ERROR,
            padding=(1, 2),
        )
    )


def print_step(step_type: str, text: str):
    icons = {
        "think": ("💭", C_THINK),
        "tool": ("🔧", C_TOOL),
        "done": ("✅", C_DONE),
        "error": ("❌", C_ERROR),
        "approval": ("⚠️", C_APPROVAL),
        "info": ("ℹ️", C_ACCENT),
    }
    icon, color = icons.get(step_type, ("•", C_DIM))
    console.print(f"  [{color}]{icon} {text}[/]")


# ─── Main CLI ────────────────────────────────────────────────────────────────

class ForgeOpsCLI:
    def __init__(self, base_url: str, local_mode: bool = False):
        self.base_url = base_url
        self.local_mode = local_mode
        self.mode = "Local" if local_mode else "TrueForge"
        self.tf_client: Optional[TrueForgeClient] = None
        self.session_id: Optional[str] = None
        self.local_tools = LocalFileTools()
        self.github: Optional[GitHubAPI] = None
        self.step_count = 0
        self.context_files: list = []

        config = load_config()
        if config.get("github_token"):
            self.github = GitHubAPI(token=config["github_token"], repo=config.get("github_repo", ""))
        if config.get("trueforge_url"):
            self.base_url = config["trueforge_url"]

    def init_trueforge(self) -> bool:
        if self.local_mode:
            return True
        console.print(f"  [{C_DIM}]Connecting to TrueForge at {self.base_url}...[/]", end="")
        try:
            self.tf_client = TrueForgeClient(self.base_url)
            console.print(f" [{C_DONE}]✓[/]")
            return True
        except Exception as e:
            console.print(f" [{C_ERROR}]✗[/]")
            print_error(str(e))
            return False

    def create_session(self) -> bool:
        if self.local_mode:
            return True
        console.print(f"  [{C_DIM}]Creating session...[/]", end="")
        self.session_id = self.tf_client.create_session()
        if self.session_id:
            console.print(f" [{C_DONE}]✓[/]")
            console.print(f"  [{C_DIM}]Session: {self.session_id[:12]}...[/]")
            return True
        else:
            console.print(f" [{C_ERROR}]✗[/]")
            return False

    def process_trueforge_event(self, event: dict) -> tuple:
        etype = event.get("type", "")

        if etype == "model.message.delta":
            content = event.get("content", "")
            if content:
                console.print(content, end="", style="white")
            return (True, None)

        elif etype == "tool.call":
            tool_name = event.get("toolName") or "unknown"
            tool_args_raw = event.get("toolArguments") or {}
            tool_args = json.dumps(tool_args_raw, indent=2)[:300]
            print_tool_call(tool_name, tool_args)
            self.step_count += 1
            return (True, None)

        elif etype == "tool.result":
            result = str(event.get("toolResult", ""))
            state = event.get("state") or {}
            status = state.get("status", "done") if isinstance(state, dict) else "done"
            print_tool_result(result, status)
            return (True, None)

        elif etype == "tool.approval_required":
            tool_name = event.get("toolName") or "unknown"
            tool_args_raw = event.get("toolArguments") or {}
            tool_args = json.dumps(tool_args_raw, indent=2)[:300]
            print_approval(tool_name, tool_args)
            return (True, {"tool": tool_name, "args": tool_args, "event": event})

        elif etype == "turn.done":
            state = event.get("state") or {}
            status = state.get("status", "done") if isinstance(state, dict) else "done"
            if status == "error":
                print_error("Agent turn ended with an error.")
            return (False, None)

        elif etype == "error":
            msg = event.get("message") or "Unknown error"
            print_error(msg)
            return (False, None)

        elif etype == "sandbox.created":
            sandbox_id = event.get("sandboxId") or "?"
            print_step("info", f"Sandbox created: {str(sandbox_id)[:20]}...")
            return (True, None)

        elif etype == "thread.created":
            title = event.get("title") or "subagent"
            print_step("info", f"Subagent thread: {title}")
            return (True, None)

        return (True, None)

    def send_trueforge(self, content: str) -> bool:
        if not self.session_id:
            console.print(f"[{C_ERROR}]No active session.[/]")
            return False

        console.print()
        console.print(f"[{C_PROMPT}]┌─ You[/]")
        console.print(f"[{C_PROMPT}]│[/] {content}")
        console.print(f"[{C_PROMPT}]└─[/]")
        console.print()

        approval_needed = None
        full_response = ""
        has_streamed = False

        try:
            with console.status("[bold cyan]⠹ Agent thinking...", spinner="dots"):
                for event in self.tf_client.stream_turn(self.session_id, content):
                    etype = event.get("type", "")

                    should_cont, approval = self.process_trueforge_event(event)

                    if etype == "model.message.delta":
                        has_streamed = True
                        full_response += event.get("content", "")

                    if approval:
                        approval_needed = approval

                    if not should_cont:
                        break

            if approval_needed:
                console.print()
                choice = Prompt.ask(
                    f"[{C_APPROVAL}]Allow this action?[/]",
                    choices=["y", "n"],
                    default="y",
                )
                allow = choice == "y"
                reason = "" if allow else "Denied by user"

                console.print(f"  [{C_DIM}]Sending {'approval' if allow else 'denial'}...[/]")
                with console.status("[bold cyan]⠹ Processing approval...", spinner="dots"):
                    for event in self.tf_client.approve_tool(self.session_id, allow, reason):
                        should_cont, _ = self.process_trueforge_event(event)
                        if event.get("type") == "model.message.delta":
                            has_streamed = True
                            full_response += event.get("content", "")
                        if not should_cont:
                            break

            console.print()

            if not has_streamed and full_response:
                print_agent_response(full_response)

            console.print()
            console.print(f"  [{C_DIM}]── {self.step_count} steps completed ──[/]")
            return True

        except KeyboardInterrupt:
            console.print(f"\n  [{C_ERROR}]Interrupted.[/]")
            return False
        except Exception as e:
            print_error(str(e))
            return False

    def send_local(self, content: str) -> bool:
        console.print()
        console.print(f"[{C_PROMPT}]┌─ You[/]")
        console.print(f"[{C_PROMPT}]│[/] {content}")
        console.print(f"[{C_PROMPT}]└─[/]")
        console.print()

        file_context = ""
        if self.context_files:
            file_context = "\n\n--- File Context ---\n"
            for f in self.context_files:
                file_context += f"\n[File: {f['path']}]\n{f['content'][:5000]}\n"

        if content.lower().strip().startswith("/"):
            return self.handle_slash_command(content)

        if self.tf_client and self.session_id:
            full_prompt = content
            if file_context:
                full_prompt = f"{content}\n\nHere are the relevant files:\n{file_context}"
                self.context_files = []
            return self.send_trueforge(full_prompt)

        if file_context:
            console.print(f"[{C_THINK}]File context loaded. Use /connect to enable GitHub, or start TrueForge for AI analysis.[/]")
        else:
            console.print(f"[{C_THINK}]No AI backend connected. Here's what you can do:[/]")
            console.print(f"  [{C_ACCENT}]/connect <token>[/]  — Connect GitHub API directly")
            console.print(f"  [{C_ACCENT}]/file <path>[/]   — Read a local file")
            console.print(f"  [{C_ACCENT}]/ls <dir>[/]     — List directory")
            console.print(f"  [{C_ACCENT}]/tree <dir>[/]   — Show file tree")
            console.print(f"  [{C_ACCENT}]/grep <pat>[/]   — Search in files")
            console.print(f"  [{C_ACCENT}]/run <cmd>[/]    — Run a shell command")
            console.print(f"  [{C_DIM}]Or start TrueForge: npx @truefoundry/trueforge[/]")
        console.print()
        return True

    def handle_slash_command(self, cmd: str) -> bool:
        parts = cmd.strip().split(None, 1)
        command = parts[0].lower()
        args = parts[1] if len(parts) > 1 else ""

        if command == "/help":
            print_help()
            return True

        elif command == "/file":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /file <path>[/]")
                return True
            content = self.local_tools.read_file(args)
            self.context_files.append({"path": args, "content": content})
            lines = content.split("\n")
            preview = "\n".join(lines[:30])
            if len(lines) > 30:
                preview += f"\n... ({len(lines)} lines total)"
            syntax_lang = "python" if args.endswith(".py") else "javascript" if args.endswith(".js") else "text"
            console.print(
                Panel(
                    Syntax(preview, syntax_lang, theme="monokai", line_numbers=True) if RICH_AVAILABLE else preview,
                    title=f"[bold {C_ACCENT}]📄 {args}[/]",
                    border_style=C_ACCENT,
                    padding=(0, 1),
                )
            )
            console.print(f"  [{C_DIM}]File loaded into context ({len(content):,} chars)[/]")
            return True

        elif command == "/ls":
            path = args or "."
            result = self.local_tools.list_dir(path)
            console.print(
                Panel(
                    result,
                    title=f"[bold {C_ACCENT}]📁 {path}[/]",
                    border_style=C_ACCENT,
                    padding=(0, 1),
                )
            )
            return True

        elif command == "/tree":
            path = args or "."
            result = self.local_tools.tree(path)
            console.print(
                Panel(
                    result,
                    title=f"[bold {C_ACCENT}]🌳 {path}[/]",
                    border_style=C_ACCENT,
                    padding=(0, 1),
                )
            )
            return True

        elif command == "/grep":
            grep_parts = args.split(None, 1)
            if not grep_parts:
                console.print(f"[{C_ERROR}]Usage: /grep <pattern> [path][/]")
                return True
            pattern = grep_parts[0]
            path = grep_parts[1] if len(grep_parts) > 1 else "."
            result = self.local_tools.grep(pattern, path)
            console.print(
                Panel(
                    result,
                    title=f"[bold {C_ACCENT}]🔍 grep '{pattern}' in {path}[/]",
                    border_style=C_ACCENT,
                    padding=(0, 1),
                )
            )
            return True

        elif command == "/run":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /run <command>[/]")
                return True
            console.print(f"  [{C_TOOL}]⚙️ Running: {args}[/]")
            result = self.local_tools.run_command(args)
            console.print(
                Panel(
                    result,
                    title=f"[bold {C_TOOL}]⚡ {args}[/]",
                    border_style=C_TOOL,
                    padding=(0, 1),
                )
            )
            return True

        elif command == "/connect":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /connect <github-token>[/]")
                console.print(f"[{C_DIM}]Get a token from: https://github.com/settings/tokens (needs 'repo' scope)[/]")
                return True
            self.github = GitHubAPI(token=args)
            with console.status("[bold cyan]Testing GitHub token...", spinner="dots"):
                resp = self.github.client.get("https://api.github.com/user")
            if resp.status_code == 200:
                username = resp.json().get("login", "?")
                console.print(f"  [{C_DONE}]✓ GitHub connected as @{username}[/]")
                save_config({**load_config(), "github_token": args})
            else:
                console.print(f"  [{C_ERROR}]✗ Token invalid (HTTP {resp.status_code})[/]")
                self.github = None
            return True

        elif command == "/repo":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /repo <owner/repo>[/]")
                return True
            if not self.github:
                console.print(f"[{C_ERROR}]Not connected. Run /connect <token> first.[/]")
                return True
            self.github.set_repo(args)
            save_config({**load_config(), "github_repo": args})
            with console.status(f"[bold cyan]Checking repo {args}...", spinner="dots"):
                info = self.github.get_repo_info()
            if "error" in info:
                console.print(f"  [{C_ERROR}]✗ {info['error']}[/]")
            else:
                console.print(f"  [{C_DONE}]✓ Repo: {info.get('full_name', args)}[/]")
                console.print(f"  [{C_DIM}]Stars: {info.get('stargazers_count', 0)} · Forks: {info.get('forks_count', 0)} · Default branch: {info.get('default_branch', 'main')}[/]")
            return True

        elif command == "/prs":
            if not self.github or not self.github.repo:
                console.print(f"[{C_ERROR}]Connect first: /connect <token> then /repo <owner/repo>[/]")
                return True
            with console.status("[bold cyan]Fetching PRs...", spinner="dots"):
                prs = self.github.list_prs()
            if not prs:
                console.print(f"  [{C_DIM}]No open PRs found.[/]")
                return True
            pr_table = Table(title="Open Pull Requests", box=box.ROUNDED, border_style=C_ACCENT)
            pr_table.add_column("#", style="bold", width=6)
            pr_table.add_column("Title", style="white", width=40)
            pr_table.add_column("Author", style=C_DIM, width=15)
            pr_table.add_column("Branch", style=C_THINK, width=20)
            for pr in prs:
                pr_table.add_row(
                    str(pr.get("number", "?")),
                    pr.get("title", "?")[:40],
                    pr.get("user", {}).get("login", "?"),
                    pr.get("head", {}).get("ref", "?")[:20],
                )
            console.print(pr_table)
            return True

        elif command == "/pr":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /pr <number>[/]")
                return True
            if not self.github or not self.github.repo:
                console.print(f"[{C_ERROR}]Connect first: /connect <token> then /repo <owner/repo>[/]")
                return True
            try:
                pr_num = int(args.strip())
            except ValueError:
                console.print(f"[{C_ERROR}]PR number must be a number, e.g. /pr 5[/]")
                return True

            with console.status(f"[bold cyan]Fetching PR #{pr_num}...", spinner="dots"):
                pr = self.github.get_pr(pr_num)
                diff = self.github.get_pr_diff(pr_num)
                files = self.github.get_pr_files(pr_num)

            if "error" in pr:
                print_error(pr["error"])
                return True

            pr_table = Table(title=f"PR #{pr_num}", box=box.ROUNDED, border_style=C_ACCENT)
            pr_table.add_column("Field", style=f"bold {C_ACCENT}", width=15)
            pr_table.add_column("Value", style="white", width=50)
            pr_table.add_row("Title", pr.get("title", "?"))
            pr_table.add_row("Author", pr.get("user", {}).get("login", "?"))
            pr_table.add_row("State", pr.get("state", "?"))
            pr_table.add_row("Branch", f"{pr.get('head', {}).get('ref', '?')} → {pr.get('base', {}).get('ref', '?')}")
            pr_table.add_row("Changed files", str(len(files)))
            pr_table.add_row("Additions", f"+{pr.get('additions', 0)}")
            pr_table.add_row("Deletions", f"-{pr.get('deletions', 0)}")
            console.print(pr_table)

            if files:
                file_table = Table(title="Changed Files", box=box.SIMPLE, border_style=C_DIM)
                file_table.add_column("File", style="white", width=40)
                file_table.add_column("Status", style=C_TOOL, width=10)
                file_table.add_column("+/-", style=C_DIM, width=10)
                for f in files[:15]:
                    file_table.add_row(
                        f.get("filename", "?")[:40],
                        f.get("status", "?"),
                        f"+{f.get('additions', 0)}/-{f.get('deletions', 0)}",
                    )
                console.print(file_table)

            if diff:
                console.print(
                    Panel(
                        Syntax(diff[:5000], "diff", theme="monokai", line_numbers=False) if RICH_AVAILABLE else diff[:5000],
                        title=f"[bold {C_ACCENT}]📝 Diff (first 5000 chars)[/]",
                        border_style=C_ACCENT,
                        padding=(0, 1),
                    )
                )

            if self.tf_client and self.session_id:
                console.print(f"\n  [{C_THINK}]Sending to Sarvam for review...[/]")
                review_prompt = f"""Review PR #{pr_num} in repo {self.github.repo}.

PR Title: {pr.get('title', '?')}
PR Body: {pr.get('body', 'N/A')[:1000]}

Changed files:
{json.dumps([{'file': f.get('filename'), 'status': f.get('status'), 'additions': f.get('additions'), 'deletions': f.get('deletions')} for f in files], indent=2)}

Diff:
{diff[:8000]}

Provide a structured code review covering:
1. Summary of changes
2. Potential bugs or issues
3. Security concerns
4. Suggestions for improvement
"""
                return self.send_trueforge(review_prompt)
            else:
                console.print(f"\n  [{C_THINK}]Raw PR data shown above. Connect TrueForge for AI-powered review.[/]")
            return True

        elif command == "/ghfile":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /ghfile <path>[/]")
                return True
            if not self.github or not self.github.repo:
                console.print(f"[{C_ERROR}]Connect first: /connect <token> then /repo <owner/repo>[/]")
                return True
            with console.status(f"[bold cyan]Fetching {args}...", spinner="dots"):
                content = self.github.get_file(args)
            if content.startswith("Error:"):
                print_error(content)
                return True
            self.context_files.append({"path": f"github:{args}", "content": content})
            lines = content.split("\n")
            preview = "\n".join(lines[:40])
            if len(lines) > 40:
                preview += f"\n... ({len(lines)} lines total)"
            ext = args.split(".")[-1] if "." in args else "text"
            lang_map = {"py": "python", "js": "javascript", "ts": "typescript", "md": "markdown", "json": "json", "yml": "yaml", "yaml": "yaml"}
            syntax_lang = lang_map.get(ext, "text")
            console.print(
                Panel(
                    Syntax(preview, syntax_lang, theme="monokai", line_numbers=True) if RICH_AVAILABLE else preview,
                    title=f"[bold {C_ACCENT}]📄 GitHub: {args}[/]",
                    border_style=C_ACCENT,
                    padding=(0, 1),
                )
            )
            console.print(f"  [{C_DIM}]File loaded into context ({len(content):,} chars)[/]")
            return True

        elif command == "/ghls":
            path = args or ""
            if not self.github or not self.github.repo:
                console.print(f"[{C_ERROR}]Connect first: /connect <token> then /repo <owner/repo>[/]")
                return True
            with console.status("[bold cyan]Listing repo contents...", spinner="dots"):
                items = self.github.list_contents(path)
            if not items:
                console.print(f"  [{C_DIM}]No contents found at {path or '/'}[/]")
                return True
            tree = Tree(f"[bold {C_ACCENT}]📁 {self.github.repo}/{path}[/]")
            for item in items:
                icon = "📁" if item.get("type") == "dir" else "📄"
                tree.add(f"{icon} {item.get('name', '?')}")
            console.print(tree)
            return True

        elif command == "/ghwrite":
            write_parts = args.split(None, 1)
            if len(write_parts) < 2:
                console.print(f"[{C_ERROR}]Usage: /ghwrite <path> <commit-message>[/]")
                console.print(f"[{C_DIM}]File content must be loaded first with /file <path>[/]")
                return True
            if not self.github or not self.github.repo:
                console.print(f"[{C_ERROR}]Connect first: /connect <token> then /repo <owner/repo>[/]")
                return True
            filepath = write_parts[0]
            commit_msg = write_parts[1]

            if not self.context_files:
                console.print(f"[{C_ERROR}]No file in context. Load one first: /file <local-path>[/]")
                return True
            file_content = self.context_files[-1]["content"]
            self.context_files = []

            print_approval("github.create_file", f"path={filepath}, repo={self.github.repo}")
            choice = Prompt.ask(f"[{C_APPROVAL}]Write file to GitHub?[/]", choices=["y", "n"], default="n")
            if choice != "y":
                console.print(f"  [{C_ERROR}]Cancelled.[/]")
                return True

            with console.status(f"[bold cyan]Writing {filepath} to {self.github.repo}...", spinner="dots"):
                result = self.github.create_or_update_file(filepath, file_content, commit_msg)
            if result.get("success"):
                console.print(f"  [{C_DONE}]✓ File written: {result.get('url', filepath)}[/]")
            else:
                print_error(result.get("error", "Unknown error"))
            return True

        elif command == "/model":
            console.print(f"  [{C_ACCENT}]Model: {MODEL_FQN}[/]")
            console.print(f"  [{C_DIM}]TrueForge: {self.base_url}[/]")
            console.print(f"  [{C_DIM}]GitHub: {'✅ ' + self.github.repo if self.github and self.github.repo else '❌ Not connected'}[/]")
            return True

        elif command == "/status":
            console.print(f"  [{C_ACCENT}]Session: {self.session_id or 'N/A'}[/]")
            console.print(f"  [{C_ACCENT}]Steps: {self.step_count}[/]")
            console.print(f"  [{C_ACCENT}]Mode: {self.mode}[/]")
            console.print(f"  [{C_ACCENT}]TrueForge: {'✅ Connected' if self.tf_client else '❌ Not connected'}[/]")
            console.print(f"  [{C_ACCENT}]GitHub API: {'✅ ' + self.github.repo if self.github and self.github.repo else '❌ Not connected'}[/]")
            console.print(f"  [{C_ACCENT}]Context files: {len(self.context_files)}[/]")
            return True

        elif command == "/clear":
            console.clear()
            print_banner()
            return True

        elif command in ["/quit", "/exit", "/q"]:
            console.print(f"  [{C_ACCENT}]Goodbye! 👋[/]")
            return False

        else:
            console.print(f"[{C_ERROR}]Unknown command: {command}. Type /help for commands.[/]")
            return True

    def run_interactive(self):
        gh_connected = self.github is not None and self.github.token
        print_banner()
        print_welcome(MODEL_FQN, self.mode, gh_connected)
        console.print()
        print_step("info", "Type /help for commands, or just start typing your prompt.")
        console.print()

        if not self.local_mode:
            if not self.init_trueforge():
                console.print(f"[{C_THINK}]TrueForge not available. GitHub commands still work.[/]")
                console.print(f"[{C_THINK}]Use /connect <token> to connect GitHub directly.[/]")
            else:
                if not self.create_session():
                    console.print(f"[{C_THINK}]Could not create session. GitHub commands still work.[/]")
                    console.print(f"[{C_THINK}]Use /connect <token> to connect GitHub directly.[/]")

        console.print()
        console.print(f"[{C_ACCENT}]{'─' * 60}[/]")
        console.print()

        while True:
            try:
                prompt = Prompt.ask(
                    f"[bold {C_ACCENT}]forgeops>[/]",
                    console=console,
                )

                if not prompt.strip():
                    continue

                if prompt.strip().startswith("/"):
                    should_continue = self.handle_slash_command(prompt)
                    if not should_continue:
                        break
                else:
                    if self.local_mode:
                        self.send_local(prompt)
                    else:
                        self.send_trueforge(prompt)

            except KeyboardInterrupt:
                console.print(f"\n  [{C_DIM}](Ctrl+C — type /quit to exit)[/]")
                console.print()
            except EOFError:
                console.print(f"\n  [{C_ACCENT}]Goodbye! 👋[/]")
                break

    def run_oneshot(self, prompt: str):
        gh_connected = self.github is not None and self.github.token
        print_banner()
        print_welcome(MODEL_FQN, self.mode, gh_connected)
        console.print()

        if not self.local_mode:
            if not self.init_trueforge():
                console.print(f"[{C_ERROR}]Could not connect to TrueForge. Use --local for file-only mode.[/]")
                sys.exit(1)
            if not self.create_session():
                console.print(f"[{C_ERROR}]Could not create session.[/]")
                sys.exit(1)

        console.print()
        console.print(f"[{C_ACCENT}]{'─' * 60}[/]")
        console.print()

        if self.local_mode:
            self.send_local(prompt)
        else:
            self.send_trueforge(prompt)


# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="ForgeOps CLI — Agent-powered code review and debugging",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python forgeops.py                              # Interactive REPL
  python forgeops.py "review PR #1"               # One-shot prompt
  python forgeops.py --local "explain main.py"   # Local file mode

Inside the REPL:
  /connect ghp_xxxxx                              # Connect GitHub
  /repo owner/repo                                # Set repo
  /prs                                            # List PRs
  /pr 5                                           # Review PR #5
  /ghfile README.md                               # Read file from GitHub
  /ghwrite README.md "Updated README"             # Write file to GitHub
  /file main.py                                   # Read local file
  /ls                                             # List local files
  /run pytest                                     # Run a command

Running outside VS Code (Windows CMD):
  1. Install Python from python.org (check "Add to PATH")
  2. Open Command Prompt (cmd.exe)
  3. cd C:\\path\\to\\forgeops
  4. pip install rich httpx
  5. python forgeops.py
        """,
    )
    parser.add_argument("prompt", nargs="?", help="One-shot prompt (opens REPL if omitted)")
    parser.add_argument("--local", action="store_true", help="Local file mode (no TrueForge)")
    parser.add_argument("--file", action="append", default=[], help="Include file in context")
    parser.add_argument("--url", default=DEFAULT_TRUEFORGE_URL, help="TrueForge server URL")
    parser.add_argument("--version", action="version", version=f"ForgeOps CLI v{VERSION}")

    args = parser.parse_args()

    cli = ForgeOpsCLI(base_url=args.url, local_mode=args.local)

    for f in args.file:
        content = LocalFileTools.read_file(f)
        cli.context_files.append({"path": f, "content": content})

    if args.prompt:
        cli.run_oneshot(args.prompt)
    else:
        cli.run_interactive()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print(f"\n[{C_DIM}]Interrupted.[/]")
        sys.exit(0)
