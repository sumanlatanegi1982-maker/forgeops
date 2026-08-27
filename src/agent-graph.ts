/**
 * ForgeOps — Agent Graph Engine
 *
 * Radial topology visualization. Nodes bloom outward from a central
 * prompt hub. Each agent event (thinking, tool call, file edit, approval)
 * adds a glowing node connected by curved arcs with traveling pulses.
 *
 * Features: zoom, pan, minimap, node detail drawer, hover tooltips.
 */

import { NODE_TYPES, type GraphNode, type NodeType, type NodeDetail } from './types'

interface GraphEdge {
  a: number
  b: number
  born: number
  progress: number
}

export class AgentGraph {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  miniCanvas: HTMLCanvasElement | null
  miniCtx: CanvasRenderingContext2D | null
  zoomBtns: { plus?: HTMLButtonElement; minus?: HTMLButtonElement; reset?: HTMLButtonElement; val?: HTMLElement } | null
  nodes: GraphNode[] = []
  edges: GraphEdge[] = []
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  running = false
  zoom = 1
  panX = 0
  panY = 0
  mouse = { x: -999, y: -999, down: false, dragNode: null as GraphNode | null, panning: false, lastX: 0, lastY: 0, moved: false, downNode: null as GraphNode | null }
  hoveredNode: GraphNode | null = null
  selectedNode: GraphNode | null = null
  onNodeSelect: ((node: GraphNode) => void) | null = null
  tooltip: HTMLElement | null = null
  w = 0
  h = 0
  cx = 0
  cy = 0
  mw = 0
  mh = 0

  constructor(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement | null, zoomBtns: typeof AgentGraph.prototype.zoomBtns) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.miniCanvas = minimapCanvas
    this.miniCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null
    this.zoomBtns = zoomBtns
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.bindEvents()
    requestAnimationFrame(() => this.loop())
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    this.w = r.width; this.h = r.height
    this.canvas.width = Math.max(1, r.width * this.dpr)
    this.canvas.height = Math.max(1, r.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.cx = this.w / 2; this.cy = this.h / 2
    if (this.miniCanvas) {
      const mr = this.miniCanvas.getBoundingClientRect()
      this.miniCanvas.width = Math.max(1, mr.width * this.dpr)
      this.miniCanvas.height = Math.max(1, mr.height * this.dpr)
      this.miniCtx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      this.mw = mr.width; this.mh = mr.height
    }
  }

  toWorld(sx: number, sy: number) { return { x: (sx - this.cx - this.panX) / this.zoom, y: (sy - this.cy - this.panY) / this.zoom } }
  toScreen(wx: number, wy: number) { return { x: wx * this.zoom + this.cx + this.panX, y: wy * this.zoom + this.cy + this.panY } }

  bindEvents() {
    const c = this.canvas
    c.addEventListener('mousemove', (e: MouseEvent) => {
      const r = c.getBoundingClientRect()
      this.mouse.x = e.clientX - r.left
      this.mouse.y = e.clientY - r.top
      if (this.mouse.panning) {
        this.panX += this.mouse.x - this.mouse.lastX
        this.panY += this.mouse.y - this.mouse.lastY
        this.mouse.lastX = this.mouse.x; this.mouse.lastY = this.mouse.y
        this.mouse.moved = true
      } else if (this.mouse.dragNode) {
        const w = this.toWorld(this.mouse.x, this.mouse.y)
        this.mouse.dragNode.tx = w.x; this.mouse.dragNode.ty = w.y
      }
    })
    c.addEventListener('mousedown', () => {
      this.mouse.down = true; this.mouse.moved = false
      this.mouse.lastX = this.mouse.x; this.mouse.lastY = this.mouse.y
      this.mouse.downNode = this.pickNode(this.mouse.x, this.mouse.y)
      if (this.mouse.downNode) { this.mouse.dragNode = this.mouse.downNode }
      else { this.mouse.panning = true }
    })
    c.addEventListener('mouseup', () => {
      if (!this.mouse.moved && this.mouse.downNode && this.onNodeSelect) { this.onNodeSelect(this.mouse.downNode) }
      this.mouse.dragNode = null; this.mouse.panning = false; this.mouse.down = false; this.mouse.downNode = null
    })
    c.addEventListener('mouseleave', () => {
      this.mouse.x = -999; this.mouse.y = -999
      this.mouse.dragNode = null; this.mouse.panning = false; this.mouse.downNode = null
    })
    c.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      this.setZoom(this.zoom * factor, this.mouse.x, this.mouse.y)
    }, { passive: false })
    if (this.zoomBtns) {
      this.zoomBtns.plus?.addEventListener('click', () => this.setZoom(this.zoom * 1.2))
      this.zoomBtns.minus?.addEventListener('click', () => this.setZoom(this.zoom / 1.2))
      this.zoomBtns.reset?.addEventListener('click', () => { this.zoom = 1; this.panX = 0; this.panY = 0; this.updateZoomLabel() })
    }
  }

  setZoom(z: number, sx?: number, sy?: number) {
    const old = this.zoom
    this.zoom = Math.max(0.3, Math.min(3, z))
    if (sx !== undefined && sy !== undefined) {
      this.panX = (this.panX + (sx - this.cx)) * (this.zoom / old) - (sx - this.cx)
      this.panY = (this.panY + (sy - this.cy)) * (this.zoom / old) - (sy - this.cy)
    }
    this.updateZoomLabel()
  }
  updateZoomLabel() { if (this.zoomBtns?.val) this.zoomBtns.val.textContent = Math.round(this.zoom * 100) + '%' }

  pickNode(sx: number, sy: number): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]
      const s = this.toScreen(n.x, n.y)
      const dx = s.x - sx, dy = s.y - sy
      const hitR = (n.r + 6) * this.zoom
      if (dx * dx + dy * dy < hitR * hitR) return n
    }
    return null
  }

  reset() {
    this.nodes = []; this.edges = []; this.running = true
    this.zoom = 1; this.panX = 0; this.panY = 0
    this.updateZoomLabel()
  }

  addNode(type: NodeType, label: string, parent: GraphNode | null = null, detail: NodeDetail = {}): GraphNode {
    let x = 0, y = 0
    if (parent) {
      const pAng = Math.atan2(parent.y, parent.x)
      const spread = 0.7 + Math.random() * 0.4
      const ang = pAng + (Math.random() < 0.5 ? -1 : 1) * spread * 0.5
      const dist = 85 + Math.random() * 30
      x = parent.x + Math.cos(ang) * dist
      y = parent.y + Math.sin(ang) * dist
    }
    const n: GraphNode = {
      id: this.nodes.length, type, label,
      x: parent ? parent.x : 0, y: parent ? parent.y : 0,
      tx: x, ty: y, r: 0,
      targetR: type === 'root' ? 14 : (type === 'output' || type === 'approval' ? 12 : 8),
      born: performance.now(),
      parent: parent ? parent.id : null,
      pulse: 1, ringPhase: Math.random() * Math.PI * 2, detail,
    }
    this.nodes.push(n)
    if (parent) this.edges.push({ a: parent.id, b: n.id, born: performance.now(), progress: 0 })
    return n
  }

  finish() { this.running = false }

  simulate() {
    for (const n of this.nodes) {
      if (n.r < n.targetR) n.r += (n.targetR - n.r) * 0.15
      n.x += (n.tx - n.x) * 0.12; n.y += (n.ty - n.y) * 0.12
      if (n.pulse > 0) n.pulse -= 0.008
    }
    for (const e of this.edges) { if (e.progress < 1) e.progress = Math.min(1, e.progress + 0.035) }
  }

  hexA(hex: string, a: number) {
    const h = hex.replace('#', '')
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16)
    return `rgba(${r},${g},${b},${a})`
  }
  lighten(hex: string, amt: number) {
    const h = hex.replace('#', '')
    let r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16)
    r = Math.min(255, Math.round(r + (255 - r) * amt))
    g = Math.min(255, Math.round(g + (255 - g) * amt))
    b = Math.min(255, Math.round(b + (255 - b) * amt))
    return `rgb(${r},${g},${b})`
  }
  darken(hex: string, amt: number) {
    const h = hex.replace('#', '')
    let r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16)
    return `rgb(${Math.round(r * (1 - amt))},${Math.round(g * (1 - amt))},${Math.round(b * (1 - amt))})`
  }
  truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s }

  qbezier(p0: number, p1: number, p2: number, t: number) { const u = 1 - t; return u * u * p0 + 2 * u * t * p1 + t * t * p2 }

  draw() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    const gs = 28
    const ox = ((this.panX % gs) + gs) % gs
    const oy = ((this.panY % gs) + gs) % gs
    for (let x = ox; x < this.w; x += gs) for (let y = oy; y < this.h; y += gs) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill() }
    const ccx = this.cx + this.panX, ccy = this.cy + this.panY
    ctx.strokeStyle = 'rgba(180,160,255,0.04)'; ctx.lineWidth = 1
    for (let rad = 60; rad < 400; rad += 60) { ctx.beginPath(); ctx.arc(ccx, ccy, rad * this.zoom, 0, Math.PI * 2); ctx.stroke() }
    const now = performance.now()
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b]
      if (!a || !b) continue
      const sa = this.toScreen(a.x, a.y), sb = this.toScreen(b.x, b.y)
      const t = e.progress
      const ex = sa.x + (sb.x - sa.x) * t, ey = sa.y + (sb.y - sa.y) * t
      const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2
      const dx = sb.x - sa.x, dy = sb.y - sa.y
      const cpx = mx + (-dy * 0.15), cpy = my + (dx * 0.15)
      const ca = NODE_TYPES[a.type].color, cb = NODE_TYPES[b.type].color
      const grad = ctx.createLinearGradient(sa.x, sa.y, ex, ey)
      grad.addColorStop(0, this.hexA(ca, 0.5)); grad.addColorStop(1, this.hexA(cb, 0.5))
      ctx.strokeStyle = grad; ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke()
      if (t >= 1) {
        const tp = ((now / 1600) + e.b * 0.17) % 1
        const px = this.qbezier(sa.x, cpx, sb.x, tp)
        const py = this.qbezier(sa.y, cpy, sb.y, tp)
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = this.hexA(cb, 0.9)
        ctx.shadowBlur = 6; ctx.shadowColor = this.hexA(cb, 0.8)
        ctx.fill(); ctx.shadowBlur = 0
      }
    }
    this.hoveredNode = this.pickNode(this.mouse.x, this.mouse.y)
    for (const n of this.nodes) {
      const def = NODE_TYPES[n.type]
      const age = (now - n.born) / 350
      const appear = Math.min(1, age)
      const r = n.r * appear
      if (r < 0.5) continue
      const s = this.toScreen(n.x, n.y)
      if (n.pulse > 0 || def.ring) {
        for (let i = 0; i < (def.ring ? 3 : 2); i++) {
          const phase = (now * 0.0012 + n.ringPhase + i * 0.5) % 1
          const ringR = r + 4 + phase * (def.ring ? 22 : 14)
          const alpha = (1 - phase) * (n.pulse > 0 ? 0.5 : 0.2)
          ctx.strokeStyle = this.hexA(def.color, alpha); ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(s.x, s.y, ringR, 0, Math.PI * 2); ctx.stroke()
        }
      }
      const glowR = r * 4.5
      const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowR)
      rg.addColorStop(0, this.hexA(def.color, 0.45)); rg.addColorStop(0.4, this.hexA(def.color, 0.15)); rg.addColorStop(1, this.hexA(def.color, 0))
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2); ctx.fill()
      const bg = ctx.createRadialGradient(s.x - r * 0.35, s.y - r * 0.35, 0, s.x, s.y, r)
      bg.addColorStop(0, this.lighten(def.color, 0.5)); bg.addColorStop(0.6, def.color); bg.addColorStop(1, this.darken(def.color, 0.3))
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = this.hexA(def.color, 0.6); ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath(); ctx.arc(s.x - r * 0.3, s.y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill()
      const isSel = (n === this.selectedNode), isHov = (n === this.hoveredNode)
      if (isSel || isHov) {
        const boxR = r + 7
        ctx.strokeStyle = isSel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 1.2; ctx.setLineDash(isSel ? [4, 3] : [3, 3])
        ctx.beginPath(); ctx.arc(s.x, s.y, boxR, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }
      if (this.zoom > 0.5) {
        ctx.font = `${Math.max(9, 10 * this.zoom)}px "JetBrains Mono", monospace`
        ctx.fillStyle = 'rgba(220,220,230,0.7)'
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(this.truncate(n.label, 22), s.x + r + 8, s.y)
      }
    }
    if (this.tooltip) {
      if (this.hoveredNode) {
        const def = NODE_TYPES[this.hoveredNode.type]
        this.tooltip.innerHTML = `<b style="color:${def.color}">${def.label}</b><br>${this.hoveredNode.label}`
        this.tooltip.classList.add('show')
      } else { this.tooltip.classList.remove('show') }
    }
  }

  drawMinimap() {
    if (!this.miniCtx) return
    const ctx = this.miniCtx
    ctx.clearRect(0, 0, this.mw, this.mh)
    if (this.nodes.length === 0) return
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    for (const n of this.nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y) }
    const pad = 30; minX -= pad; minY -= pad; maxX += pad; maxY += pad
    const rangeX = Math.max(1, maxX - minX), rangeY = Math.max(1, maxY - minY)
    const scale = Math.min(this.mw / rangeX, this.mh / rangeY)
    const offX = (this.mw - rangeX * scale) / 2, offY = (this.mh - rangeY * scale) / 2
    const mx = (wx: number) => (wx - minX) * scale + offX
    const my = (wy: number) => (wy - minY) * scale + offY
    ctx.strokeStyle = 'rgba(150,150,170,0.3)'; ctx.lineWidth = 0.5
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b]
      ctx.beginPath(); ctx.moveTo(mx(a.x), my(a.y)); ctx.lineTo(mx(b.x), my(b.y)); ctx.stroke()
    }
    for (const n of this.nodes) {
      ctx.fillStyle = NODE_TYPES[n.type].color
      ctx.beginPath(); ctx.arc(mx(n.x), my(n.y), n.type === 'root' ? 3 : 2, 0, Math.PI * 2); ctx.fill()
    }
    const vLeft = mx((-this.cx - this.panX) / this.zoom)
    const vTop = my((-this.cy - this.panY) / this.zoom)
    const vW = (this.w / this.zoom) * scale, vH = (this.h / this.zoom) * scale
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
    ctx.strokeRect(vLeft, vTop, vW, vH)
  }

  loop() { this.simulate(); this.draw(); this.drawMinimap(); requestAnimationFrame(() => this.loop()) }
}
