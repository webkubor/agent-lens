import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseModels, summarizeRuns, runBenchmark, DEFAULT_MODELS } from "../lib/benchmark.mjs"

const okRun = (over = {}) => ({
  model: "alpha/a1", provider: "alpha", task: "text", status: 200, ttft: 100, latency: 500,
  outTok: 20, totalTok: 25, contentLen: 40, error: null, timedOut: false, ...over,
})

test("summarizeRuns sorts by error rate then p95 and computes per-provider reliability", () => {
  const runs = [
    okRun({ model: "beta/b1", provider: "beta", status: 502, error: "HTTP 502", latency: 200, ttft: null }),
    okRun({ model: "alpha/a1", provider: "alpha", latency: 100, ttft: 90 }),
    okRun({ model: "alpha/a1", provider: "alpha", latency: 300, ttft: 290 }),
    okRun({ model: "alpha/a1", provider: "alpha", status: 429, error: "rate limit", latency: 50, ttft: 40 }),
    okRun({ model: "gamma/g1", provider: "gamma", status: 0, timedOut: true, latency: 120000, error: "aborted", ttft: null }),
  ]
  const s = summarizeRuns(runs)
  assert.equal(s.length, 3)
  // alpha: 1 fail / 3 => err 1/3; beta: 1/1 => err 1; gamma: 1/1 => err 1 (tie with beta by err, breaks on p95)
  assert.equal(s[0].provider, "alpha")
  assert.equal(s[0].samples, 3)
  assert.equal(s[0].ok, 2)
  assert.equal(s[0].fail, 1)
  assert.equal(s[0].errorRate, 1 / 3)
  assert.equal(s[0].p50, 100)
  assert.equal(s[0].p95, 300)
  assert.equal(s[0].ttftP50, 90)
  assert.equal(s[0].topErrors.length, 1)
  // alpha's sorted order has ok before fail; 429's latency 50 fits into ms pool
  // gamma routes below beta because both err=1 but gamma p95(120000) > beta p95(200)
  assert.equal(s[1].provider, "beta")
  assert.equal(s[2].provider, "gamma")
  const g = s[2]
  assert.equal(g.timeout, 1)
  assert.equal(g.fail, 1)
  assert.equal(g.timeoutShare, 1)
  // ok pools only include successful runs
  assert.equal(g.ms.length, 0)
})

test("summarizeRuns rejects non-2xx/3xx and computes error rates over all sampled requests", () => {
  const s = summarizeRuns([
    okRun({ status: 403, error: "disabled" }),
    okRun({ status: 200 }),
    okRun({ status: 500, error: "boom" }),
  ])
  assert.equal(s[0].samples, 3)
  assert.equal(s[0].ok, 1)
  assert.equal(s[0].fail, 2)
  assert.equal(s[0].errorRate, 2 / 3)
  assert.deepEqual(s[0].topErrors.map(e => e.split(" ")[0]), ["disabled", "boom"])
})

test("parseModels keeps one known model per provider and prefers fallback ids", () => {
  const models = parseModels([
    { id: "deepseek/deepseek-flash" },
    { id: "deepseek/deepseek-v4.1-flash" },
    { id: "codex/gpt-6.1-sol" },
    { id: "unknown/x1" },
    { id: "group/team-a" },
    { id: "plain-id" },
    { id: 7 },
    {},
  ])
  assert.equal(models.deepseek, "deepseek/deepseek-flash")
  assert.equal(models.codex, "codex/gpt-6.1-sol")
  assert.equal("plain-id" in models, false)
  assert.equal(Object.keys(models).length, 2)
})

test("parseModels falls back to first model when nothing known matches", () => {
  const models = parseModels([{ id: "alpha/a1" }])
  assert.deepEqual(models, { alpha: "alpha/a1" })
  assert.deepEqual(parseModels([]), {})
  assert.deepEqual(parseModels(null), {})
})

test("runBenchmark issues one request per provider through the gateway and writes JSONL records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hw-bench-"))
  let modelsHit = 0
  let chatHit = 0
  const gateway = await new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/v1/models") {
        modelsHit++
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ data: [{ id: "alpha/a1" }, { id: "boxer/b1" }] }))
        return
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        chatHit++
        let body = ""
        req.on("data", (c) => (body += c))
        req.on("end", () => {
          const payload = JSON.parse(body)
          if (payload.model === "boxer/b1") {
            res.writeHead(429, { "content-type": "application/json" })
            res.end(JSON.stringify({ error: { message: "rate limited" } }))
            return
          }
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            usage: { completion_tokens: 3, total_tokens: 9 },
          }))
        })
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }))
  })
  const file = join(dir, "bench.jsonl")
  try {
    const { rows, summary } = await runBenchmark({
      gateway: gateway.url,
      file,
      models: { alpha: "alpha/a1", boxer: "boxer/b1", ghost: "" },
      perRequestMs: 5000,
    })
    assert.equal(rows.length, 2) // ghost has no model mapping, skipped
    assert.equal(summary.length, 2)
    const alpha = summary.find((s) => s.provider === "alpha")
    const boxer = summary.find((s) => s.provider === "boxer")
    assert.equal(alpha.errorRate, 0)
    assert.equal(boxer.errorRate, 1)
    assert.equal(alpha.ttftP50 > 0, true)
    // JSONL persisted with one record per sample incl. the failing one
    const lines = (await readFile(file, "utf8")).trim().split("\n")
    assert.equal(lines.length, 2)
    const boxerLine = JSON.parse(lines.find((l) => l.includes("boxer/b1")))
    assert.equal(boxerLine.status, 429)
    assert.equal(boxerLine.error.includes("rate limited"), true)
    const sysCalls = [modelsHit, chatHit]
    assert.deepEqual(sysCalls, [0, 2]) // discovery is not called by runBenchmark itself
  } finally {
    await new Promise((r) => gateway.server.close(r))
    await rm(dir, { recursive: true, force: true })
  }
})

test("runBenchmark repeats each provider the requested number of samples", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hw-bench-"))
  let chatHit = 0
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") { res.writeHead(404); res.end(); return }
    chatHit++
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { completion_tokens: 3, total_tokens: 9 } }))
    })
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const gateway = `http://127.0.0.1:${server.address().port}`
  const file = join(dir, "bench.jsonl")
  try {
    const { rows, summary } = await runBenchmark({ gateway, file, models: { alpha: "alpha/a1" }, samples: 3, perRequestMs: 5000 })
    assert.equal(rows.length, 3)
    assert.equal(chatHit, 3)
    assert.equal(summary.length, 1)
    assert.equal(summary[0].samples, 3)
    assert.equal(summary[0].errorRate, 0)
    const lines = (await readFile(file, "utf8")).trim().split("\n")
    assert.equal(lines.length, 3)
  } finally {
    await new Promise((r) => server.close(r))
    await rm(dir, { recursive: true, force: true })
  }
})

test("DEFAULT_MODELS maps known suppliers to gateway-format ids with a provider prefix", () => {
  const ids = Object.values(DEFAULT_MODELS)
  for (const id of ids) assert.equal(id.includes("/") && !id.startsWith("group/"), true, id)
})