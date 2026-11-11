#!/usr/bin/env node
// HarnessWeight benchmark CLI. Runs a provider benchmark through the local
// magpie gateway, persists one JSON line per run, and prints a plain-text
// summary to stdout.
//
//   --gateway <url>   default MAGPIE_GATEWAY_URL or http://127.0.0.1:3425
//   --file <path>     JSONL append target (default: scratch or ./bench.jsonl)
//   --providers a,b   comma list of provider keys to run (default: discover)
//   --max-providers n cap on discovered providers (default 64)
//   --task text|code|reasoning
//   --samples <n>     requests per provider (default 1)
//   --once            run one request per selected provider (default)
//   --json            print the summary as JSON instead of a table
//   --report <path>   also write a self-contained HTML report page
import { env, argv, stdout, exit } from "node:process"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { writeFile } from "node:fs/promises"
import { runBenchmark, discoverModels, DEFAULT_MODELS, GATEWAY } from "../lib/benchmark.mjs"

function flag(name, dflt = "") {
  const i = argv.indexOf(`--${name}`)
  return i > -1 && argv[i + 1] ? argv[i + 1] : dflt
}
const has = (name) => argv.includes(`--${name}`)

function defaultFile() {
  const base = env.HARNESSWEIGHT_BENCH_FILE
  if (base) return base
  return join(env.HARNESSWEIGHT_DATA_DIR || hookDataDir(), "bench.jsonl")
}
function hookDataDir() {
  // The service data dir on this host; a single stable place for the bench log.
  return env.HARNESSWEIGHT_BENCH_DIR || join(homedir(), ".config", "magpie", "harnessweight")
}

function table(rows) {
  const hdrs = ["provider", "model", "samples", "err%", "p50ms", "p95ms", "ttftP50ms", "timeouts"]
  const pad = (s, w) => String(s).padEnd(w)
  const widths = hdrs.map((h, i) => Math.max(h.length, ...rows.map((r) => String([r.provider, r.model, r.samples, (r.errorRate * 100).toFixed(1), r.p50, r.p95, r.ttftP50 ?? 0, r.timeout][i] || "").length)))
  const line = hdrs.map((h, i) => pad(h, widths[i])).join("  ")
  const out = [line, hdrs.map((h, i) => "-".repeat(widths[i])).join("  ")]
  for (const r of rows) {
    out.push(hdrs.map((h, i) => pad([r.provider, r.model, r.samples, (r.errorRate * 100).toFixed(1), r.p50, r.p95, r.ttftP50 ?? 0, r.timeout][i], widths[i])).join("  "))
  }
  return out.join("\n")
}

let exitCode = 0

function reportHtml({ gateway, file, task, samples, generatedAt, summary }) {
  const rows = summary.map((r) => {
    const errRate = Math.round(r.errorRate * 100)
    const bar = Math.max(0, Math.min(100, errRate))
    const details = (r.topErrors?.filter(Boolean) || []).map((e) => `<li>${esc(e)}</li>`).join("") || "<li>No errors</li>"
    return `<tr class="row" tabindex="0" data-prov="${esc(r.provider)}"><td class="prov">${esc(r.provider)}</td><td class="model mon">${esc(r.model)}</td>
      <td class="num">${r.samples}</td>
      <td class="${errRate ? "bad" : "good"} bar-cell"><div class="bar-wrap"><div class="bar" style="width:${bar}%"></div></div><span class="num">${errRate}%</span></td>
      <td class="num mon">${r.p50 ?? 0}</td><td class="num mon">${r.p95 ?? 0}</td><td class="num mon">${r.ttftP50 ?? 0}</td><td class="num">${r.timeout}</td>
      <td class="err">${esc((r.topErrors?.[0] || "") || "—")}</td></tr>
      <tr class="detail" data-prov="${esc(r.provider)}" hidden><td colspan="9"><strong>${esc(r.provider)}</strong> — error reasons &amp; sample latency<br><ul>${details}</ul><div class="mon small">p50 ${r.p50 ?? 0}ms · p95 ${r.p95 ?? 0}ms · TTFT p50 ${r.ttftP50 ?? 0}ms · timeouts ${r.timeout}</div></td></tr>`
  }).join("\n")
  const healthy = summary.filter((r) => r.errorRate === 0).length
  const failing = summary.length - healthy
  const slowest = [...summary].sort((a, b) => b.p95 - a.p95)[0]
  const cards = `<div class="kpi"><div class="k">Providers</div><div class="v">${summary.length}</div></div>
    <div class="kpi"><div class="k">Healthy</div><div class="v good">${healthy}</div></div>
    <div class="kpi"><div class="k">Failing</div><div class="v ${failing ? "bad" : "good"}">${failing}</div></div>
    <div class="kpi"><div class="k">Samples</div><div class="v">${summary.reduce((a, r) => a + r.samples, 0)}</div></div>
    <div class="kpi"><div class="k">Slowest p95</div><div class="v mon">${slowest?.p95 ?? 0}ms</div><div class="k">${esc(slowest?.provider || "—")}</div></div>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>HarnessWeight provider benchmark</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%236366f1'/%3E%3C/svg%3E">
<style>
:root{--bg:#0f1117;--panel:#171b26;--line:#262b3b;--text:#e6e9f2;--muted:#8b92a7;--green:#34d399;--red:#f87171;--accent:#6366f1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;padding:32px;display:flex;flex-direction:column;gap:22px}
h1{font-size:20px;margin:0;display:flex;align-items:center;gap:10px}
h1 .dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.kpi .v{font-size:22px;font-weight:700;line-height:1.2;margin-top:2px}
.card>div:first-child{font-weight:600;margin-bottom:6px}.k{color:var(--muted);font-size:11px;margin-top:6px}.v{font-size:20px;font-weight:700}
.good{color:var(--green)}.bad{color:var(--red)}.mon{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 14px;text-align:left;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:#1b2030}
tbody tr:last-child td{border-bottom:none}.prov{font-weight:600}.model{color:var(--muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.num{text-align:right}.bar-cell{text-align:right;white-space:nowrap}.bar-wrap{display:inline-block;width:70px;height:8px;border-radius:4px;background:#232a3e;vertical-align:middle;overflow:hidden}
.bar{height:100%;background:linear-gradient(90deg,#f59e0b,#f87171)}.err{color:var(--muted);font-size:12px;max-width:300px}
.meta{color:var(--muted);font-size:12px;display:flex;gap:18px;flex-wrap:wrap}
.detail td{background:#12151f}.detail ul{margin:8px 0 4px;padding-left:18px}.small{font-size:12px}.row{cursor:pointer}.row:hover{background:#1a2030}
</style></head><body>
<h1><span class="dot"></span>HarnessWeight · Provider Benchmark</h1>
<div class="meta"><span>Generated ${new Date(generatedAt).toLocaleString()}</span><span>Task: ${esc(task)}</span><span>Samples per provider: ${samples ?? 1}</span><span>Gateway: ${esc(gateway)}</span></div>
<div class="cards">${cards}</div>
<table>
<thead><tr><th>Provider</th><th>Model</th><th>Samples</th><th>Error rate</th><th>p50 (ms)</th><th>p95 (ms)</th><th>TTFT p50 (ms)</th><th>Timeouts</th><th>Top error</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>
document.querySelectorAll(".row").forEach((row) => {
  row.addEventListener("click", () => {
    const p = row.dataset.prov
    const detail = document.querySelector('.detail[data-prov="' + p + '"]')
    detail.hidden = !detail.hidden
    if (!detail.hidden) row.classList.add("active")
  })
  row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click() } })
})
</script>
</body></html>`
}
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }

async function main() {
  const gateway = flag("gateway", GATEWAY())
  const file = flag("file", defaultFile())
  const task = flag("task", "text")
  const asJson = has("json")
  const selected = flag("providers", "")

  let models
  if (selected) {
    models = {}
    for (const p of selected.split(",")) {
      const k = p.trim()
      if (DEFAULT_MODELS[k]) models[k] = DEFAULT_MODELS[k]
    }
    if (!Object.keys(models).length) {
      throw new Error(`No known provider in "--providers ${selected}". Known: ${Object.keys(DEFAULT_MODELS).join(", ")}`)
    }
  } else {
    const maxProviders = Math.max(1, Number(flag("max-providers", "64")) || 64)
    models = await discoverModels({ gateway, maxProviders })
    if (!Object.keys(models).length) models = DEFAULT_MODELS
  }

  const report = flag("report", "")
  const samples = Math.max(1, Number(flag("samples", "1")) || 1)
  const { summary } = await runBenchmark({ gateway, file, models, task, samples })
  if (report) {
    const html = reportHtml({ gateway, file, task, samples, generatedAt: Date.now(), summary })
    await writeFile(report, html, "utf8")
    await writeFile(join(dirname(report), "bench-data.json"), JSON.stringify({ gateway, file, task, samples, generatedAt: Date.now(), summary }, null, 2), "utf8")
    stdout.write(`Report written to ${report}\n`)
  }
  if (asJson) {
    stdout.write(JSON.stringify({ gateway, file, task, generatedAt: Date.now(), summary }, null, 2) + "\n")
  } else {
    stdout.write(`Gateway: ${gateway}\nTask: ${task}\nFile: ${file}\nGenerated at ${new Date().toISOString()}\n\n`)
    stdout.write(table(summary) + "\n")
  }
  if (summary.some((r) => r.errorRate >= 0.5)) exitCode = 2
}

main().catch((e) => { console.error("[bench] " + (e?.message || e)); exit(1) }).then(() => exit(exitCode))