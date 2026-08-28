#!/usr/bin/env python3
"""
ForgeOps CLI — A beautiful terminal agent for code review and incident debugging.
Built for the WeMakeDevals TrueForge Hackathon.

Works in two modes:
  1. TrueForge mode (default): Uses TrueForge agent with Sarvam 105B, GitHub MCP, sandbox
  2. Local mode (--local): Reads/writes files directly on your computer

Usage:
  python forgeops.py                    # Interactive REPL
  python forgeops.py "review this code" # One-shot prompt
  python forgeops.py --local "explain src/main.py"  # Local file access
  python forgeops.py --file PR_URL      # Review a GitHub PR

Requirements:
  pip install rich httpx
"""

import sys
import os
import json
import time
import argparse
import subprocess
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
VERSION = "1.0.0"

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
        """Create a session with inline agent spec."""
        try:
            resp = self.client.post(
                f"{self.base_url}/api/v1/sessions",
                json={"agent": {"spec": AGENT_SPEC}},
            )
            # TrueForge returns 201 Created on success
            if resp.status_code not in (200, 201):
                console.print(f"[{C_ERROR}]Session creation failed (HTTP {resp.status_code})[/]")
                try:
                    err_data = resp.json()
                    console.print(f"[{C_ERROR}]Error detail:[/] {json.dumps(err_data, indent=2)[:1000]}")
                except Exception:
                    console.print(f"[{C_ERROR}]Response body:[/] {resp.text[:1000]}")
                return None
            data = resp.json()
            # TrueForge wraps the session in {"data": {"id": "..."}}
            session_id = data.get("id") or data.get("data", {}).get("id")
            return session_id
        except Exception as e:
            console.print(f"[{C_ERROR}]Failed to create session:[/] {e}")
            return None

    def stream_turn(self, session_id: str, content: str):
        """Stream a turn and yield events."""
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
        """Send approval response."""
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
    console.print(Align.center(Text(f"  Agent CLI v{VERSION}  ·  TrueForge Hackathon  ", style=f"bold white on {C_ACCENT}")))
    console.print()


def print_help():
    help_table = Table(title="Commands", box=box.ROUNDED, border_style=C_DIM, title_style=f"bold {C_ACCENT}")
    help_table.add_column("Command", style=f"bold {C_ACCENT}", width=20)
    help_table.add_column("Description", style="white", width=50)
    help_table.add_row("/help", "Show this help")
    help_table.add_row("/file <path>", "Read a local file and include it in context")
    help_table.add_row("/ls <dir>", "List directory contents")
    help_table.add_row("/tree <dir>", "Show directory tree")
    help_table.add_row("/grep <pattern> <path>", "Search for pattern in files")
    help_table.add_row("/run <cmd>", "Run a shell command and show output")
    help_table.add_row("/pr <url>", "Review a GitHub PR")
    help_table.add_row("/model", "Show current model")
    help_table.add_row("/status", "Show session status")
    help_table.add_row("/clear", "Clear the screen")
    help_table.add_row("/quit", "Exit ForgeOps")
    console.print(help_table)


def print_welcome(model: str, mode: str):
    info = Table(box=box.SIMPLE, show_header=False, border_style=C_DIM)
    info.add_column("Key", style=f"bold {C_DIM}", width=15)
    info.add_column("Value", style="white")
    info.add_row("Model", model)
    info.add_row("Mode", mode)
    info.add_row("Server", DEFAULT_TRUEFORGE_URL if "localhost" not in DEFAULT_TRUEFORGE_URL else "Local TrueForge")
    info.add_row("File Access", "✅ Local files" if mode == "Local" else "✅ Sandbox")
    info.add_row("GitHub MCP", "✅ Connected" if mode == "TrueForge" else "❌ Local mode")
    info.add_row("Approval Gate", "✅ Write + Destructive" if mode == "TrueForge" else "N/A")
    console.print(Panel(info, title="[bold]Session Info[/]", border_style=C_ACCENT, padding=(1, 2)))


def spinner_with_text(text: str):
    return Spinner("dots", text=Text(text, style=f"{C_THINK}"), style=C_THINK)


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
    truncated = result[:500] + "..." if len(result) > 500 else result
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
        self.step_count = 0
        self.context_files: list = []  # accumulated file contents for local mode

    def init_trueforge(self) -> bool:
        """Initialize TrueForge connection."""
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
        """Process a TrueForge SSE event. Returns (should_continue, needs_approval)."""
        etype = event.get("type", "")

        if etype == "model.message.delta":
            content = event.get("content", "")
            if content:
                # Stream text inline
                console.print(content, end="", style="white")
            return (True, None)

        elif etype == "tool.call":
            tool_name = event.get("toolName", "unknown")
            tool_args = json.dumps(event.get("toolArguments", {}), indent=2)[:300]
            print_tool_call(tool_name, tool_args)
            self.step_count += 1
            return (True, None)

        elif etype == "tool.result":
            result = str(event.get("toolResult", ""))
            status = event.get("state", {}).get("status", "done")
            print_tool_result(result, status)
            return (True, None)

        elif etype == "tool.approval_required":
            tool_name = event.get("toolName", "unknown")
            tool_args = json.dumps(event.get("toolArguments", {}), indent=2)[:300]
            print_approval(tool_name, tool_args)
            return (True, {"tool": tool_name, "args": tool_args, "event": event})

        elif etype == "turn.done":
            status = event.get("state", {}).get("status", "done")
            output = event.get("state", {}).get("output", {}).get("content", "")
            if status == "error":
                print_error("Agent turn ended with an error.")
            elif output and not console.file.isatty():
                pass  # already streamed
            return (False, None)

        elif etype == "error":
            msg = event.get("message", "Unknown error")
            print_error(msg)
            return (False, None)

        elif etype == "sandbox.created":
            sandbox_id = event.get("sandboxId", "?")
            print_step("info", f"Sandbox created: {str(sandbox_id)[:20]}...")
            return (True, None)

        elif etype == "thread.created":
            title = event.get("title", "subagent")
            print_step("info", f"Subagent thread: {title}")
            return (True, None)

        return (True, None)

    def send_trueforge(self, content: str) -> bool:
        """Send a message to TrueForge and stream the response."""
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
            for event in self.tf_client.stream_turn(self.session_id, content):
                should_cont, approval = self.process_trueforge_event(event)

                if event.get("type") == "model.message.delta":
                    has_streamed = True
                    full_response += event.get("content", "")

                if approval:
                    approval_needed = approval

                if not should_cont:
                    break

            # Handle approval
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
                for event in self.tf_client.approve_tool(self.session_id, allow, reason):
                    should_cont, _ = self.process_trueforge_event(event)
                    if event.get("type") == "model.message.delta":
                        has_streamed = True
                        full_response += event.get("content", "")
                    if not should_cont:
                        break

            console.print()  # newline after streaming

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
        """Process a prompt locally using file tools + TrueForge for reasoning."""
        console.print()
        console.print(f"[{C_PROMPT}]┌─ You[/]")
        console.print(f"[{C_PROMPT}]│[/] {content}")
        console.print(f"[{C_PROMPT}]└─[/]")
        console.print()

        # Build context from accumulated files
        file_context = ""
        if self.context_files:
            file_context = "\n\n--- File Context ---\n"
            for f in self.context_files:
                file_context += f"\n[File: {f['path']}]\n{f['content'][:5000]}\n"

        # Check if this is a file operation
        lower = content.lower().strip()

        if lower.startswith("/"):
            return self.handle_slash_command(content)

        # For local mode, prepend file context and send to TrueForge
        full_prompt = content
        if file_context:
            full_prompt = f"{content}\n\nHere are the relevant files:\n{file_context}"
            self.context_files = []  # clear after use

        # Try TrueForge if available
        if self.tf_client and self.session_id:
            return self.send_trueforge(full_prompt)

        # Fallback: just show file context
        if file_context:
            console.print(f"[{C_THINK}]File context loaded. Connect to TrueForge for AI analysis.[/]")
        else:
            console.print(f"[{C_DIM}]Local mode — use /file, /ls, /tree, /grep, /run to interact with your files.[/]")
            console.print(f"[{C_DIM}]Start TrueForge with 'npx @truefoundry/trueforge' for AI-powered analysis.[/]")
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
            # Show preview
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

        elif command == "/pr":
            if not args:
                console.print(f"[{C_ERROR}]Usage: /pr <github-pr-url>[/]")
                return True
            prompt = f"Review this pull request: {args}. Fetch the diff, analyze the changes, and provide a structured review."
            if self.tf_client and self.session_id:
                return self.send_trueforge(prompt)
            else:
                console.print(f"[{C_ERROR}]PR review requires TrueForge connection. Start TrueForge first.[/]")
                return True

        elif command == "/model":
            console.print(f"  [{C_ACCENT}]Model: {MODEL_FQN}[/]")
            console.print(f"  [{C_DIM}]Server: {self.base_url}[/]")
            return True

        elif command == "/status":
            console.print(f"  [{C_ACCENT}]Session: {self.session_id or 'N/A'}[/]")
            console.print(f"  [{C_ACCENT}]Steps: {self.step_count}[/]")
            console.print(f"  [{C_ACCENT}]Mode: {self.mode}[/]")
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
        """Run the interactive REPL."""
        print_banner()
        print_welcome(MODEL_FQN, self.mode)
        console.print()
        print_step("info", "Type /help for commands, or just start typing your prompt.")
        console.print()

        if not self.local_mode:
            if not self.init_trueforge():
                console.print(f"[{C_ERROR}]Could not connect to TrueForge. Falling back to local mode.[/]")
                self.local_mode = True
                self.mode = "Local"
            else:
                if not self.create_session():
                    console.print(f"[{C_ERROR}]Could not create session. Falling back to local mode.[/]")
                    self.local_mode = True
                    self.mode = "Local"

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
        """Run a single prompt and exit."""
        print_banner()
        print_welcome(MODEL_FQN, self.mode)
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
  python forgeops.py "review PR #1 in my repo"   # One-shot prompt
  python forgeops.py --local "explain main.py"   # Local file mode
  python forgeops.py --file src/App.tsx "review this code"  # Include file
  python forgeops.py --url http://localhost:8790  # Custom TrueForge URL
        """,
    )
    parser.add_argument("prompt", nargs="?", help="One-shot prompt (opens REPL if omitted)")
    parser.add_argument("--local", action="store_true", help="Local file mode (no TrueForge)")
    parser.add_argument("--file", action="append", default=[], help="Include file in context")
    parser.add_argument("--url", default=DEFAULT_TRUEFORGE_URL, help="TrueForge server URL")
    parser.add_argument("--version", action="version", version=f"ForgeOps CLI v{VERSION}")

    args = parser.parse_args()

    cli = ForgeOpsCLI(base_url=args.url, local_mode=args.local)

    # Load files specified with --file
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
