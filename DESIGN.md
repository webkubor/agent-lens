# HarnessWeight UI

Existing design reference: `app/style.css` and `brand/manifest.json` at d9e87b7.
This document records the existing interface; inferred style documentation awaits
owner review. The requested change authorizes green/red metric extremes and a
provider report using the existing layout.

- Preserve the teal brand, orange spend indicators, system font, compact tables,
  cards, 14px panel radius, and light/dark themes.
- Keep all semantic colors in `app/style.css`. Green means the favorable extreme,
  red the unfavorable extreme. Labels also communicate the meaning without color.
- Cache ratio favors higher values. Input consumption, error rate, latency and
  tool overhead favor lower values within the observed sample.
- Request volume, generated output and session span have neutral min/max markers.
  They have no universal quality direction. All equal values have no extremes;
  all tied extremes share a marker. Missing measurements use an em dash.
- Provider reports reuse cards and tables. Preserve period, model scope, counts,
  cancellations, source and methodological note in screenshot mode.
- Error categories are inferred locally. Never display raw error payloads,
  account details, endpoints, session identifiers or credentials in the report.
- Use the existing responsive layout; wide tables scroll within their container.
  Controls work with keyboard, and both declared themes remain supported.
- This is a local authenticated dashboard; public search indexing does not apply.

Decision, 2026-11-11: implement the user's metric highlighting and supplier-view
request with the existing styling. Runtime acceptance uses the local service and
real browser interactions; no build system or new runtime dependencies required.

Decision, 2026-11-11 (UI readability, requested by owner): preserve the existing
teal/orange identity and all underlying measurements; prioritize scanning over
showing every explanation simultaneously. Show one insight with an expandable
remainder, a compact KPI strip, and mutually exclusive card overview / comparison
views (remember the view locally). Keep insight expansion on data refresh. Card
headline follows the selected sort; details retain task coverage and source notes.
The comparison table switches among consumption, stability, tasks/sessions and tools
so desktop comparison does not require one wide fourteen-column table;
missing values stay distinct from zero and sort last. Native sort buttons move
existing rows, retain focus and expose aria-sort. A named keyboard scroll region
and sticky row headers retain context. Keep provider screenshot reports intact.
Reuse existing colors/radius/shadow; add spacing, type and control-height aliases
for the new compact layouts. Tradeoff: full metric comparison takes one explicit
view switch, avoiding duplicate agent lists in the default overview.
