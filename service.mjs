// Agent Lens — the local service behind the page.
//
// The page is sandboxed with connect-src 'none': it cannot fetch anything,
// not even this. The only way out of that sandbox is to navigate to it, so
// this service serves the page itself and the data behind it.
//
//   GET /            the page
//   GET /api/summary the comparison, computed from the data file
//   GET /api/rows    the raw rows (for a drill-down)
//
// It binds to the loopback only: the data is the user's own usage, and
// nothing outside this machine has any business reading it.

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

// The periods the page offers.
const PERIODS = {
  today: 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
}

// The bytes of JSON one token of a tool declaration costs, roughly. JSON
// is mostly ASCII keys and short values, so it is denser than prose: about
// 3.5 bytes a token. This is an estimate, and it is the same estimate for
// every agent, which is what a comparison needs. It is not a token count.
const BYTES_PER_TOKEN = 3.5

// The comparison, per agent. Everything here is a number.
function summarize(rows, sinceMs) {
  const byAgent = new Map()

  for (const r of rows) {
    if (sinceMs && r.t < sinceMs) continue
    let a = byAgent.get(r.agent)
    if (!a) {
      a = {
        agent: r.agent,
        calls: 0,
        errors: 0,
        inTokens: 0,
        outTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        toolBytes: 0,
        toolCalls: 0,
        models: new Map(),
        protocols: new Map(),
        toolNames: new Map(),
        first: r.t,
        last: r.t,
      }
      byAgent.set(r.agent, a)
    }
    a.calls++
    if (r.ok === false) a.errors++
    a.inTokens += r.in ?? 0
    a.outTokens += r.out ?? 0
    a.cacheRead += r.cacheRead ?? 0
    a.cacheWrite += r.cacheWrite ?? 0
    a.toolBytes += r.toolBytes ?? 0
    a.toolCalls += r.tools ?? 0
    if (r.t < a.first) a.first = r.t
    if (r.t > a.last) a.last = r.t

    const m = a.models.get(r.model) ?? { model: r.model, calls: 0, inTokens: 0, outTokens: 0, toolBytes: 0 }
    m.calls++
    m.inTokens += r.in ?? 0
    m.outTokens += r.out ?? 0
    m.toolBytes += r.toolBytes ?? 0
    a.models.set(r.model, m)

    a.protocols.set(r.protocol, (a.protocols.get(r.protocol) ?? 0) + 1)

    for (const n of r.toolNames ?? []) {
      a.toolNames.set(n, (a.toolNames.get(n) ?? 0) + 1)
    }
  }

  const list = [...byAgent.values()].map((a) => {
    // The input the user is billed for: what the model read, minus what it
    // read from the cache (that was billed at the cache rate).
    const billed = a.inTokens + a.cacheWrite
    const totalIn = a.inTokens + a.cacheRead
    const perCall = a.calls > 0 ? a.toolBytes / a.calls : 0
    return {
      agent: a.agent,
      calls: a.calls,
      errors: a.errors,
      errorRate: a.calls > 0 ? a.errors / a.calls : 0,
      inTokens: a.inTokens,
      outTokens: a.outTokens,
      cacheRead: a.cacheRead,
      cacheWrite: a.cacheWrite,
      // The share of the input that was served from the cache: a bigger
      // share means less of the bill.
      cacheRate: totalIn > 0 ? a.cacheRead / totalIn : 0,
      toolBytes: a.toolBytes,
      toolBytesPerCall: perCall,
      toolCalls: a.calls > 0 ? a.toolCalls / a.calls : 0,
      // The tool declarations' estimated tokens, and their share of the
      // input the model read. Both are estimates (see BYTES_PER_TOKEN), and
      // both are the same estimate for every agent, so the comparison
      // holds even where the absolute number is rough.
      toolTokensPerCall: perCall / BYTES_PER_TOKEN,
      toolShare: totalIn > 0 ? Math.min(1, perCall / BYTES_PER_TOKEN / (totalIn / a.calls)) : 0,
      billedTokens: billed,
      first: a.first,
      last: a.last,
      models: [...a.models.values()].sort((x, y) => y.calls - x.calls),
      protocols: [...a.protocols.entries()].map(([protocol, calls]) => ({ protocol, calls })),
      toolNames: [...a.toolNames.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 40)
        .map(([name, calls]) => ({ name, calls })),
    }
  })

  // The heaviest first: the tool weight is the thing this page is about.
  list.sort((x, y) => y.toolBytesPerCall - x.toolBytesPerCall)

  const totals = list.reduce(
    (t, a) => {
      t.calls += a.calls
      t.inTokens += a.inTokens
      t.outTokens += a.outTokens
      t.cacheRead += a.cacheRead
      t.toolBytes += a.toolBytes
      t.errors += a.errors
      return t
    },
    { calls: 0, inTokens: 0, outTokens: 0, cacheRead: 0, toolBytes: 0, errors: 0 },
  )

  return { agents: list, totals, generatedAt: Date.now() }
}

// Read the data file and parse the rows.
async function readRows(dataPath) {
  let text
  try {
    text = await readFile(dataPath, "utf8")
  } catch {
    return []
  }
  const rows = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      if (typeof r.t === "number") rows.push(r)
    } catch {
      // A half-written line is skipped.
    }
  }
  return rows
}

// The page's own files, served from the plugin's folder.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
}

function mimeOf(path) {
  const dot = path.lastIndexOf(".")
  return dot < 0 ? "application/octet-stream" : MIME[path.slice(dot)] ?? "application/octet-stream"
}

// Start the service. Returns its address.
export async function serve({ port = 3492, dataPath } = {}) {
  const file = dataPath ?? join(HERE, "data/agent-lens.jsonl")

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const path = url.pathname

    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")

    if (path === "/api/summary") {
      const period = url.searchParams.get("period") ?? "7d"
      const span = PERIODS[period] ?? PERIODS["7d"]
      const rows = await readRows(file)
      const body = JSON.stringify(summarize(rows, Date.now() - span))
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(body)
      return
    }

    if (path === "/api/rows") {
      const rows = await readRows(file)
      const body = JSON.stringify({ rows: rows.slice(-2000) })
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(body)
      return
    }

    if (path === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify({ ok: true, rows: (await readRows(file)).length }))
      return
    }

    // The page and its files.
    const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "")
    if (rel.includes("..")) {
      res.writeHead(400)
      res.end("bad path")
      return
    }
    const full = join(HERE, "page", rel)
    try {
      const content = await readFile(full)
      res.writeHead(200, { "Content-Type": mimeOf(full) })
      res.end(content)
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("not found")
    }
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })

  return { port, url: `http://127.0.0.1:${port}/` }
}

// Run it directly (node service.mjs) for a quick check without the gateway.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AGENT_LENS_PORT ?? 3492)
  const s = await serve({ port })
  console.log(`agent-lens service on ${s.url}`)
}
