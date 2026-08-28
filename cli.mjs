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
import { env, stdout, exit } from 'process';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL   = env.TRUEFORGE_BASE_URL || 'http://localhost:8790';
const AGENT_NAME = env.TRUEFORGE_AGENT || 'forgeopsv1s';
const TOKEN      = env.TRUEFORGE_TOKEN || undefined;
const VERSION    = '3.5.0';

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

// Event index: maps event ID -> event data (for looking up tool call details)
const eventIndex = new Map();

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
// The tool.approval_required event has tool_calls: [{ id, source_event_id }]
// We look up source_event_id in our index to find the model.message event,
// then find the matching tool call by id to get the name + arguments.

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
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${C.bold}Allow this? [${C.green}y${C.reset}${C.bold}/${C.red}N${C.reset}${C.bold}]: ${C.reset}`, (ans) => {
      const a = ans.trim().toLowerCase();
      rl.close();
      if (a === 'y' || a === 'yes') {
        console.log(`${C.green}✓ Approved${C.reset}`);
        resolve(true);
      } else {
        console.log(`${C.red}✕ Denied${C.reset}`);
        resolve(false);
      }
    });
  });
}

// ─── Run a turn and return collected pending approvals ────────────────────────
// Returns: array of { threadId, toolCalls } entries from tool.approval_required events

async function runTurnStream(inputItems) {
  const pendingApprovals = [];

  const stream = await client.sessions.createTurnStream(sessionId, { input: inputItems });

  for await (const { data: event, id: eventId } of stream.withMetadata()) {
    const type = event.type;

    // Index every non-delta event (for tool call lookups later)
    if (type !== 'model.message.delta' && type !== 'model.message.delta.chunk') {
      const eid = event.id || eventId;
      if (eid) eventIndex.set(eid, event);
    }

    if (type === 'model.message.delta') {
      if (event.threadId === 'main' || !event.threadId) {
        stopSpinner();
        stdout.write(`${C.white}${event.content || ''}${C.reset}`);
      }
    }

    else if (type === 'tool.call') {
      stopSpinner();
      const toolName = event.toolName || event.tool_name || 'unknown';
      const toolArgs = event.toolArguments || event.tool_arguments || {};
      console.log(`\n${C.yellow}⚙ ${C.bold}${toolName}${C.reset}`);
      const argsStr = JSON.stringify(toolArgs);
      if (argsStr !== '{}') {
        console.log(`${C.dim}  ${argsStr.slice(0, 200)}${C.reset}`);
      }
      startSpinner('Running tool');
    }

    else if (type === 'tool.result') {
      stopSpinner();
      const status = (event.state || {}).status || 'done';
      if (status === 'done') {
        console.log(`${C.dim}  ✓ done${C.reset}`);
      } else {
        console.log(`${C.red}  ✗ ${status}${C.reset}`);
      }
      startSpinner('Processing');
    }

    else if (type === 'tool.approval_required') {
      stopSpinner();
      // The event has threadId and toolCalls (array of { id, sourceEventId })
      const threadId = event.threadId || event.thread_id || 'main';
      const toolCalls = event.toolCalls || event.tool_calls || [];
      pendingApprovals.push({ threadId, toolCalls });
      // Don't break — let the stream continue to turn.done
    }

    else if (type === 'sandbox.created') {
      stopSpinner();
      console.log(`${C.dim}  📦 Sandbox created${C.reset}`);
      startSpinner('Thinking');
    }

    else if (type === 'thread.created') {
      stopSpinner();
      console.log(`${C.dim}  ↳ Subagent: ${event.title || 'unnamed'}${C.reset}`);
      startSpinner('Thinking');
    }

    else if (type === 'turn.done') {
      stopSpinner();
      const status = (event.state || {}).status || 'done';
      if (status === 'error') {
        console.log(`\n${C.red}✕ Agent error${C.reset}`);
      }
      break;
    }

    else if (type === 'error') {
      stopSpinner();
      console.error(`\n${C.red}✕ ${event.message || 'Unknown error'}${C.reset}`);
      break;
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

    // Loop: send turn → if approvals needed → ask user → send approval turn → repeat
    while (true) {
      const pendingApprovals = await runTurnStream(inputItems);

      if (pendingApprovals.length === 0) {
        break; // No approvals needed, turn is complete
      }

      if (depth > 10) {
        console.log(`\n${C.red}✕ Too many approval rounds (10+). Stopping.${C.reset}`);
        break;
      }
      depth++;

      // Collect approval decisions for ALL pending tool calls
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

      // Send all approvals as a new turn
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
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.bold}${C.cyan}forgeops>${C.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
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
