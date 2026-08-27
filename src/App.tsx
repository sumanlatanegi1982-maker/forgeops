import { useState, useRef, useEffect } from 'react'
import { useAgentSession, renderMarkdown } from './useAgentSession'
import { AgentGraph } from './agent-graph'
import { NODE_TYPES, type GraphNode } from './types'

const CSS = `
:root {
  --bg: #0a0a0b; --bg-2: #0e0e11; --sidebar-bg: #0c0c0f;
  --surface: #151518; --surface-2: #1c1c21;
  --border: rgba(255,255,255,0.07); --border-strong: rgba(255,255,255,0.12);
  --text: #ececed; --text-dim: #8a8a92; --text-faint: #55555c;
  --accent: #a3a3ff; --accent-dim: rgba(163,163,255,0.14); --accent-glow: rgba(163,163,255,0.45);
  --think: #7dd3c0; --tool: #e0b34a; --task: #d98ca8; --done: #6fcf97;
  --danger: #ef6b6b; --approval: #f97316;
  --radius: 14px; --radius-sm: 10px;
  --font-body: 'DM Sans', system-ui, sans-serif; --font-mono: 'JetBrains Mono', monospace;
}
* { margin:0; padding:0; box-sizing:border-box; }
html, body, #root { height:100%; overflow:hidden; }
body { font-family: var(--font-body); background: var(--bg); color: var(--text); font-size:14px; -webkit-font-smoothing:antialiased; }
body::before { content:''; position:fixed; top:-220px; right:-220px; width:640px; height:640px; background: radial-gradient(circle, rgba(163,163,255,0.10) 0%, rgba(163,163,255,0.03) 40%, transparent 70%); pointer-events:none; z-index:0; }
.app { display:flex; height:100%; position:relative; z-index:1; }
.sidebar { width:264px; flex-shrink:0; background:var(--sidebar-bg); border-right:1px solid var(--border); display:flex; flex-direction:column; }
.sidebar-head { padding:16px 16px 12px; display:flex; align-items:center; gap:9px; }
.logo-mark { width:26px; height:26px; border-radius:50%; background: radial-gradient(circle at 35% 30%, #c9c9ff, #8484e8 60%, #5a5ac9); box-shadow: 0 0 14px var(--accent-glow), inset 0 0 6px rgba(255,255,255,0.3); }
.logo-text { font-weight:700; font-size:16px; letter-spacing:-0.3px; }
.new-chat { margin:4px 12px 12px; padding:10px 12px; border-radius:var(--radius-sm); background:var(--accent-dim); border:1px solid rgba(163,163,255,0.25); color:var(--text); font-family:var(--font-body); font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:8px; cursor:pointer; }
.new-chat:hover { background: rgba(163,163,255,0.22); }
.sidebar-head { padding:16px 16px 12px; display:flex; align-items:center; gap:9px; }
.nav { padding:0 12px; }
.nav-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; color:var(--text-dim); font-size:13.5px; font-weight:500; cursor:pointer; }
.nav-item:hover { background:var(--surface); color:var(--text); }
.nav-item.active { background:var(--surface-2); color:var(--text); }
.divider { height:1px; background:var(--border); margin:12px 12px; }
.agent-status-sidebar { padding:0 16px; flex:1; }
.status-row { display:flex; justify-content:space-between; padding:5px 0; font-size:12.5px; }
.status-label { color:var(--text-faint); }
.status-value { color:var(--text-dim); font-family:var(--font-mono); font-size:11.5px; }
.sidebar-bottom { padding:12px; border-top:1px solid var(--border); }
.version { font-size:11px; color:var(--text-faint); text-align:center; padding-top:8px; }
.main { flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden; }
.topbar { height:52px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:0 22px; border-bottom:1px solid var(--border); background:rgba(10,10,11,0.6); backdrop-filter:blur(8px); z-index:5; }
.topbar-left { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--text-dim); }
.dot { width:7px; height:7px; border-radius:50%; background:var(--text-faint); }
.dot.online { background:var(--done); box-shadow:0 0 6px var(--done); }
.dot.streaming { background:var(--think); box-shadow:0 0 6px var(--think); animation:pulse 1.5s infinite; }
Keyframes pulse { 0%,100%{opacity:.4;transform:scale(.85);} 50%{opacity:1;transform:scale(1.1);} }
.session-id { font-size:11.5px; color:var(--text-faint); font-family:var(--font-mono); }
.model-pill { padding:5px 10px; border-radius:99px; background:var(--surface-2); border:1px solid var(--border); font-size:11.5px; font-weight:500; color:var(--text-dim); font-family:var(--font-mono); }
.chat-scroll { flex:1; overflow-y:auto; }
.chat-inner { max-width:920px; margin:0 auto; padding:28px 24px 200px; }
.welcome { display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:6vh; }
.welcome-mark { width:56px; height:56px; border-radius:50%; background: radial-gradient(circle at 35% 30%, #c9c9ff, #8484e8 55%, #5a5ac9); box-shadow: 0 0 40px var(--accent-glow); display:flex; align-items:center; justify-content:center; margin-bottom:22px; font-size:24px; }
.welcome-sub { font-size:13.5px; color:var(--text-dim); margin-bottom:6px; font-weight:500; }
.welcome-title { font-size:30px; font-weight:700; letter-spacing:-0.5px; margin-bottom:30px; }
.suggestions { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; width:100%; max-width:600px; }
.sugg-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px; cursor:pointer; text-align:left; transition: border-color .15s,background .15s,transform .15s; display:flex; flex-direction:column; gap:10px; min-height:96px; }
.sugg-card:hover { border-color:var(--border-strong); background:var(--surface-2); transform:translateY(-2px); }
.sugg-icon { width:28px; height:28px; border-radius:8px; background:var(--surface-2); display:flex; align-items:center; justify-content:center; font-size:16px; }
.sugg-text { font-size:13px; color:var(--text); font-weight:500; }
.sugg-sub { font-size:11.5px; color:var(--text-faint); }
.msg { margin-bottom:22px; animation:fadeUp .35s ease both; }
Keyframes fadeUp { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:none;} }

.msg-user { display:flex; justify-content:flex-end; }
.bubble-user { background:var(--surface-2); border:1px solid var(--border); border-radius:16px 16px 4px 16px; padding:11px 16px; max-width:70%; font-size:13.5px; line-height:1.5; }
.msg-ai { display:flex; gap:12px; align-items:flex-start; }
.ai-avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; background: radial-gradient(circle at 35% 30%, #c9cfff, #8484e8 55%, #5a5ac9); box-shadow:0 0 12px var(--accent-glow); margin-top:2px; }
.ai-body { flex:1; min-width:0; }
.ai-text { font-size:13.5px; line-height:1.6; color:var(--text); }
.ai-text p { margin-bottom:8px; }
.ai-text p:last-child { margin-bottom:0; }
.ai-text code { font-family:var(--font-mono); font-size:12px; background:var(--surface); padding:1px 5px; border-radius:4px; }
.ai-text pre { background:var(--bg); padding:12px; border-radius:8px; overflow-x:auto; margin:8px 0; border:1px solid var(--border); }
.ai-text pre code { background:none; padding:0; }
.error-banner { margin:0 0 16px; padding:10px 14px; background:rgba(239,107,107,0.1); border:1px solid var(--danger); border-radius:var(--radius-sm); color:var(--danger); font-size:13px; }
.agent-panel { margin:4px 0 16px; background: linear-gradient(180deg, rgba(18,18,22,0.85), rgba(10,10,13,0.92)); border:1px solid var(--border-strong); border-radius:var(--radius); overflow:hidden; animation:fadeUp .4s ease both; box-shadow:0 8px 40px rgba(0,0,0,0.5); }
.agent-panel-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); background:rgba(255,255,255,0.03); }
.agent-panel-title { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:var(--text-dim); }
.agent-pulse { width:8px; height:8px; border-radius:50%; background:var(--think); box-shadow:0 0 8px var(--think); animation:pulse 1.4s ease-in-out infinite; }
.agent-panel-head.done .agent-pulse { background:var(--done); box-shadow:0 0 8px var(--done); animation:none; }
.agent-stats { font-family:var(--font-mono); font-size:11px; color:var(--text-faint); }
.agent-stats span { color:var(--text-dim); }
.agent-canvas-wrap { position:relative; width:100%; height:380px; background: radial-gradient(ellipse at 50% 45%, rgba(120,90,200,0.10), transparent 65%), radial-gradient(circle at 80% 80%, rgba(163,163,255,0.05), transparent 50%), #07070a; cursor:grab; }
.agent-canvas-wrap:active { cursor:grabbing; }
.agent-canvas-wrap canvas { display:block; width:100%; height:100%; }
.agent-legend { position:absolute; bottom:10px; left:12px; display:flex; flex-wrap:wrap; gap:10px 14px; font-size:10px; color:var(--text-faint); font-family:var(--font-mono); pointer-events:none; background:rgba(8,8,12,0.6); backdrop-filter:blur(6px); padding:6px 10px; border-radius:8px; border:1px solid var(--border); }
.leg { display:flex; align-items:center; gap:5px; }
.leg-dot { width:7px; height:7px; border-radius:50%; }
.zoom-controls { position:absolute; bottom:10px; right:12px; display:flex; flex-direction:column; gap:4px; }
.zoom-controls button { width:30px; height:30px; border-radius:7px; background:rgba(8,8,12,0.7); backdrop-filter:blur(6px); border:1px solid var(--border-strong); color:var(--text-dim); font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.zoom-controls button:hover { background:rgba(255,255,255,0.1); color:var(--text); }
.zoom-val { font-family:var(--font-mono); font-size:9px; color:var(--text-faint); text-align:center; margin-top:2px; pointer-events:none; }
.minimap-wrap { position:absolute; top:10px; left:12px; width:120px; height:80px; background:rgba(8,8,12,0.6); backdrop-filter:blur(0px); border:1px solid var(--border-strong); border-radius:6px; overflow:hidden; pointer-events:none; }
.minimap.wrap canvas { display:block; width:100%; height:100%; }
.agent-nodeinfo { position:absolute; top:10px; right:12px; font-family:var(--font-mono); font-size:10.5px; color:var(--text); background:rgba(8,8,12,0.75); backdrop-filter:blur(8px); padding:6px 10px; border-radius:8px; border:1px solid var(--border-strong); pointer-events:none; opacity:0; transition:opacity .15s; max-width:240px; }
.agent-nodeinfo.show { opacity:1; }
.node-detail { position:absolute; top:0; right:0; bottom:0; width:300px; max-width:65%; background:rgba(12,12,15,0.92); backdrop-filter:blur(16px); border-left:1px solid var(--border-strong); transform:translateX(100%); transition:transform .3s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; z-index:10; overflow:hidden; }
.node-detail.open { transform:translateX(0); }
.nd-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 10px; border-bottom:1px solid var(--border); }
.nd-head-left { display:flex; align-items:center; gap:10px; }
.nd-type-dot { width:10px; height:10px; border-radius:50%; box-shadow:0 0 8px currentColor; }
.nd-type-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--text-dim); }
.nd-close { width:26px; height:26px; border-radius:7px; background:transparent; border:none; color:var(--text-dim); cursor:pointer; display:flex; align-items:center; justify-content:center; }
.nd-close:hover { background:var(--surface); color:var(--text); }
.nd-body { flex:1; overflow-y:auto; padding:14px 16px; }
.nd-label { font-size:16px; font-weight:600; color:var(--text); margin-bottom:14px; }
.nd-section { margin-bottom:16px; }
.nd-section-title { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin-bottom:6px; }
.nd-thinking { font-size:12.5px; line-height:1.65; color:var(--text); background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px; padding:10px 12px; white-space:pre-wrap; word-wrap:break-word; }
.nd-meta-row { display:flex; justify-content:space-between; font-size:11px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
.nd-meta-row:last-child { border-bottom:none; }
.nd-meta-key { color:var(--text-faint); font-family:var(--font-mono); }
.nd-meta-val { color:var(--text-dim); font-family:var(--font-mono); text-align:right; }
.approval-card { margin:4px 0 16px; max-width:500px; background:var(--surface); border:1px solid var(--approval); border-radius:var(--radius); overflow:hidden; animation:fadeUp .35s ease both; }
.approval-header { display:flex; gap:12px; padding:14px 16px; background:rgba(249,115,22,0.08); border-bottom:1px solid var(--border); }
.approval-icon { font-size:20px; }
.approval-header h4 { font-size:14px; margin-bottom:2px; }
.approval-header p { font-size:12px; color:var(--text-dim); }
.approval-body { padding:14px 16px; }
.approval-body label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin-bottom:4px; }
.approval-body code, .approval-body pre { font-family:var(--font-mono); font-size:12px; background:var(--bg); padding:8px 10px; border-radius:var(--radius-sm); display:block; overflow-x:auto; margin-bottom:12px; }
.approval-actions { display:flex; gap:8px; padding:0 16px 14px; }
.btn-approve { flex:1; padding:8px; background:var(--done); color:#000; border:none; border-radius:var(--radius-sm); font-weight:600; font-size:13px; cursor:pointer; }
.btn-deny { flex:1; padding:8px; background:var(--danger); color:#fff; border:none; border-radius:var(--radius-sm); font-weight:600; font-size:13px; cursor:pointer; }
.input-area { position:absolute; bottom:0; left:0; right:0; padding:16px 24px 20px; background: linear-gradient(180deg, transparent, var(--bg) 40%); pointer-events:none; }
.input-bar { max-width:820px; margin:0 auto; background:var(--surface); border:1px solid var(--border-strong); border-radius:18px; padding:8px 8px 8px 16px; display:flex; align-items:center; gap:10px; box-shadow:0 4px 30px rgba(0,0,0,0.4); pointer-events:auto; }
.input-bar:focus-within { border-color:rgba(163,163,255,0.4); box-shadow:0 4px 30px rgba(0,0,0,0.4), 0 0 0 3px rgba(163,163,255,0.08); }
.input-bar textarea { flex:1; background:transparent; border:none; outline:none; resize:none; color:var(--text); font-family:var(--font-body); font-size:13.5px; line-height:1.5; max-height:160px; padding:6px 0; }
.input-bar textarea::placeholder { color:var(--text-faint); }
.send-btn { width:34px; height:34px; border-radius:50%; background:var(--accent); color:#0a0a0b; border:none; display:flex; align-tems:center; justify-content:center; cursor:pointer; }
.send-btn:hover { filter:brightness(1.1); }
.send-btn:disabled { opacity:.4; cursor:default; }
.input-hint { max-width:820px; margin:8px auto 0; text-align:center; font-size:10.5px; color:var(--text-faint); }
.typing-indicator { display:flex; gap:4px; padding:4px 0; }
.typing-indicator span { width:8px; height:8px; border-radius:50%; background:var(--text-faint); animation:typing 1.4s infinite; }
.typing-indicator span:nth-child(2) { animation-delay:.2s; }
.typing-indicator span:nth-child(3) { animation-delay:.4s; }
Keyframes typing { 0%,60%,100%{opacity:.3;} 30%{opacity:1;} }
::-webkit-scrollbar { width:8px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:4px; }
@media (max-width:860px) { .sidebar { display:none; } .suggestions { grid-template-columns:1fr; } }
`;
\n\n\nexport function App() {
  const { messages, isStreaming, approvalRequests, sessionId, error, sendMessage, approveTool, resetSession } = useAgentSession()\n  const [input, setInput] = useState('')\n  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef<AgentGraph | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [stepCount, setStepCount] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailContent, setDetailContent] = useState({ label: '', type: '', thinking: '', meta: '' })
\n  useEffect(() => {
    if (canvasRef.current && !graphRef.current) {\n      const g = new AgentGraph(canvasRef.current!, minimapRef.current, {})
      g.onNodeSelect = (node: GraphNode) => {\n        g.selectedNode = node\n        const def = NODE_TYPES[node.type]
        const d = node.detail
        let meta = ''\n        if (d.model) meta += `<div class="nd-meta-row"><span class="nd-meta-key">model</span><span class="nd-meta-val">${escapeHtml(d.model)}</span></div>`!
        if (d.toolName) meta += `<div class="nd-meta-row"><span class="nd-meta-key">tool</span><span class="nd-meta-val">${eescapeHtml(d.toolName)}</span></div>`
        if (d.status) meta += `<div class="nd-meta-row"><span class="nd-meta-key">status</span><span class="nd-meta-val">${d.status}</span></div>`
        meta += `<div class="nd-meta-row"><span class="nd-meta-key">node_id</span><span class="nd-meta-val">#${node.id}</span></div>`!
        setDetailContent({ label: node.label, type: def.label, thinking: d.thinking || d.result || 'No details recorded.', meta })
        setDetailOpen(true)\n      }\n      graphRef.current = g\n    }\n  }, [])\n\n  useEffect(() => {\n    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })\n    if (graphRef.current) {\n      setNodeCount(graphRef.current.nodes.length)\n      setStepCount(graphRef.current.nodes.length)\n    }\n  }, [messages, approvalRequests])\n\n  const handleSubmit = (e: React.FormEvent) => {\n    e.preventDefault()\n    if (!input.trim() || isStreaming) return\n    const content = input.trim()\n    setInput('')\n    sendMessage(content, graphRef.current!)\n  }\n\n  return (\n    <>\n      <style>{CSS}</style>\n      <div className=\"app\">\n        <aside className=\"sidebar\">\n          <div className=\"sidebar-head\">\n            <div className=\"logo-mark\"></div>\n            <span className=\"logo-text\">ForgeOps</span>\n          </div>\n          <button className=\"new-chat\" onClick={resetSession}>+ New Session</button>\n          <nav className=\"nav\">\n            <div className=\"nav-item active\">>٘¥ Chat</div>\n            <div className=\"nav-item\">👊Code Reviews</div>\n            <div className=\"nav-item\">🌯Incidents</div>\n          </nav>\n          <div className=\"divider\"></div>\n          <div className=\"agent-status-sidebar\">\n            <div className=\"status-row\"><span className=\"status-label\">Model</span><span className=\"status-value\">sarvam-105b</span></div>\n            <div className=\"status-row\"><span className=\"status-label\">MCP</span><span className=\"status-value\">GitHub</span></div>\n            <div className=\"status-row\"><span className=\"status-label\">Sandbox</span><span className=\"status-value\">Daytona</span></div>\n            <div className=\"status-row\"><span className=\"status-label\">Approval</span><span className=\"status-value\">Write + Dest.</span></div>\n          </div>\n          <div className=\"sidebar-bottom\">\n            <p className=\"version\">ForgeOps v0.2 · TrueForge Hackathon</p>\n          </div>\n        </aside>\n        <main className=\"main\">\n          <div className=\"topbar\">\n            <div className=\"topbar-left\">\n              <span className={`dot ${isStreaming ? 'streaming' : sessionId ? 'online' : ''}`}></span>\n              <span>{isStreaming ? 'Agent working...' : sessionId ? 'Ready' : 'Idle'}</span>\n              {sessionId && <span className=\"session-id\">Session: {sessionId.slice(0, 8)}‥p�</span>}\n            </div>\n            <div className=\"model-pill\">sarvam-105b</div>\n          </div>\n          <div className=\"chat-scroll\" id=\"chatScroll\">\n            <div className=\"chat-inner\" id=\"chatInner\">\n              {messages.length === 0 && (\n                <div className=\"welcome\">\n                  <div className=\"welcome-mark\">�</div>\n                <div className=\"welcome-sub\">Welcome to ForgeOps</div>\n                <div className=\"welcome-title\">Agent Node Visualizer</div>\n                <div className=\"suggestions\">\n                  <div className=\"sugg-card\" onClick={() => sendMessage('Review PR #1 — check for security issues and run the test suite', graphRef.current!)}>\n                    <div className=\"sugg-icon\">👉</div>\n                    <div className=\"sugg-text\">Review a pull request</div>\n                    <div className=\"sugg-sub\">Read the diff, run tests, post a review</div>\n                  </div>\n                  <div className=\"sugg-card\" onClick={() => sendMessage('Payment failures are spiking. Investigate recent deploys and find the root cause.', graphRef.current!)}>\n                    <div className=\"sugg-icon\">🌯</div>\n                    <div className=\"sugg-text\">Debug an incident</div>\n                    <div className=\"sugg-sub\">Bisect deploys, find the culprit, propose a fix</div>\n                  </div>\n                </div>\n                </div>\n              )}\n\n              {error && <div className=\"error-banner\"><b>Error:</b> {error}</div>}\n\n              {messages.length > 0 && (\n                <div className=\"agent-panel\">\n                  <div className={`agent-panel-head ${!isStreaming ? 'done' : ''}`}>\n                    <div className=\"agent-panel-title\">\n                      <span className=\"agent-pulse\"></span>\n                      <span>Agent Workflow</span>\n                    </div>\n                    <div className=\"agent-stats\"><span>{nodeCount}</span> nodes » <span>{stepCount}</span> steps</div>\n                  </div>\n                  <div className=\"agent-canvas-wrap\">\n                    <canvas ref={canvasRef} id=\"agentCanvas\"></canvas>\n                    <div className=\"minimap.wrap\"><canvas ref={minimapRef} id=\"minimapCanvas\"></canvas></div>\n                    <div className=\"agent-legend\">\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#b4a0ff'}}}></span>Prompt</span>\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#7dd3c0'}}}></span>Thinking</span>\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#e0b34a'}}></span>Tool</span>\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#8ab4f5'}}></span>File</span>\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#f97316'}}></span>Approval</span>\n                    <span className=\"leg\"><span className=\"leg-dot\" style={{background:'#6fcf97'}}}></span>Answer</span>\n                  </div>\n                    <div className=\"zoom-controls\">\n                    <button id=\"zoomPlus\">+</button>\n                    <button id=\"zoomMinus\">‎</button>\n                    <button id=\"zoomReset\">→</button>\n                    <span className=\"zoom-val\" id=\"zoomVal\">100%</span>\n                  </div>\n                  <div className=\"agent-nodeinfo\" id=\"nodeInfo\"></div>\n                  <div className={`node-detail ${detailOpen ? 'open' : ''}`}>\n                    <div className=\"nd-head\">\n                      <div className=\"nd-head-left\">\n                        <span className=\"nd-type-dot\" style={{ color: NODE_TYPES[detailContent.type as keyof typeof NODE_TYPES]?.color || '#7dd3c0', background: NODE_TYPES[detailContent.type as keyof typeof NODE_TYPES]?.color || '#7dd3c0' }}></span>\n                        <span className=\"nd-type-label\">{detailContent.type}</span>\n                      </div>\n                      <button className=\"nd-close\" onClick={() => setDetailOpen(false)}>◓</button>\n                    </div>\n                    <div className=\"nd-body\">\n                      <div className=\"nd-label\">{detailContent.label}</div>\n                      <div className=\"nd-section\">\n                        <div className=\"nd-section-title\">Details</div>\n                        <div className=\"nd-thinking\">{detailContent.thinking}</div>\n                      </div>\n                      {detailContent.meta && (\n                        <div className=\"nd-section\">\n                         <div className=\"nd-section-title\">Metadata</div>\n                         <div dangerouslySetInnerHTML={{ __html: detailContent.meta }} />\n                        </div>\n                      )}\n                    </div>\n                  </div>\n                </div>\n              </div>\n              }\n\n              {messages.map((msg) => (\n                <div key={msg.id} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`}>\n                  {msg.role === 'user' ? (\n                  <div className=\"bubble-user\">{msg.content}</div>\n                ) : (\n                  <>\n                  <div className=\"ai-avatar\"></div>\n                  <div className=\"ai-body\">\n                    <div className=\"ai-text\" dangerouslySetInnerHTML={{ __html: msg.content ? renderMarkdown(msg.content) : '<div className=\"typing-indicator\"><span></span> <span></span> <span></span></div>' }} />\n                  </div>\n                  </>\n                )}\n              </div>\n            ))}\n\n             {approvalRequests.map((ar) => (\n                <div className=\"approval-card\" key={ar.id}>\n                  <div className=\"approval-header\">\n                    <span className=\"approval-icon\">🂿【</span>\n                    <div>\n                      <h4>Approval Required</h4>\n                      <p>The agent wants to run a write/destructive tool.</p>\n                    </div>\n                  </div>\n                  <div className=\"approval-body\">\n                    <label>Tool</label>\n                    <code>{ar.toolName}</code>\n                    <label>Arguments</label>\n                    <pre>{JSON.stringify(sar.toolArguments, null, 2).slice(0, 500)}</pre>\n                  </div>\n                  <div className=\"approval-actions\">\n                    <button className=\"btn-approve\" onClick={() => approveTool(ar.id, true, undefined, graphRef.current || undefined)}>◪´Hellow</button>\n                    <button className=\"btn-deny\" onClick={() => approveTool(ar.id, false, 'Denied by user', graphRef.current || undefined)}>�ìDeny</button>\n                  </div>\n                </div>\n            ))}\n\n              <div ref={messagesEndRef} />\n            </div>\n          </div>\n\n          <div className=\"input-area\">\n            <form className=\"input-bar\" onSubmit={handleSubmit}>\n              <textarea\n                value={input}\n                onChange={(e) => setInput(e.target.value)}\n                placeholder=\"Ask ForgeOps to review a PR or debug an incident...\"\n                disabled={isStreaming}\n                rows={1}\n              />\n              <button type=\"submit\" className=\"send-btn\" disabled={isStreaming || !input.trim()}>‖</button>\n            </form>\n            <div className=\"input-hint\">ForgeOps uses TrueForge — tool calls, sandbox execution, and approval gating happen in real time.</div>\n          </div>\n        </main>\n      </div>\n    <>\n  )\n}\n\nfunction escapeHtml(s: string) {\n  return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')\n}