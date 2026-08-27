# ForgeOps

> A custom web UI for a TrueForge agent with **node-graph visualization** â€” watch the agent think, call tools, and pause for approval in real time.
> Built for the [Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge).

ForgeOps replaces TrueForge's default terminal UI with a custom dashboard. Every agent action â€” thinking, tool calls, file edits, approvals â€” appears as a glowing node in a radial topology graph. You see the agent's reasoning unfold visually, not as plain text.

---

## What the agent does

### 1. Code Review
- Fetches the PR diff and changed files via the GitHub MCP
- Clones the repo into the Daytona sandbox and runs the test suite
- Analyzes the code for bugs, security issues, and logic errors
- **Pauses for approval** before posting the review comment

### 2. Incident Debugging â†’ Post-mortem â†’ Fix
- Fetches recent deploys and relevant code via the GitHub MCP
- Writes and runs a bisect script in the sandbox to find the culprit commit
- Identifies the root cause
- **Pauses for approval** before any rollback or destructive action

---

## Node-graph visualization

Instead of plain-text "thinking" blocks, the agent's internal steps appear as nodes in a radial topology graph:

| Node type | Color | Meaning |
|-----------|-------|---------|
| Prompt | Purple | Your input â€” central hub |
| Thinking | Teal | Model reasoning between steps |
| Tool Call | Amber | GitHub MCP or sandbox tool executing |
| File Edit | Blue | Code being written or modified |
| Approval | Orange | Write/destructive action â€” waiting for you |
| Answer | Green | Final response delivered |

**Features:** zoom (scroll or buttons), pan (click-drag), minimap, node detail drawer (click any node), hover tooltips, traveling pulse particles along edges.

---

## Architecture

```
Browser (React UI with node-graph canvas)
    â”‚
    â”‚  @truefoundry/trueforge-sdk (HTTP + SSE)
    â”‚
    â–¼
TrueForge Server (localhost:8790)
    â”‚
    â”œâ”€â”€ Model: Sarvam 105B (via OpenAI-compatible endpoint)
    â”œâ”€â”€ MCP Server: GitHub (OAuth, connected in Settings)
    â””â”€â”€ Sandbox: Daytona (isolated code execution)
```

### Project structure

```
forgeops/
â”œâ”€â”€ index.html              # HTML entry point
â”œâ”€â”€ package.json            # Dependencies & scripts
â”œâ”€â”€ vite.config.ts          # Vite config (with proxy to TrueForge)
â”œâ”€â”€ tsconfig.json           # TypeScript config
â”œâ”€â”€ tsconfig.node.json      # TypeScript config for Vite
â”œâ”€â”€ .env.example            # Environment variable template
â”œâ”€â”€ .gitignore
â”œâ”€â”€ public/
â”‚   â””â”€â”€ forgeops.svg        # Logo
â””â”€â”€ src/
    â”œâ”€â”€ main.tsx            # React entry point
    â”œâ”€â”€ App.tsx             # Main app: sidebar, chat, node-graph canvas, approval cards
    â”œâ”€â”€ agent-graph.ts      # AgentGraph class â€” radial node visualization engine
    â”œâ”€â”€ useAgentSession.ts   # TrueForge session lifecycle (stream, approve, reset)
    â””â”€â”€ types.ts            # All type definitions
```

---

## Prerequisites

1. **Node.js 24+** (or Node 20 minimum)
2. **TrueForge server** â€” running locally or in GitHub Codespaces
3. **Sarvam 105B** â€” configured as an OpenAI-compatible provider in TrueForge (â‚¹100 free credits, no rate limits)
4. **Daytona account** â€” for the sandbox (free tier works)
5. **GitHub MCP** â€” connected via TrueForge's Settings â†’ Connectors

---

## Setup

### 1. Start the TrueForge server

```bash
npx @truefoundry/trueforge
```

Runs on `http://localhost:8790` with SQLite storage.

### 2. Configure TrueForge (in the TrueForge UI at localhost:8790)

- **Settings â†’ Models**: Configure Sarvam 105B as an OpenAI provider:
  - Base URL: httÎ‹ËØ\KœØ\˜[K˜ZKİŒXˆHTHÙ^Nˆ[İ\ˆØ\˜[HTHÙ^Hœ›ÛHÙ\Ú›Ø\™œØ\˜[K˜ZWJÎ‹ËÙ\Ú›Ø\™œØ\˜[K˜ZJBˆH[Ù[QˆØ\˜[KLLX˜‹H
Š”Ù][™ÜÈ8¡¤ˆÛÛ›™XİÜœÊŠˆXÚÈÚ]Xˆœ›ÛHHØ][ÙËÛÛ\]HĞ]]‹H
Š”Ù][™ÜÈ8¡¤ˆØ[™›Ş›İšY\œÊŠˆXÚÈ^]Û˜K\İH[İ\ˆTHÙ^B‚ˆÈÈÈËˆÛÛ™H[™[œİ[\Èœ›Û[™‚˜˜\Ú™Ú]ÛÛ™HÎ‹ËÙÚ]X‹˜ÛÛKÜİ[X[›][™YÚLNN‹[XZÙ\‹Ù›Ü™Ù[ÜË™Ú]˜Ù›Ü™Ù[ÜÂ›œH[œİ[˜‚ˆÈÈÈˆÛÛ™šYİ\™H[š\›Û›Y[‚˜˜\Ú˜Ü™[‹™^[\H™[‚˜‚‘Y]™[˜Yˆ[İ\ˆYQ›Ü™ÙHÙ\™\ˆ\È›İ]HY˜][T“‚‚ˆÈÈÈKˆ[ˆHœ›Û[™‚˜˜\Ú›œH[ˆ]‚˜‚“Ü[ˆ‹ËÛØØ[ÜİŒÌ8 %[İHÚİ[ÙYHH›Ü™ÙSÜÈ\Ú›Ø\™Ú]H›ÙKYÜ˜\Ø[˜\Ë‚‚‹KKB‚ˆÈÈ\Ú[™ÈHYÙ[‚ÛXÚÈHİYÙÙ\İ[ÛˆØ\™Üˆ\HHY\ÜØYÙN‚‚‹H
Šˆ”™]šY]ÈˆÌHŠŠˆ8 %HYÙ[™]Ú\ÈH‹[œÈ\İÈ[ˆHØ[™›Ş[™]\Ù\È™Y›Ü™HÜİ[™ÈH™]šY]Â‹H
Šˆ”^[Y[˜Z[\™\È\™HÜZÚ[™Ëˆ[™\İYØ]H™XÙ[\Ş\ËˆŠŠˆ8 %HYÙ[š\ÙXİÈ[ˆHØ[™›Ş[™]\Ù\È™Y›Ü™H[H›Û˜XÚÂ‚•Ú[ˆHYÙ[]ÈHÜš]HÜˆ\İXİ]™HXİ[Û‹[ˆ
Š\›İ˜[Ø\™
Šˆ\X\œËˆÛXÚÈ
Š[İÊŠˆÜˆ
Š‘[JŠ‹‚‚‹KKB‚ˆÈÈ[ÙÈÛÙH™]šY]ÈÙ]\‚‘]™\HİX›Z\ÜÚ[Ûˆ]\İ[ˆİXœİ[]™HÚ[™Ù\È›İYÚ[ÙË\™]šY]ÙY[™\]Y\İË‚‚ˆÈÈÈÛ™K][YHÙ]\‚ŒKˆÚYÛˆ[ˆÈÔ[Ù×JÎ‹ËİİİËœ[ÙË˜ZKÊH
MY^Hœ™YHšX[Ûİ™\œÈHXÚØ]ÛŠBŒ‹ˆÛÈÈ
Š’[YÜ˜][ÛœÈ8¡¤ˆØXTÈ8¡¤ˆÚ]Xˆ8¡¤ˆY[œİ[][ÛŠŠ‚ŒËˆ]]Üš\ÙH[ÙÈ›Üˆ\È™\ÜÚ]ÜB‚ˆÈÈÈÛÜšÙ›İÈ›Üˆ]™\HÚ[™ÙB‚ŒKˆÜ™X]HHœ˜[˜ÚˆÚ]ÚXÚÛİ]Xˆ™X]Ş[İ\‹Y™X]\™XŒ‹ˆXZÙH[İ\ˆÚ[™Ù\È[™ÛÛ[Z]ŒËˆ\Ú[™Ü[ˆH[™\]Y\İˆ[ÙÈ™]šY]ÜÈ]]ÛX]XØ[H
ÛÛ[Y[Ü[ÙØYˆ]Ù\Û‰İ
BKˆš^]™\H
Š’YÚ
ŠˆÙ]™\š]Hš[™[™È™Y›Ü™HY\™Ú[™Â‹ˆ
Š‘È›İ\Ú\™XİHÈXZ[˜
Š‚‚ˆÈÈÈ™]šY]ÙY‚‚ˆ
Š”™]šY]ÙYŠŠˆÎ‹ËÙÚ]X‹˜ÛÛKÜİ[X[›][™YÚLNN‹[XZÙ\‹Ù›Ü™Ù[ÜËÜ[ÌB‚‹KKB‚ˆÈÈ]™[ÜY[‚˜˜\Ú›œH[ˆ]ˆÈİ\]ˆÙ\™\ˆ
ØØ[ÜİŒÌ
B›œH[ˆZ[È›ÙXİ[ÛˆZ[›œH[ˆ\XÚXÚÈÈ\KXÚXÚÈÚ]İ][Z][™Â›œH[ˆ™]šY]ÈÈ™]šY]È›ÙXİ[ÛˆZ[˜‚‹KKB‚ˆÈÈ[›š[™È[ˆÚ]XˆÛÙ\ÜXÙ\Â‚’Yˆ[İ\ˆØØ[ÔÈÙ\Û‰İİ\ÜYQ›Ü™ÙH
Ú[™İÜÊK\ÙHÛÙ\ÜXÙ\Î‚‚ŒKˆÛÈÈÙÚ]X‹˜ÛÛKØÛÙ\ÜXÙ\×JÎ‹ËÙÚ]X‹˜ÛÛKØÛÙ\ÜXÙ\ÊH8¡¤ˆ™]ÈÛÙ\ÜXÙH8¡¤ˆXÚÈ\È™\ÂŒ‹ˆ[œİ[›ÙKšœÎˆİ\›YœÔÓÎ‹ËÙX‹››Ù\Ûİ\˜ÙK˜ÛÛKÜÙ]\ÌİYÈQH˜\ÚH	‰ˆİYÈ\[œİ[^H›ÙZœØŒËˆİ\YQ›Ü™ÙNˆœYY›İ[™KİYY›Ü™ÙXˆ[ˆHÙXÛÛ™\›Z[˜[ˆœH[œİ[	‰ˆœH[ˆ]˜KˆÜ[ˆH›ÜØ\™YÜÌ[ˆ[İ\ˆœ›İÜÙ\‚‚”Ù][™ÜÈ\œÚ\İXÜ›ÜÜÈÛÙ\ÜXÙH™\İ\È
İÜ™Y[ˆÔS]HÛˆ\ÚÊK‚‚‹KKB‚ˆÈÈXÚØ]ÛˆİX›Z\ÜÚ[ÛˆÚXÚÛ\İ‚‹HŞHX›XÈ™\ÈÚ]HÛÜšÚ[™È‘PQQB‹HŞHYÙ[[œÈ›İYÚYQ›Ü™ÙH
›İH[ˆÜ˜\\ŠB‹HŞHYÙHØ[ˆÙYNˆ™X[ÛÛ™XXÚY
Ú]XˆPÔ
KÛÙH[ˆ[ˆØ[™›Ş]\ÙH›Üˆ\›İ˜[‹HŞH›ÙKYÜ˜\š\İX[^˜][ÛˆÙˆYÙ[ÛÜšÙ›İÂ‹HÈH[[ÈšY[È
ŒÈZ[]\ÊHÚİÚ[™È[™YH[\œÂ‹HÈHÚÜÜš]K]\ÙˆÚ]HYÙ[Ù\È[™İÈ]\Ù\ÈYQ›Ü™ÙB‹HŞH]X\İÛ™H[ÙË\™]šY]ÙYˆ[šÙY[ˆ\È‘PQQB‹HŞH›ÈÙXÜ™]ÈÜˆ\œÛÛ˜[]H[ˆH™\Â‚‹KKB‚ˆÈÈXÚİXÚÂ‚‹H
Š”™XXİNJŠˆ
È
Š•\TØÜš\
Šˆ8 %œ›Û[™‹H
Š•š]HŠŠˆ8 %Z[ÛÛ	ˆ]ˆÙ\™\‚‹H
ŠYY›İ[™KİYY›Ü™ÙK\ÙÊŠˆ8 %YQ›Ü™ÙHÛY[

ÈÔÑJB‹H
ŠØ[˜\ÈTJŠˆ8 %İ\İÛH›ÙKYÜ˜\š\İX[^˜][Ûˆ
›È^\›˜[Ü˜\Xœ˜\JB‹H
Š”Ø\˜[HLPŠŠˆ8 %[Ù[šXHÜ[RKXÛÛ\]X›H[™Ú[‹H
Š‘^]Û˜JŠˆ8 %Ø[™›Ş›İšY\ˆ
šXHYQ›Ü™ÙJB‹H
Š‘Ú]XˆPÔ
Šˆ8 %FööÂ66W72‡f–G'VTf÷&vR ¢ÒÒĞ ¢22Æ–6Vç6P ¤Ô•