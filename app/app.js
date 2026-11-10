// HarnessWeight — the interface. Served by the plugin's own service, so the
// data is a same-origin fetch away.

import { EXPLAIN, COLS, CARD_SORTS } from "./explain.js"

const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
// sandboxed in magpie's frame the origin is opaque and storage throws
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch {} },
}

const state = {
  period: store.get("al.period") || "7d",
  clients: store.get("al.clients") === "1",
  sort: { key: "prompt", dir: -1 },
  cardSort: "prompt",
  toolSort: "avgBytes",
  activeAgents: new Map(),
  activityKnown: false,
  data: null,
  openAgent: null,
}

// the service writes a per-start token into this page's HTML
const TOKEN = document.querySelector('meta[name="harnessweight-token"]')?.content || ""
let reloaded = false
const sessionStorageSafe = () => reloaded || location.hash === "#r"
function markReloaded() { reloaded = true; location.hash = "r" }

// ---------- formatting ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
function short(n) {
  if (n == null || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}
const int = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"))
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(1)}%`)
function secs(ms) {
  if (!ms) return "—"
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}
function dur(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—"
  const m = ms / 60000
  if (m < 1) return `${Math.round(ms / 1000)}秒`
  if (m < 60) return `${m.toFixed(0)}分`
  const h = m / 60
  if (h < 24) return `${h.toFixed(1)}小时`
  return `${(h / 24).toFixed(1)}天`
}
function when(t) {
  if (!t) return "—"
  return new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// ---------- agent mark: magpie's own icon, else the initial ----------
const PALETTE = ["#17A9A2", "#F26B1D", "#6D5DFC", "#2B8AE2", "#C2410C", "#0E7C77", "#8B5CF6", "#64748B"]
function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length] }
function mark(a, size = 20) {
  const initial = esc(String(a.name || a.agent || "?").trim().charAt(0).toUpperCase())
  const letter = `<span class="mark letter" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.58)}px;background:${hue(a.agent)}">${initial}</span>`
  if (!a.icon) return letter
  return `<span class="mark" style="width:${size}px;height:${size}px"><img src="${a.icon.startsWith("data:") ? a.icon : "icons/" + encodeURIComponent(a.icon)}" alt="" width="${size}" height="${size}"></span>`
}
const label = (a) => esc(a.name || a.agent)

// ---------- explanations ----------
// A small "?" that shows what a number means on hover or keyboard focus. The
// text lives in explain.js; this only renders the marker.
// A label with a small "?" next to it that opens the explanation on hover or
// keyboard focus. The label itself stays plain text; only the marker is a
// button, so a label never gets squeezed by the marker.
function tip(key, label) {
  const e = EXPLAIN[key]
  if (!e) return label ?? ""
  return `<span class="tipwrap">${label ?? ""}<span class="tip" tabindex="0" role="button" aria-expanded="false" aria-label="${esc(e.title)}：${esc(e.body)}"><span class="tip-body" role="tooltip"><b>${esc(e.title)}</b>${esc(e.body)}</span></span></span>`
}

// Render notes outside scroll containers so table and drawer overflow never clip them.
let activeTip = null
function closeTip() {
  if (!activeTip) return
  activeTip.trigger.setAttribute('aria-expanded', 'false')
  activeTip.bubble.remove()
  activeTip = null
}
function wireTips(root) {
  for (const t of root.querySelectorAll('.tip:not([data-wired])')) {
    t.dataset.wired = '1'
    const open = () => {
      if (activeTip?.trigger === t) return
      closeTip()
      const bubble = document.createElement('div')
      bubble.className = 'floating-tip'
      bubble.setAttribute('aria-hidden', 'true') // trigger already contains the full accessible label
      bubble.innerHTML = t.querySelector('.tip-body').innerHTML
      document.body.append(bubble)
      const r = t.getBoundingClientRect(), b = bubble.getBoundingClientRect()
      const left = Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2))
      const top = r.top >= b.height + 10 ? r.top - b.height - 8 : Math.min(window.innerHeight - b.height - 8, r.bottom + 8)
      bubble.style.left = `${left}px`
      bubble.style.top = `${Math.max(8, top)}px`
      t.setAttribute('aria-expanded', 'true')
      activeTip = {trigger:t, bubble}
    }
    const close = () => { if (activeTip?.trigger === t) closeTip() }
    t.addEventListener('mouseenter', open)
    t.addEventListener('mouseleave', close)
    t.addEventListener('focus', open)
    t.addEventListener('blur', close)
    t.addEventListener('click', e => { e.stopPropagation(); open() })
    t.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Escape') { close(); t.blur() }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activeTip?.trigger === t ? close() : open() }
    })
  }
}
document.addEventListener('scroll', closeTip, true)
window.addEventListener('resize', closeTip)
document.addEventListener('pointerdown', e => { if (!e.target.closest('.tip')) closeTip() })

// Only request-start / response-finish hook observations drive activity.
// Completed-request timestamps must never masquerade as in-flight calls.
function isLive(a) {
  return state.activityKnown && (state.activeAgents.get(a.agent) || 0) > 0
}
function activityBadge(agent) {
  const count = state.activeAgents.get(agent) || 0
  return `<span class="live-badge">${tip("live", `${count} 个调用中`)}</span>`
}
async function refreshActivity() {
  if (document.hidden) return
  try {
    const res = await fetch(`/api/activity?k=${encodeURIComponent(TOKEN)}`, {cache:'no-store', signal:AbortSignal.timeout(4000)})
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    state.activeAgents = new Map(data.agents.map(a => [a.agent, a.count]))
    state.activityKnown = data.available === true
    if (!state.activityKnown) state.activeAgents.clear()
  } catch {
    state.activityKnown = false
    state.activeAgents.clear()
  }
  $('activityInfo').textContent = state.activityKnown
    ? '流光边框表示网关观察到该 Agent 有调用进行中。'
    : '实时调用状态暂不可用；没有流光不代表 Agent 空闲。'
  for (const card of document.querySelectorAll('.card[data-agent]')) {
    const active = state.activityKnown && (state.activeAgents.get(card.dataset.agent) || 0) > 0
    card.classList.toggle('live', active)
    const head = card.querySelector('.card-head')
    const old = head.querySelector('.live-badge')
    const count = state.activeAgents.get(card.dataset.agent) || 0
    if (old && old.dataset.count === String(count)) continue
    old?.remove()
    if (active) {
      head.insertAdjacentHTML('beforeend', activityBadge(card.dataset.agent))
      const badge = head.querySelector('.live-badge')
      badge.dataset.count = String(count)
      wireTips(badge)
    }
  }
}

// ---------- sparkline ----------
function spark(series, key, cls = "") {
  if (!series || series.length < 2) return ""
  const w = 240, h = cls ? 80 : 34, pad = 2
  const vals = series.map((d) => d[key])
  const max = Math.max(...vals, 1)
  const pts = vals.map((v, i) => [pad + (i * (w - pad * 2)) / (vals.length - 1), h - pad - (v / max) * (h - pad * 2)])
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${area}"/><path class="l" d="${line}"/></svg>`
}

// ---------- paint ----------
function paint() {
  const d = state.data
  $("state").hidden = true
  if (!d.agents.length) {
    for (const id of ["insights", "kpis", "cards", "tools"]) $(id).innerHTML = ""
    $("table").innerHTML = ""
    showState("这段时间网关没有记录到 Agent 的请求。用任意 Agent 走一次网关，再回来刷新。")
    return
  }
  paintStatus(d)
  paintInsights(d)
  paintKpis(d)
  paintCardSort()
  paintCards(d)
  paintTable(d)
  paintTools(d)
  wireTips(document)
  const s = d.sources || {}
  $("sources").textContent = `用量记录 ${int(s.usageRows)} 条 · 工具采样 ${int(s.toolRows)} 条 · 更新于 ${new Date(d.generatedAt).toLocaleTimeString("zh-CN")}`
  if (state.openAgent) openDetail(state.openAgent, false)
}

function ago(t) {
  if (!t) return "还没有"
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return `${Math.round(s)} 秒前`
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`
  return `${Math.round(s / 86400)} 天前`
}
function paintStatus(d) {
  const fresh = d.lastTool && Date.now() - d.lastTool < 15 * 60e3
  const el = $("status")
  el.className = "status " + (fresh ? "live" : d.lastTool ? "idle" : "wait")
  el.textContent = fresh ? `采集中 · 最近一次请求 ${ago(d.lastUsage)} · 工具采样 ${ago(d.lastTool)}`
    : d.lastTool ? `15 分钟内没有新采样 · 上次 ${ago(d.lastTool)}（用一下 Agent 就会恢复）`
    : "hook 已装好，等第一条请求经过网关"
}

function paintInsights(d) {
  $("insights").innerHTML = d.insights
    .map((i) => `<div class="insight${i.kind === "volume" || i.kind === "errors" ? " hot" : ""}">${esc(i.text)}</div>`)
    .join("")
}

function paintKpis(d) {
  const t = d.totals
  const items = [
    ["输入 token", short(t.prompt), `${int(t.calls)} 次请求`, "prompt"],
    ["缓存命中", pct(t.cacheRate), `按原价算的 ${short(t.fullPrice)}`, "cacheRate"],
    ["输出 token", short(t.out), `平均 ${short(t.calls ? t.out / t.calls : 0)}/次`, "out"],
    ["失败", int(t.failed), pct(t.calls ? t.failed / t.calls : 0), "errorRate"],
    ["Agent", int(d.agents.length), d.hiddenClients ? `另有 ${int(d.hiddenClients)} 次脚本/内部请求未计` : "网关后面的客户端", null],
  ]
  if (t.credits > 0) items.splice(4, 0, ["credits", t.credits.toFixed(2), "magpie 记账的按量额度"])
  $("kpis").innerHTML = items
    .map(([k, v, s, tipKey]) => `<div class="kpi"><div class="k">${tipKey ? tip(tipKey, k) : k}</div><div class="v num">${v}</div><div class="s">${esc(s)}</div></div>`)
    .join("")
}

function paintCards(d) {
  const max = Math.max(...d.agents.map((a) => a.prompt), 1)
  const sorted = [...d.agents].sort((x, y) => cardVal(y, state.cardSort) - cardVal(x, state.cardSort))
  $("cards").innerHTML = sorted
    .map((a, i) => {
      const w = (a.prompt / max) * 100
      const fullW = a.prompt ? (a.fullPrice / a.prompt) * w : 0
      const top1 = a.prompt === max && d.agents.length > 1
      const live = isLive(a, d)
      const proto = a.protocols?.[0]?.name
      return `<div class="card${top1 ? " top1" : ""}${live ? " live" : ""}" tabindex="0" role="button" data-agent="${esc(a.agent)}" aria-label="${label(a)} 详情">
        <div class="card-head"><span class="card-name">${mark(a, 22)}${label(a)}</span>${live ? activityBadge(a.agent) : ""}${top1 ? '<span class="tag">花得最多</span>' : ""}</div>
        <div class="card-big num">${short(a.prompt)}<small>输入 token</small></div>
        <div class="stack" title="浅色：缓存读取；深色：按原价"><span class="cached" style="width:${(w - fullW).toFixed(2)}%"></span><span class="full" style="width:${fullW.toFixed(2)}%"></span></div>
        <div class="card-meta">
          <div><b class="num">${pct(a.cacheRate)}</b>${tip("cacheRate", "缓存命中")}</div>
          <div><b class="num">${short(a.avgPrompt)}</b>${tip("avgPrompt", "每次读")}</div>
          <div><b class="num ${a.errorRate >= 0.03 ? "bad" : ""}">${pct(a.errorRate)}</b>${tip("errorRate", "失败率")}</div>
        </div>
        ${proto ? `<div class="card-foot"><span class="proto" title="${esc(proto)}">${esc(proto)}</span>${a.session?.median ? `<span class="dur" title="单次会话时长中位数">${dur(a.session.median)}</span>` : ""}</div>` : ""}
        ${spark(a.series, "prompt")}
      </div>`
    })
    .join("")
}

const val = (a, k) => {
  if (k === "toolTokens") return a.tools?.avgTokens ?? -1
  if (k === "agent") return a.name || a.agent
  if (k === "protocol") return a.protocols?.[0]?.name || ""
  if (k === "session") return a.session?.median ?? -1
  return a[k]
}

const cardVal = (a, k) => (k === "toolTokens" ? a.tools?.avgTokens ?? -1 : a[k] ?? -1)

function paintCardSort() {
  const box = $("cardSort")
  if (!box) return
  box.innerHTML = CARD_SORTS.map(([k, name]) =>
    `<button class="pill${state.cardSort === k ? " on" : ""}" data-sort="${k}" aria-pressed="${state.cardSort === k}">${name}</button>`).join("")
}

function paintTable(d) {
  const { key, dir } = state.sort
  const rows = [...d.agents].sort((x, y) => {
    const a = val(x, key), b = val(y, key)
    return typeof a === "string" ? a.localeCompare(b) * dir : ((a ?? 0) - (b ?? 0)) * dir
  })
  const topAgent = d.agents[0]?.agent
  const head = COLS.map(([k, name, n, tipKey]) => `<th class="${n ? "n" : ""}" data-key="${k}" ${k === key ? `aria-sort="${dir < 0 ? "descending" : "ascending"}"` : ""} tabindex="0">${tipKey ? tip(tipKey, name) : name}</th>`).join("")
  const body = rows
    .map((a) => `<tr tabindex="0" data-agent="${esc(a.agent)}">
      <td class="agent"><span class="who">${mark(a, 18)}${label(a)}${a.agent === topAgent && d.agents.length > 1 ? '<span class="dot hot" title="花得最多"></span>' : ""}</span></td>
      <td class="n">${int(a.calls)}</td>
      <td class="n">${short(a.prompt)}</td>
      <td class="n">${short(a.avgPrompt)}</td>
      <td class="n">${pct(a.cacheRate)}</td>
      <td class="n">${short(a.fullPrice)}</td>
      <td class="n">${short(a.out)}</td>
      <td class="n ${a.errorRate >= 0.03 ? "bad" : ""}">${pct(a.errorRate)}</td>
      <td class="n">${secs(a.p50ttft)}</td>
      <td class="n">${secs(a.p50ms)}</td>
      <td class="n">${a.tools ? short(a.tools.avgTokens) : "—"}</td>
      <td class="n proto-cell" title="${a.protocols?.map((p) => p.name).join("、") || ""}">${a.protocols?.length ? esc(a.protocols[0].name) : "—"}</td>
      <td class="n">${a.session?.median ? dur(a.session.median) : "—"}</td>
    </tr>`)
    .join("")
  $("table").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`
}

function paintTools(d) {
  const withTools = d.agents.filter((a) => a.tools)
  if (!withTools.length) {
    $("toolsHint").textContent = "Agent 每次请求都会把自己的工具清单重发一遍，这部分也按 token 计费。"
    $("tools").innerHTML = `<div class="waiting">还没有采样。网关 hook 会从下一次请求开始记录每个 Agent 带了哪些工具、有多大（只记名字和大小，不记内容）。用一会儿 Agent 后刷新即可。</div>`
    return
  }
  const sorted = [...withTools].sort((a, b) => (b.tools[state.toolSort] ?? 0) - (a.tools[state.toolSort] ?? 0))
  const max = sorted[0].tools.avgBytes || 1
  $("toolsHint").innerHTML = `从 ${when(d.toolsSince)} 开始采样，共 ${int(d.toolSamples)} 次请求。token 数按每 token 约 3.5 字节估算，各 Agent 口径一致。
    <span class="sortbar inline">${[["avgBytes", "按字节"], ["avgTokens", "按 token"], ["avgCount", "按个数"], ["shareOfPrompt", "占输入比"]]
      .map(([k, n]) => `<button class="pill${state.toolSort === k ? " on" : ""}" data-tsort="${k}" aria-pressed="${state.toolSort === k}">${n}</button>`).join("")}</span>`
  $("tools").innerHTML = `<div class="table-wrap" style="padding:4px 16px">${sorted
    .map((a, i) => `<div class="tool-row">
      <div class="agent who">${mark(a, 18)}<b>${label(a)}</b></div>
      <div class="tool-track"><div class="tool-fill${i === 0 && sorted.length > 1 ? " hot" : ""}" style="width:${((a.tools.avgBytes / max) * 100).toFixed(1)}%"></div></div>
      <div class="tool-val num">${Math.round(a.tools.avgCount)} 个 · ≈${short(a.tools.avgTokens)} token${a.tools.shareOfPrompt != null ? ` · 占 ${pct(a.tools.shareOfPrompt)}` : ""}</div>
    </div>`)
    .join("")}</div>`
}

// ---------- detail drawer ----------
function distribution(items, total) {
  if (!items?.length) return '<p class="hint">当前范围没有可展示的记录。</p>'
  return items.map(m => `<div class="dist-row"><div><span>${esc(m.label || m.name)}</span><span class="num">${int(m.count)} 次 · ${pct(total ? m.count / total : 0)}</span></div><div class="dist-track"><span style="width:${Math.min(100, total ? m.count / total * 100 : 0)}%"></span></div></div>`).join("")
}

function openDetail(agent, focus = true) {
  const a = state.data?.agents.find(x => x.agent === agent)
  if (!a) return closeDetail()
  const previousDetails = !focus ? [...$("detail").querySelectorAll('details')].map(d => d.open) : []
  const previousQuery = !focus ? $("detail").querySelector('.tool-search input')?.value || '' : ''
  state.openAgent = agent
  const modelCount = a.models.reduce((n,m) => n + m.count, 0)
  const protoNames = {anthropic:'Anthropic Messages', responses:'OpenAI Responses', chat:'OpenAI Chat Completions', gemini:'Google Gemini', other:'其他 / 未识别'}
  const toolNames = a.tools?.names || []
  const cache = Math.max(0, Math.min(100, a.cacheRate * 100))
  const failure = a.calls ? a.failed / a.calls : 0
  $("detail").innerHTML = `<div class="detail detail-guide">
    <header class="detail-heading"><h3 class="who">${mark(a,32)}${label(a)}</h3><p class="hint">${when(a.first)} — ${when(a.last)} · 当前筛选范围</p></header>
    <div class="detail-summary"><strong>这段时间，它向模型发起了 ${int(a.calls)} 次请求。</strong><p>每次平均读入 ${short(a.avgPrompt)} token；输入中 ${pct(a.cacheRate)} 来自缓存。记录到 ${int(a.failed)} 次失败和 ${int(a.cancelled)} 次主动取消。</p><small>这里比较的是实际使用记录；任务、模型和使用频率不同，不能直接当作 Agent 能力排名。</small></div>
    <section class="sec"><h4>① 输入都用在哪里？ ${tip('prompt')}</h4>
      <div class="detail-metrics"><div><span>累计输入</span><b>${short(a.prompt)}</b></div><div><span>每次平均</span><b>${short(a.avgPrompt)}</b></div><div><span>生成的输出</span><b>${short(a.out)}</b></div></div>
      ${a.prompt ? `<div class="composition" aria-label="缓存读取占输入 ${pct(a.cacheRate)}"><span style="width:${cache}%"></span><span style="width:${100-cache}%"></span></div>
      <div class="composition-key"><span>● 缓存读取 ${short(a.cacheRead)} · ${pct(a.cacheRate)}</span><span>● 非缓存读取 ${short(a.fullPrice)}</span></div>` : '<p class="empty-note">当前范围没有输入 token 记录，无法计算构成。</p>'}
      <p class="hint">缓存读取通常享有折扣。非缓存读取含新鲜输入与缓存写入，各供应商定价不同；token 数不是金额。</p>
      <details><summary>查看输入明细</summary><dl class="detail-facts"><dt>新鲜输入</dt><dd>${short(a.in)}</dd><dt>缓存写入</dt><dd>${short(a.cacheWrite)}</dd>${a.credits > 0 ? `<dt>网关记录的额度</dt><dd>${a.credits.toFixed(2)} credits</dd>` : ''}</dl></details>
    </section>
    <section class="sec"><h4>② 等待多久，出错多少？</h4><div class="detail-metrics"><div><span>首字等待 ${tip('p50ttft')}</span><b>${secs(a.p50ttft)}</b></div><div><span>完整响应 ${tip('p50ms')}</span><b>${secs(a.p50ms)}</b></div><div><span>失败率 ${tip('errorRate')}</span><b>${pct(failure)}</b></div></div><p class="hint">时间采用中位数（p50）：有一半的有效记录更快。首字与完整响应各自统计，样本可能不同，不能相减当作生成耗时。失败不等于一定产生费用。</p></section>
    <section class="sec"><h4>③ 工具说明有多重？ ${tip('toolTokens')}</h4>${a.tools ? `<div class="detail-metrics"><div><span>每次携带工具</span><b>${Math.round(a.tools.avgCount)} 个</b></div><div><span>说明体积（估算 token）</span><b>≈${short(a.tools.avgTokens)}</b></div><div><span>有效采样</span><b>${int(a.tools.samples)} 次</b></div></div><p>工具定义是发给模型的“工具使用说明书”，包含名称、参数格式和描述。长说明书也会占上下文，工具数量少不一定更轻。</p><p class="hint">以 JSON 字节数 ÷ 3.5 估算，非模型 tokenizer 的实测值。工具采样 ${int(a.tools.samples)} 条，用量记录 ${int(a.calls)} 条；两者未逐请求关联，不能据此计算覆盖率。工具说明可能命中缓存，不代表每轮都按原价收费。</p><details class="tool-inventory"><summary>查看高频工具名称（最多 40 项）</summary><label class="tool-search">筛选工具名<input type="search" placeholder="输入名称关键词" aria-label="筛选工具名"></label><div class="chips tool-list">${toolNames.map(t=>`<span class="chip mono" data-tool-name="${esc(t.name.toLowerCase())}">${esc(t.name)}</span>`).join('')}</div><p class="hint">这里最多显示采样中出现频率最高的 40 个名称；每次采样也最多记录 60 个名称。这不是完整列表、当前启用列表或工具调用次数。</p></details>` : '<p class="empty-note">尚未采集到工具定义。让该 Agent 通过网关发送新请求后，这里会逐步出现数据。</p>'}</section>
    <section class="sec"><h4>④ 用过哪些模型？</h4><p class="hint">按请求次数排列，百分比以该 Agent 全部请求为分母。只显示前 ${a.models.length} 项。</p>${distribution(a.models,a.calls)}${modelCount < a.calls ? `<p class="hint">其余 / 未列出的记录：${int(a.calls-modelCount)} 次。</p>` : ''}</section>
    <section class="sec"><h4>⑤ 请求经过哪些协议？ ${tip('protocol')}</h4><p class="hint">协议是请求与模型服务之间使用的消息格式。下面显示所选时间范围内的主要协议，按日志中记录的端点推断，可能包含网关转换后的协议；不是当前配置清单。</p>${distribution(a.protocols.map(p=>({...p,label:protoNames[p.name] || p.name})),a.calls)}</section>
    <section class="sec"><h4>⑥ 一次会话持续多久？ ${tip('sessionMedian')}</h4>${a.session?.measured ? `<div class="detail-metrics"><div><span>中位时长</span><b>${dur(a.session.median)}</b></div><div><span>90% 会话短于</span><b>${dur(a.session.p90)}</b></div><div><span>可测会话</span><b>${int(a.session.measured)}</b></div></div><p class="hint">按同一会话首末请求的跨度计算，包含思考与闲置，不是连续工作时间。当前统计窗口可能截断会话；${int(a.session.open || 0)} 个超过 6 小时的会话未参与时长统计。</p>` : '<div class="empty-note"><strong>暂时无法计算会话时长</strong><p>当前范围没有可用于时长统计的会话记录。请求次数和响应耗时仍可正常查看；这不代表 Agent 没有工作。</p></div>'}</section>
    <section class="sec"><h4>每天的输入用量</h4>${spark(a.series,'prompt','big') || '<p class="hint">数据不足，暂不绘制趋势。</p>'}<p class="hint">趋势反映使用规模，不是任务完成质量。</p></section>
  </div>`
  wireTips($("detail"))
  $("detail").querySelector('.tool-search input')?.addEventListener('input', e => {
    const term = e.target.value.trim().toLowerCase()
    for (const item of $("detail").querySelectorAll('[data-tool-name]')) item.hidden = !item.dataset.toolName.includes(term)
  })
  if (!focus) {
    $("detail").querySelectorAll('details').forEach((d,i) => { d.open = !!previousDetails[i] })
    const input = $("detail").querySelector('.tool-search input')
    if (input) { input.value = previousQuery; input.dispatchEvent(new Event('input')) }
  }
  const dr = $("drawer")
  dr.classList.add("open")
  dr.setAttribute("aria-hidden", "false")
  $("scrim").hidden = false
  if (focus) { dr.scrollTop = 0; dr.focus() }
}
function closeDetail() {
  state.openAgent = null
  $("drawer").classList.remove("open")
  $("drawer").setAttribute("aria-hidden", "true")
  $("scrim").hidden = true
}

// ---------- loading ----------
function showState(text, err = false) {
  $("state").hidden = false
  $("state").className = err ? "state err" : "state"
  $("state").textContent = text
}

async function load() {
  if (!state.data) $("cards").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'
  try {
    const p = new URLSearchParams({ period: state.period, tz: String(new Date().getTimezoneOffset()) })
    if (state.clients) p.set("clients", "1")
    p.set("k", TOKEN)
    const res = await fetch(`/api/summary?${p}`, { cache: "no-store" })
    if (res.status === 403 && !sessionStorageSafe("al.reloaded")) { markReloaded(); return location.reload() }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.data = await res.json()
    paint()
  } catch (e) {
    showState(`读不到数据：${e.message}。确认 magpie 网关在运行，再刷新。`, true)
  }
}

// ---------- events ----------
function selectPeriod() {
  for (const b of $("periods").children) b.setAttribute("aria-selected", String(b.dataset.period === state.period))
}
$("periods").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-period]")
  if (!b || b.dataset.period === state.period) return
  state.period = b.dataset.period
  store.set("al.period", state.period)
  selectPeriod()
  load()
})
$("clients").checked = state.clients
$("clients").addEventListener("change", (e) => {
  state.clients = e.target.checked
  store.set("al.clients", state.clients ? "1" : "0")
  load()
})
const pick = (e) => e.target.closest("[data-agent]")?.dataset.agent
$("cards").addEventListener("click", (e) => { const a = pick(e); if (a) openDetail(a) })
$("cardSort").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sort]")
  if (!b || b.dataset.sort === state.cardSort) return
  state.cardSort = b.dataset.sort
  paintCardSort()
  paintCards(state.data)
  wireTips($("cards"))
})
$("toolsHint").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tsort]")
  if (!b) return
  state.toolSort = b.dataset.tsort
  paintTools(state.data)
})
$("table").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-key]")
  if (th) {
    const k = th.dataset.key
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === "agent" ? 1 : -1 }
    paintTable(state.data)
    wireTips($("table"))
    return
  }
  const a = pick(e)
  if (a) openDetail(a)
})
for (const id of ["cards", "table"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return
    const th = e.target.closest("th[data-key]")
    if (th) { e.preventDefault(); return th.click() }
    const a = pick(e)
    if (a) { e.preventDefault(); openDetail(a) }
  })
}
$("close").addEventListener("click", closeDetail)
$("scrim").addEventListener("click", closeDetail)
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.openAgent) closeDetail() })

selectPeriod()
await load()
await refreshActivity()
setInterval(load, 60_000)
async function pollActivity() {
  await refreshActivity()
  setTimeout(pollActivity, 2000)
}
setTimeout(pollActivity, 2000)
