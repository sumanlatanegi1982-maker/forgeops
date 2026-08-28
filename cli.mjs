#!/usr/bin/env node
/**
 * ForgeOps CLI — Terminal client for your TrueForge agent.
 *
 * Connects to your saved agent (forgeopsv1s) which has all connectors
 * (GitHub MCP, sandbox, model, skills) configured in the TrueForge UI.
 *
 * Usage:
 *   node cli.mjs                          # Interactive REPL
 *   node cli.mjs "review the last PR"      # One-shot
 */

import { TrueForge } from '@truefoundry/trueforge-sdk';
import { createInterface } from 'readline';
import { env, stdout, stdin, exit } from 'process';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL   = env.TRUEFORGE_BASE_URL || 'http://localhost:8790';
const AGENT_NAME = env.TRUEFORGE_AGENT || 'forgeopsv1s';
const TOKEN      = env.TRUEFORGE_TOKEN || undefined;
const VERSION    = '3.6.0';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  magenta: '\x1b[35m',
};

// ─── Spinner ──────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let spinnerTimer = null;
let spinnerFrame = 0;
let spinnerLabel = 'Thinking';

function startSpinner(label = 'Thinking') {
  spinnerLabel = label;
  spinnerFrame = 0;
  if (spinnerTimer) return;
  spinnerTimer = setInterval(() => {
    const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    stdout.write(`\r${C.cyan}${frame}${C.reset} ${C.dim}${spinnerLabel}...${C.reset}   `);
    spinnerFrame++;
  }, 80);
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    stdout.write('\r' + ' '.repeat(50) + '\r');
  }
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(`
${C.cyan}${C.bold}  ███████╗ ██████╗ ███████╗███████╗██████╗  ██████╗██╗  ██╗███████╗██████╗
  ██╔════╝██╔═══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔══██╗
  █████╗  ██║   ██║███████╗█████╗  ██████╔╝██║   ██║███████║█████╗  ██║  ██║
  ██╔══╝  ██║   ██║╚════██║██╔══╝  ██╔══██╗██║   ██║╚════██║██╔══╝  ██║  ██║
  ██║     ╚██████╔╝███████║███████╗██║  ██║╚██████╔╝███████║███████╗██████╔╝
  ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝╚═════╝${C.reset}
  ${C.dim}v${VERSION} · Agent: ${AGENT_NAME} · ${BASE_URL}${C.reset}
`);
}

// ─── State ───────────────────────────────────────────────────────────────────

let client = null;
let sessionId = null;
const eventIndex = new Map();

// Flag: when true, the REPL 'line' handler ignores input
// This prevents the "y" from the approval prompt being treated as a new user message
let isApproving = false;

// ─── Connect ──────────────────────────────────────────────────────────────────

async function connect() {
  try {
    client = new TrueForge({
      baseUrl: BASE_URL,
      timeoutInSeconds: 600,
      ...(TOKEN ? { token: TOKEN } : {}),
    });

    startSpinner(`Creating session with ${AGENT_NAME}`);
    const { data: session } = await client.sessions.create({
      agent: { name: AGENT_NAME },
    });
    stopSpinner();

    sessionId = session.id;
    console.log(`${C.green}✓${C.reset} Connected to agent ${C.bold}${AGENT_NAME}${C.reset} (session: ${session.id.slice(0, 12)}...)`);
    return true;
  } catch (err) {
    stopSpinner();
    console.error(`${C.red}✕ Could not connect to TrueForge at ${BASE_URL}${C.reset}`);
    console.error(`${C.dim}  ${err.message}${C.reset}`);
    console.error(`${C.dim}  Is the server running? Try: npx @truefoundry/trueforge${C.reset}`);
    return false;
  }
}

// ─── Look up tool call details from event index ──────────────────────────────

function lookupToolCall(sourceEventId, toolCallId) {
  const baseEvent = eventIndex.get(sourceEventId);
  if (!baseEvent) return { name: 'unknown', args: {} };

  const toolCalls = baseEvent.toolCalls || baseEvent.tool_calls || [];
  const call = toolCalls.find(tc => (tc.id || tc.toolCallId) === toolCallId) || toolCalls[0];
  if (!call) return { name: 'unknown', args: {} };

  const name = call.name || call.toolInfo?.name || call.tool_info?.name || call.function?.name || 'unknown';
  let args = call.arguments || call.function?.arguments || call.input || {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { /* keep as string */ }
  }
  return { name, args };
}

// ─── Approval prompt ──────────────────────────────────────────────────────────
// Uses raw stdin data events, NOT a second readline interface.
// This avoids the bug where the REPL's readline steals the "y" input.

function askApproval(toolName, toolArgs) {
  console.log(`\n${C.yellow}${'─'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.yellow}⚠  Approval Required${C.reset}`);
  console.log(`${C.bold}Tool:${C.reset}       ${C.white}${toolName}${C.reset}`);
  if (toolArgs && Object.keys(toolArgs).length > 0) {
    const argsStr = JSON.stringify(toolArgs, null, 2);
    const truncated = argsStr.length > 300 ? argsStr.slice(0, 300) + '...' : argsStr;
    console.log(`${C.bold}Arguments:${C.reset}  ${C.dim}${truncated}${C.reset}`);
  }
  console.log(`${C.yellow}${'─'.repeat(60)}${C.reset}`);

  return new Promise((resolve) => {
    isApproving = true;
    process.stdout.write(`${C.bold}Allow this? [${C.green}y${C.reset}${C.bold}/${C.red}N${C.reset}${C.bold}]: ${C.reset}`);

    const onData = (chunk) => {
      stdin.removeListener('data', onData);
      stdin.pause();
      isApproving = false;

      const ans = chunk.toString().trim().toLowerCase();
      if (ans === 'y' || ans === 'yes') {
        console.log(`${C.green}✓ Approved${C.reset}`);
        resolve(true);
      } else {
        console.log(`${C.red}✕ Denied${C.reset}`);
        resolve(false);
      }
    };

    stdin.resume();
    stdin.once('data', onData);
  });
}

// ─── Run a turn and return collected pending approvals ────────────────────────

let stepCounter = 0;

async function runTurnStream(inputItems) {
  const pendingApprovals = [];
  stepCounter = 0;

  const stream = await client.sessions.createTurnStream(sessionId, { input: inputItems });

  for await (const { data: event, id: eventId } of stream.withMetadata()) {
    const type = event.type;

    // Index every non-delta event
    if (type !== 'model.message.delta' && type !== 'model.message.delta.chunk') {
      const eid = event.id || eventId;
      if (eid) eventIndex.set(eid, event);
    }

    // ── Model text streaming ──────────────────────────────────────────────
    if (type === 'model.message.delta') {
      if (event.threadId === 'main' || !event.threadId) {
        stopSpinner();
        stdout.write(`${C.white}${event.content || ''}${C.reset}`);
      }
    }

    // ── Model message (complete, not delta) — may contain tool_calls ───────
    else if (type === 'model.message') {
      // Index it for approval lookups
      const eid = event.id || eventId;
      if (eid) eventIndex.set(eid, event);
    }

    // ── Tool call ─────────────────────────────────────────────────────────
    else if (type === 'tool.call') {
      stopSpinner();
      stepCounter++;
      // Try every possible field name for tool name
      const toolName = event.toolName || event.tool_name || event.name ||
                       event.toolInfo?.name || event.tool_info?.name ||
                       event.function?.name || 'tool';
      // Try every possible field name for arguments
      let toolArgs = event.toolArguments || event.tool_arguments ||
                     event.arguments || event.function?.arguments ||
                     event.input || event.args || {};
      if (typeof toolArgs === 'string') {
        try { toolArgs = JSON.parse(toolArgs); } catch { /* keep string */ }
      }

      // Show step number + tool name (like web UI "Agent steps")
      console.log(`${C.dim}  Step ${stepCounter}:${C.reset} ${C.yellow}⚙ ${C.bold}${toolName}${C.reset}`);

      // Show key arguments (truncated)
      if (toolArgs && typeof toolArgs === 'object' && Object.keys(toolArgs).length > 0) {
        const argsStr = JSON.stringify(toolArgs);
        const truncated = argsStr.length > 120 ? argsStr.slice(0, 120) + '...' : argsStr;
        console.log(`${C.dim}         ${truncated}${C.reset}`);
      }

      startSpinner('Running tool');
    }

    // ── Tool result ───────────────────────────────────────────────────────
    else if (type === 'tool.result' || type === 'tool.response') {
      stopSpinner();
      const status = (event.state || event.status || {}).status || 'done';
      if (status === 'done' || status === 'success') {
        console.log(`${C.dim}         ✓ done${C.reset}`);
      } else if (status === 'error') {
        const errMsg = event.error?.message || event.message || 'failed';
        console.log(`${C.red}         ✗ ${errMsg}${C.reset}`);
      } else {
        console.log(`${C.dim}         → ${status}${C.reset}`);
      }
      startSpinner('Processing');
    }

    // ── Approval required ────────────────────────────────────────────────
    else if (type === 'tool.approval_required') {
      stopSpinner();
      const threadId = event.threadId || event.thread_id || 'main';
      const toolCalls = event.toolCalls || event.tool_calls || [];
      pendingApprovals.push({ threadId, toolCalls });
    }

    // ── Sandbox created ──────────────────────────────────────────────────
    else if (type === 'sandbox.created') {
      stopSpinner();
      console.log(`${C.dim}  📦 Sandbox created${C.reset}`);
      startSpinner('Thinking');
    }

    // ── Thread/subagent created ──────────────────────────────────────────
    else if (type === 'thread.created') {
      stopSpinner();
      console.log(`${C.dim}  ↳ Subagent: ${event.title || event.name || 'unnamed'}${C.reset}`);
      startSpinner('Thinking');
    }

    // ── Turn done ────────────────────────────────────────────────────────
    else if (type === 'turn.done') {
      stopSpinner();
      const status = (event.state || {}).status || 'done';
      if (status === 'error') {
        console.log(`\n${C.red}✕ Agent error${C.reset}`);
      }
      // Print step summary if there were tool calls
      if (stepCounter > 0) {
        console.log(`${C.dim}  ── ${stepCounter} tool call(s) completed ──${C.reset}`);
      }
      break;
    }

    // ── Error ────────────────────────────────────────────────────────────
    else if (type === 'error') {
      stopSpinner();
      console.error(`\n${C.red}✕ ${event.message || 'Unknown error'}${C.reset}`);
      break;
    }

    // ── Catch-all: log unknown event types so nothing is silently dropped ──
    else if (type !== 'turn.created' && type !== 'model.message.delta.chunk') {
      const summary = JSON.stringify(event).slice(0, 200);
      stopSpinner();
      console.log(`${C.dim}  [${type}] ${summary}${C.reset}`);
      startSpinner('Processing');
    }
  }

  return pendingApprovals;
}

// ─── Run agent turn (with approval loop) ──────────────────────────────────────

async function runTurn(prompt) {
  if (!sessionId) {
    console.error(`${C.red}No active session.${C.reset}`);
    return;
  }

  console.log(`\n${C.blue}┌─ You${C.reset}`);
  console.log(`${C.blue}│${C.reset} ${prompt}`);
  console.log(`${C.blue}└─${C.reset}\n`);

  startSpinner('Agent thinking');

  try {
    let inputItems = [{ type: 'user.message', content: prompt }];
    let depth = 0;

    while (true) {
      // Reset step counter for each turn
      stepCounter = 0;
      const pendingApprovals = await runTurnStream(inputItems);

      if (pendingApprovals.length === 0) {
        break;
      }

      if (depth > 10) {
        console.log(`\n${C.red}✕ Too many approval rounds (10+). Stopping.${C.reset}`);
        break;
      }
      depth++;

      const approvalInputs = [];

      for (const pending of pendingApprovals) {
        for (const tc of pending.toolCalls) {
          const toolCallId = tc.id || tc.toolCallId || tc.tool_call_id;
          const sourceEventId = tc.sourceEventId || tc.source_event_id || tc.sourceEventId;

          const toolInfo = lookupToolCall(sourceEventId, toolCallId);
          const approved = await askApproval(toolInfo.name, toolInfo.args);

          approvalInputs.push({
            type: 'user.tool_approval',
            threadId: pending.threadId,
            toolCallId: toolCallId,
            approval: approved
              ? { status: 'allow' }
              : { status: 'deny', reason: 'Denied by user' },
          });
        }
      }

      console.log(`\n${C.dim}Sending ${approvalInputs.length} approval(s)...${C.reset}`);
      startSpinner('Resuming agent');
      inputItems = approvalInputs;
    }
  } catch (err) {
    stopSpinner();
    console.error(`\n${C.red}✕ ${err.message}${C.reset}`);
    if (err.body) {
      console.error(`${C.dim}  ${JSON.stringify(err.body).slice(0, 500)}${C.reset}`);
    }
  }

  stopSpinner();
  console.log(`\n${C.dim}${'─'.repeat(55)}${C.reset}\n`);
}

// ─── REPL ──────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

  const connected = await connect();
  if (!connected) {
    console.log(`${C.dim}Run 'npx @truefoundry/trueforge' in another terminal, then try again.${C.reset}\n`);
    exit(1);
  }

  console.log(`${C.dim}Type your message and press Enter. Ctrl+C to quit.${C.reset}\n`);

  const rl = createInterface({
    input: stdin,
    output: stdout,
    prompt: `${C.bold}${C.cyan}forgeops>${C.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    // Ignore input while an approval prompt is active
    if (isApproving) { return; }
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    if (trimmed === '/quit' || trimmed === '/exit') {
      console.log(`${C.dim}Goodbye.${C.reset}\n`);
      exit(0);
    }

    if (trimmed === '/help') {
      console.log(`${C.dim}Just type your message and press Enter. The agent handles everything.${C.reset}`);
      console.log(`${C.dim}Commands: /quit, /help${C.reset}\n`);
      rl.prompt();
      return;
    }

    await runTurn(trimmed);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.dim}Goodbye.${C.reset}\n`);
    exit(0);
  });
}

main().catch((err) => {
  stopSpinner();
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  exit(1);
});
