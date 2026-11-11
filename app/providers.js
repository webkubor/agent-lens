import { extrema, extremum } from "./comparison.js"

export function providerView({ T, esc, int, pct, locale, onModelChange }) {
  const $ = id => document.getElementById(id)
  const date = t => new Date(t).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  let data, provider = "", agent = "", sharing = false
  const name = id => data.agents.find(a => a.agent === id)?.name || id
  const providerName = id => id === "unknown" ? T("providers.unknown") : id
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`
  const reasonLabel = r => r.status >= 400 ? `${T(`reason.${r.reason}`)} · HTTP ${r.status}`
    : r.status === 200 ? `${T(`reason.${r.reason}`)} · ${T("providers.midStream")}`
    : `${T(`reason.${r.reason}`)} · ${T("providers.noStatus")}`

  function paint(d) {
    data = d
    const view = d.providerView
    $("providerSelect").innerHTML = view.providerOptions.map(id => option(id, providerName(id))).join("")
    if (!view.providerOptions.includes(provider)) provider = view.providers[0]?.provider || ""
    $("providerSelect").value = provider
    $("providerSelect").disabled = !view.providerOptions.length
    $("providerModel").innerHTML = option("", T("providers.allModels")) + view.models.map(m => option(m, m)).join("")
    // Preserve a selected model across an empty period so the empty state is explicit.
    if (view.model && !view.models.includes(view.model)) $("providerModel").insertAdjacentHTML("beforeend", option(view.model, view.model))
    $("providerModel").value = view.model
    render()
  }
  function render() {
    const p = data.providerView.providers.find(p => p.provider === provider)
    $("providerReportTitle").textContent = provider ? `${providerName(provider)} · ${T("providers.report")}` : T("providers.title")
    $("providerScope").textContent = `${date(data.since)} — ${date(data.generatedAt)} · ${data.providerView.model || T("providers.allModels")} · ${$("clients").checked ? T("providers.withClients") : T("providers.agentsOnly")}`
    $("providerKpis").innerHTML = p ? [
      [T("col.calls"), int(p.calls)], [T("kpi.failed"), int(p.failed)],
      [T("col.errorRate"), pct(p.errorRate)], [T("providers.cancelled"), int(p.cancelled)],
    ].map(([label, value]) => `<div class="kpi"><div class="k">${esc(label)}</div><div class="v num">${esc(value)}</div></div>`).join("") : ""
    $("providerShare").disabled = !p
    if (!p) {
      $("providerTable").innerHTML = ""
      $("providerReasons").innerHTML = `<p class="empty-note">${esc(T("providers.empty"))}</p>`
      return
    }
    const ranges = extrema(p.harnesses, ["errorRate"], (row, key) => row[key])
    const cells = p.harnesses.map(a => {
      const edge = extremum(a.errorRate, ranges.errorRate, "low")
      const top = a.reasons[0]
      return `<tr><td><button class="provider-agent" data-provider-agent="${esc(a.agent)}" aria-pressed="${agent === a.agent}">${esc(name(a.agent))}</button></td>
        <td class="n">${int(a.calls)}</td><td class="n">${int(a.failed)}</td>
        <td class="n ${edge ? `metric-${edge.quality}` : ""}">${pct(a.errorRate)}${edge ? `<span class="extreme-label">${esc(T(`extreme.${edge.quality}`))}</span>` : ""}</td>
        <td class="n">${int(a.cancelled)}</td><td>${top ? esc(reasonLabel(top)) : "—"}</td></tr>`
    }).join("")
    $("providerTable").innerHTML = `<thead><tr>${["col.agent", "col.calls", "kpi.failed", "col.errorRate", "providers.cancelled", "providers.topReason"].map(k => `<th>${esc(T(k))}</th>`).join("")}</tr></thead><tbody>${cells}</tbody>`
    renderReasons(p)
  }
  function renderReasons(p) {
    if (!p.harnesses.some(a => a.agent === agent)) agent = ""
    const selected = p.harnesses.find(a => a.agent === agent)
    const b = selected || p
    $("providerReasons").innerHTML = `<div class="reason-heading"><h3>${esc(T("providers.reasons"))} · ${esc(selected ? name(agent) : T("providers.allHarnesses"))}</h3>${selected ? `<button id="providerAll" class="pill">${esc(T("providers.allHarnesses"))}</button>` : ""}</div>
      ${b.reasons.length ? `<ul class="reason-list">${b.reasons.map(r => `<li><span>${esc(reasonLabel(r))}</span><b class="num">${int(r.count)} · ${pct(r.count / b.failed)}</b></li>`).join("")}</ul><p class="hint">${esc(T("providers.reasonShare"))}</p>` : `<p class="empty-note">${esc(T("providers.noFailures"))}</p>`}`
    $("providerAll")?.addEventListener("click", () => { agent = ""; render() })
  }
  $("providerSelect").addEventListener("change", e => { provider = e.target.value; agent = ""; render() })
  $("providerModel").addEventListener("change", e => { agent = ""; onModelChange(e.target.value) })
  $("providerTable").addEventListener("click", e => {
    const button = e.target.closest("[data-provider-agent]")
    if (button) {
      agent = button.dataset.providerAgent
      render()
      for (const b of $("providerTable").querySelectorAll("button")) if (b.dataset.providerAgent === agent) b.focus({ preventScroll: true })
    }
  })
  function share(value) {
    if (value && $("providersBlock").getAttribute("aria-busy") === "true") return
    sharing = value
    document.body.classList.toggle("share-mode", sharing)
    $("providerShare").setAttribute("aria-pressed", String(sharing))
    $("providerShare").textContent = T(sharing ? "providers.exitShare" : "providers.share")
    if (sharing) window.scrollTo(0, 0)
  }
  $("providerShare").addEventListener("click", () => share(!sharing))
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sharing) share(false) })
  return { paint, isSharing: () => sharing }
}
