import { extrema, extremum } from "./comparison.js"

export function providerView({ T, esc, int, pct, locale, onModelChange }) {
  const $ = id => document.getElementById(id)
  const date = t => new Date(t).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  let data, provider = "", agent = "", sharing = false, available = false, reasonsOpen = false
  const name = id => data.agents.find(a => a.agent === id)?.name || id
  const providerName = id => id === "unknown" ? T("providers.unknown") : id
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`
  const reasonLabel = r => r.status >= 400 ? `${T(`reason.${r.reason}`)} · HTTP ${r.status}`
    : r.status === 200 ? `${T(`reason.${r.reason}`)} · ${T("providers.midStream")}`
    : `${T(`reason.${r.reason}`)} · ${T("providers.noStatus")}`

  function paint(d) {
    data = d
    const view = d.providerView
    available = ["providerOptions", "models", "providers"].every(key => Array.isArray(view?.[key]))
    $("providerUnavailable").hidden = available
    $("providerReport").hidden = !available
    $("providerModel").disabled = !available
    if (!available) {
      provider = agent = ""
      reasonsOpen = false
      share(false)
      for (const id of ["providerSelect", "providerModel", "providerReportTitle", "providerScope", "providerKpis", "providerTable", "providerReasons"]) $(id).innerHTML = ""
      $("providerSelect").disabled = true
      $("providerShare").disabled = true
      return
    }
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
    if (!available) return
    const focused = document.activeElement
    const focusedAgent = focused?.dataset.providerAgent
    const focusedReason = focused?.id === "providerAll" || focused?.matches("#providerReasonDetail > summary")
    const p = data.providerView.providers.find(p => p.provider === provider)
    $("providerReportTitle").textContent = provider ? `${providerName(provider)} · ${T("providers.report")}` : T("providers.title")
    $("providerScope").textContent = `${date(data.since)} — ${date(data.generatedAt)} · ${data.providerView.model || T("providers.allModels")} · ${$("clients").checked ? T("providers.withClients") : T("providers.agentsOnly")}`
    $("providerKpis").innerHTML = p ? [
      [T("col.calls"), int(p.calls)], [T("kpi.failed"), int(p.failed)],
      [T("col.errorRate"), pct(p.errorRate)], [T("providers.cancelled"), int(p.cancelled)],
    ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd class="num">${esc(value)}</dd></div>`).join("") : ""
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
      return `<tr><td><button class="provider-agent" aria-controls="providerReasonDetail" data-provider-agent="${esc(a.agent)}" aria-pressed="${agent === a.agent}">${esc(name(a.agent))}</button></td>
        <td class="n">${int(a.calls)}</td><td class="n">${int(a.failed)}</td>
        <td class="n ${edge ? `metric-${edge.quality}` : ""}">${pct(a.errorRate)}${edge ? `<span class="extreme-label">${esc(T(`extreme.${edge.quality}`))}</span>` : ""}</td>
        <td class="n">${int(a.cancelled)}</td><td class="reason-cell">${top ? esc(reasonLabel(top)) : "—"}</td></tr>`
    }).join("")
    $("providerTable").innerHTML = `<thead><tr>${["col.agent", "col.calls", "kpi.failed", "col.errorRate", "providers.cancelled", "providers.topReason"].map((k, i) => `<th scope="col"${i > 0 && i < 5 ? ' class="n"' : ""}>${esc(T(k))}</th>`).join("")}</tr></thead><tbody>${cells}</tbody>`
    renderReasons(p)
    if (focusedAgent) {
      const replacement = [...$("providerTable").querySelectorAll("[data-provider-agent]")].find(b => b.dataset.providerAgent === focusedAgent)
      replacement?.focus({ preventScroll: true })
    } else if (focusedReason) {
      $("providerReasonDetail")?.querySelector("summary")?.focus({ preventScroll: true })
    }
  }
  function renderReasons(p) {
    if (!p.harnesses.some(a => a.agent === agent)) agent = ""
    const selected = p.harnesses.find(a => a.agent === agent)
    const b = selected || p
    $("providerReasons").innerHTML = `<details id="providerReasonDetail" class="reason-detail"${reasonsOpen ? " open" : ""}>
      <summary><span>${esc(T("providers.reasons"))} <span class="reason-context">· ${esc(selected ? name(agent) : T("providers.allHarnesses"))}</span></span><span class="reason-count num">${int(b.failed)}</span></summary>
      <div class="reason-body">${selected ? `<button id="providerAll" class="pill">${esc(T("providers.allHarnesses"))}</button>` : ""}
      ${b.reasons.length ? `<ul class="reason-list">${b.reasons.map(r => `<li><span>${esc(reasonLabel(r))}</span><b class="num">${int(r.count)} · ${pct(r.count / b.failed)}</b></li>`).join("")}</ul><p class="hint">${esc(T("providers.reasonShare"))}</p>` : `<p class="empty-note">${esc(T("providers.noFailures"))}</p>`}</div></details>`
    $("providerReasonDetail")?.addEventListener("toggle", e => { reasonsOpen = e.target.open })
    $("providerAll")?.addEventListener("click", () => { agent = ""; render() })
  }
  $("providerSelect").addEventListener("change", e => { provider = e.target.value; agent = ""; reasonsOpen = false; render() })
  $("providerModel").addEventListener("change", e => { agent = ""; reasonsOpen = false; onModelChange(e.target.value) })
  $("providerTable").addEventListener("click", e => {
    const button = e.target.closest("[data-provider-agent]")
    if (button) {
      agent = agent === button.dataset.providerAgent ? "" : button.dataset.providerAgent
      reasonsOpen = true
      render()
      for (const b of $("providerTable").querySelectorAll("button")) if (b.dataset.providerAgent === agent) b.focus({ preventScroll: true })
    }
  })
  function share(value) {
    if (value && ($("providerShare").disabled || $("providersBlock").getAttribute("aria-busy") === "true")) return
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
