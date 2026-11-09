// Agent Lens — the local service. magpie's plugin page is sandboxed with
// connect-src 'none' and cannot fetch anything, so the page navigates its
// frame here, and this serves the real interface and the data behind it.
//
//   GET /              the interface (app/)
//   GET /api/summary   ?period=today|7d|30d&clients=1&tz=<minutes>
//   GET /api/health
//
// Loopback only: the data is the user's own usage.
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { dirname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { toolsLog, usageLog } from "./lib/paths.mjs"
import { createToolsReader } from "./lib/tools.mjs"
import { createUsageReader } from "./lib/usage.mjs"
import { PERIODS, summarize } from "./lib/summarize.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, "app")
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
}

export function createHandler(options = {}) {
  const usage = createUsageReader(usageLog(options))
  const tools = createToolsReader(toolsLog(options))

  return async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Referrer-Policy", "no-referrer")
    try {
      if (url.pathname === "/api/summary") {
        await Promise.all([usage.refresh(), tools.refresh()])
        const period = PERIODS[url.searchParams.get("period")] ? url.searchParams.get("period") : "7d"
        const tz = Number(url.searchParams.get("tz"))
        const body = summarize({
          usage: usage.rows(), tools: tools.rows(), period,
          showClients: url.searchParams.get("clients") === "1",
          tzOffsetMin: Number.isFinite(tz) ? tz : 0,
        })
        body.sources = { usageLog: usage.file, toolsLog: tools.file, usageRows: usage.rows().length, toolRows: tools.rows().length }
        return json(res, 200, body)
      }
      if (url.pathname === "/api/health") {
        return json(res, 200, { ok: true, usageLog: usage.file, toolsLog: tools.file })
      }
      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1))
      const full = normalize(join(APP, rel))
      if (!full.startsWith(APP + sep)) return text(res, 400, "bad path")
      const content = await readFile(full).catch(() => null)
      if (!content) return text(res, 404, "not found")
      const ext = full.slice(full.lastIndexOf("."))
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" })
      res.end(content)
    } catch (e) {
      json(res, 500, { error: String(e?.message || e) })
    }
  }
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}
function text(res, code, body) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" })
  res.end(body)
}

// Start listening. A port still held by a previous host is retried in the
// background instead of failing the host's start.
export function serve(options = {}) {
  const port = Number(options.port) > 0 ? Number(options.port) : 3492
  const server = createServer(createHandler(options))
  const ready = new Promise((resolve) => {
    let tries = 0
    const attempt = () => server.listen(port, "127.0.0.1")
    server.on("listening", () => resolve(port))
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE" && tries++ < 30) setTimeout(attempt, 2000)
      else { console.error("[agent-lens] could not listen:", e.message); resolve(null) }
    })
    attempt()
  })
  return { server, port, ready }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = serve({ port: process.env.AGENT_LENS_PORT })
  s.ready.then((p) => p && console.log(`agent-lens on http://127.0.0.1:${p}/`))
}
