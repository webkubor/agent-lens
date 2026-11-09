// Agent Lens — the page.
//
// The page is served by the plugin's own service (the sandbox's CSP has
// connect-src 'none', so it cannot fetch: the only way to the data is to
// be served by the thing that has it). So the data comes with the page:
// /api/summary is fetched here, same origin, and the page is already on the
// service.

const $ = (id) => document.getElementById(id)

const state = {
  period: "7d",
  summary: null,
  open: new Set(),
}

// A number, in a way that reads. Big numbers get their thousands
// separated; small ones keep their decimals.
function num(n, digits = 0) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—"
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// A share, as a percentage with one decimal.
function pct(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—"
  return `${(n * 100).toFixed(1)}%`
}

// A duration, for the first/last a request of an agent was seen.
function when(t) {
  if (!t) return "—"
  return new Date(t).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function bytes(n) {
  if (!n) return "0 B"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// The verdict on an agent: the one sentence a reader takes away.
function verdict(a) {
  const bits = []
  if (a.toolShare > 0.03) bits.push("工具声明很重")
  else if (a.toolShare < 0.005) bits.push("工具声明很轻")
  if (a.cacheRate > 0.9) bits.push("缓存命中很高")
  else if (a.cacheRate < 0.5) bits.push("缓存命中偏低")
  if (a.errorRate > 0.05) bits.push("错误偏多")
  if (!bits.length) bits.push("表现平稳")
  return bits.join(" · ")
}

function paint() {
  const s = state.summary
  $("empty").hidden = true
  $("error").hidden = true

  if (!s || !s.agents.length) {
    $("empty").hidden = false
    $("empty").textContent = "这个周期里还没有记录到请求。等 agent 走过网关之后，刷新即可。"
    for (const id of ["cards", "tools", "agents", "quality"]) $(id).innerHTML = ""
    return
  }

  const t = s.totals
  const heaviest = s.agents[0]
  const bestCache = s.agents.reduce((a, b) => (b.cacheRate > a.cacheRate ? b : a), s.agents[0])

  $("cards").innerHTML = [
    ["Agent 数", num(s.agents.length), "网关后面在跑的客户端"],
    ["请求数", num(t.calls), `${num(t.inTokens)} 输入 token`],
    ["工具声明总量", bytes(t.toolBytes), `平均 ${bytes(t.toolBytes / Math.max(1, t.calls))}/次`],
    ["最重的 agent", heaviest.agent, `${pct(heaviest.toolShare)} 的输入是工具`],
    ["缓存最省", bestCache.agent, `命中率 ${pct(bestCache.cacheRate)}`],
  ]
    .map(
      ([k, v, s2]) =>
        `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`,
    )
    .join("")

  paintTools(s)
  paintAgents(s)
  paintQuality(s)

  $("stamp").textContent = `更新于 ${new Date(s.generatedAt).toLocaleTimeString("zh-CN")}`
}

function paintTools(s) {
  const max = Math.max(...s.agents.map((a) => a.toolBytesPerCall), 1)
  $("tools").innerHTML = s.agents
    .map((a) => {
      const w = (a.toolBytesPerCall / max) * 100
      const heavy = a.toolShare > 0.03 ? " heavy" : ""
      return `<div class="bar-row">
        <div class="bar-name">${a.agent}</div>
        <div class="bar-track"><div class="bar-fill${heavy}" style="width:${w.toFixed(1)}%"></div></div>
        <div class="bar-val">${bytes(a.toolBytesPerCall)}/次</div>
      </div>`
    })
    .join("")
}

function paintAgents(s) {
  const rows = []
  for (const a of s.agents) {
    const isOpen = state.open.has(a.agent)
    rows.push(`<tr class="agent-row" tabindex="0" data-agent="${a.agent}">
      <td class="agent-name">${a.agent}</td>
      <td class="num">${num(a.calls)}</td>
      <td class="num">${bytes(a.toolBytesPerCall)}</td>
      <td class="num">${num(a.toolTokensPerCall)}</td>
      <td class="num">${pct(a.toolShare)}</td>
      <td class="num">${pct(a.cacheRate)}</td>
      <td class="num">${pct(a.errorRate)}</td>
    </tr>`)
    if (isOpen) rows.push(detailRow(a))
  }
  $("agents").innerHTML = `<table>
    <thead><tr>
      <th>Agent</th><th class="num">请求</th><th class="num">工具/次</th>
      <th class="num">工具 token/次</th><th class="num">占输入</th>
      <th class="num">缓存命中</th><th class="num">错误率</th>
    </tr></thead><tbody>${rows.join("")}</tbody></table>`
}

function detailRow(a) {
  const models = a.models
    .map((m) => `<span class="chip">${m.model} · ${num(m.calls)}</span>`)
    .join("")
  const protos = a.protocols.map((p) => `<span class="chip">${p.protocol}</span>`).join("")
  const tools = a.toolNames.map((t) => `<li>${t.name}</li>`).join("")
  return `<tr class="detail"><td colspan="7"><dl>
    <div><dt>判定</dt><dd>${verdict(a)}</dd></div>
    <div><dt>输入 token</dt><dd>${num(a.inTokens)}</dd></div>
    <div><dt>输出 token</dt><dd>${num(a.outTokens)}</dd></div>
    <div><dt>缓存读 / 写</dt><dd>${num(a.cacheRead)} / ${num(a.cacheWrite)}</dd></div>
    <div><dt>首次见到</dt><dd>${when(a.first)}</dd></div>
    <div><dt>最近一次</dt><dd>${when(a.last)}</dd></div>
  </dl>
  <p style="margin:12px 0 0"><span class="k">用过的模型</span><br>${models || "—"}</p>
  <p style="margin:10px 0 0"><span class="k">协议</span><br>${protos || "—"}</p>
  <p style="margin:12px 0 0"><span class="k">工具（出现最多）</span></p>
  <ul class="tool-list">${tools || "<li>—</li>"}</ul>
  </td></tr>`
}

function paintQuality(s) {
  $("quality").innerHTML = `<table>
    <thead><tr>
      <th>Agent</th><th class="num">缓存命中</th><th class="num">错误率</th>
      <th class="num">输入 token</th><th class="num">输出 token</th><th>判定</th>
    </tr></thead><tbody>
    ${s.agents
      .map(
        (a) => `<tr>
      <td class="agent-name">${a.agent}</td>
      <td class="num">${pct(a.cacheRate)}</td>
      <td class="num">${pct(a.errorRate)}</td>
      <td class="num">${num(a.inTokens)}</td>
      <td class="num">${num(a.outTokens)}</td>
      <td>${verdict(a)}</td>
    </tr>`,
      )
      .join("")}
  </tbody></table>`
}

async function load() {
  try {
    const res = await fetch(`/api/summary?period=${encodeURIComponent(state.period)}`, {
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.summary = await res.json()
    paint()
  } catch (e) {
    $("error").hidden = false
    $("error").textContent = `读不到数据：${e.message}`
  }
}

function bind() {
  $("periods").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-period]")
    if (!btn) return
    state.period = btn.dataset.period
    for (const b of $("periods").children) {
      b.setAttribute("aria-selected", String(b.dataset.period === state.period))
    }
    load()
  })

  $("agents").addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr.agent-row")
    if (!tr) return
    toggle(tr.dataset.agent)
  })

  $("agents").addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return
    const tr = ev.target.closest("tr.agent-row")
    if (!tr) return
    ev.preventDefault()
    toggle(tr.dataset.agent)
  })
}

function toggle(agent) {
  if (state.open.has(agent)) state.open.delete(agent)
  else state.open.add(agent)
  paintAgents(state.summary)
}

bind()
for (const b of $("periods").children) {
  b.setAttribute("aria-selected", String(b.dataset.period === state.period))
}
await load()
// Fresh numbers while the page is open.
setInterval(load, 60_000)