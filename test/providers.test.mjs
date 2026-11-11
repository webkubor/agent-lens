import { test } from "node:test"
import assert from "node:assert/strict"
import { parseUsageLine } from "../lib/usage.mjs"
import { summarizeProviders } from "../lib/providers.mjs"
import { errorReason } from "../lib/errors.mjs"

const row = (values = {}) => parseUsageLine(JSON.stringify({ t: 100, agent: "claude", model: "m1", provider: "alpha", status: 200, ...values }))
const summarize = (rows, options = {}) => summarizeProviders(rows, { since: 50, now: 200, ...options })

test("supplier/harness rates use all requests and separate cancellations, including failures with HTTP 200", () => {
  const rows = [row(), row({ status: 429 }), row({ status: 499, err: "cancelled" }), row({ status: 200, err: "stream failed" }), row({ agent: "codex" }), row({ provider: "beta", status: 502 })]
  const { providers } = summarize(rows)
  const p = providers.find(p => p.provider === "alpha")
  assert.deepEqual([p.calls, p.failed, p.cancelled, p.errorRate], [5, 2, 1, 2 / 5])
  const claude = p.harnesses.find(a => a.agent === "claude")
  assert.deepEqual([claude.calls, claude.failed, claude.cancelled, claude.errorRate], [4, 2, 1, .5])
  assert.equal(p.reasons.reduce((n, r) => n + r.count, 0), p.failed)
  assert.equal(p.reasons.find(r => r.reason === "rateLimit").status, 429)
  assert.equal(providers.find(p => p.provider === "beta").errorRate, 1)
})

test("period, client and exact model filters preserve discovery and distinguish unknown providers", () => {
  const rows = [row(), row({ model: "m2" }), row({ agent: "curl" }), row({ t: 49 }), row({ t: 201 }), row({ provider: undefined, model: "legacy" })]
  const all = summarize(rows)
  assert.equal(all.providers.reduce((n, p) => n + p.calls, 0), 3)
  assert.deepEqual(all.models, ["legacy", "m1", "m2"])
  assert.equal(all.providers.find(p => p.provider === "unknown").calls, 1)
  assert.equal(summarize(rows, { showClients: true }).providers[0].calls, 3)
  const filtered = summarize(rows, { model: "m2" })
  assert.equal(filtered.providers[0].calls, 1)
  assert.deepEqual(filtered.models, all.models)
  assert.deepEqual(filtered.providerOptions, all.providerOptions)
  assert.deepEqual(summarize(rows, { model: "missing" }).providers, [])
  assert.deepEqual(summarize([]).models, [])
})

test("classifies common failure reasons without retaining private upstream payloads", () => {
  for (const [status, type, message, expected] of [
    [400, "context_length_exceeded", "", "context"], [429, "insufficient_quota", "", "quota"],
    [429, "", "", "rateLimit"], [401, "", "", "auth"], [403, "", "", "auth"],
    [404, "", "The requested model is not supported", "model"], [504, "", "", "timeout"],
    [0, "", "socket ECONNRESET", "network"],
    [200, "", "WorkBuddy: ECONNRESET: The socket connection was closed", "stream"], [502, "", "", "server"],
    [400, "invalid_request_error", "", "request"], [0, "", "", "unknown"],
    [200, "", "Codex: connection lost mid-reply (unexpected EOF)", "stream"],
    [200, "", "the model answered nothing", "emptyReply"],
    [200, "reply_loop", "magpie ended this reply", "replyLoop"],
    [200, "", "Internal server error. Please retry", "server"],
  ]) assert.equal(errorReason(status, type, message), expected)
  // Built at runtime so the file holds no credential-shaped literal.
  const privateText = ["CUSTOM_PRIVATE_ACCOUNT", "sk", "example", "private", "value"].join("-")
  const r = row({ status: 500, err: privateText, host: "private.example", providerAccount: privateText })
  assert.equal(r.errorReason, "server")
  assert.ok(!JSON.stringify(r).includes(privateText))
  assert.ok(!JSON.stringify(summarize([r])).includes(privateText))
  assert.ok(!JSON.stringify(summarize([r])).includes("private.example"))
})

test("authenticated summary exposes model-filtered supplier reports without changing agent totals", async () => {
  const { createServer } = await import("node:http")
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { createHandler, TOKEN_HEADER } = await import("../service.mjs")
  const dir = await mkdtemp(join(tmpdir(), "hw-providers-"))
  const server = createServer()
  try {
    const rows = [
      { agent: "claude", provider: "alpha", model: "m1", status: 200 },
      { agent: "codex", provider: "alpha", model: "m2", status: 429, err: "PRIVATE_PAYLOAD" },
      { agent: "codex", provider: "alpha", model: "m2", status: 499 },
    ].map(r => JSON.stringify({ t: Date.now() - 100, ...r }))
    await writeFile(join(dir, "usage.jsonl"), rows.join("\n") + "\n")
    await new Promise(r => server.listen(0, "127.0.0.1", r))
    const port = server.address().port
    server.on("request", createHandler({ port, token: "test-token", dataDir: dir, usageLog: join(dir, "usage.jsonl"), gatewayUrl: "http://127.0.0.1:9" }))
    const response = await fetch(`http://127.0.0.1:${port}/api/summary?providerModel=m2`, { headers: { [TOKEN_HEADER]: "test-token" } })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.totals.calls, 3)
    const p = result.providerView.providers[0]
    assert.deepEqual([p.calls, p.failed, p.cancelled, p.errorRate], [2, 1, 1, .5])
    assert.deepEqual(p.harnesses.map(h => h.agent), ["codex"])
    assert.deepEqual(result.providerView.models, ["m1", "m2"])
    assert.equal(JSON.stringify(result.providerView).includes("PRIVATE_PAYLOAD"), false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
