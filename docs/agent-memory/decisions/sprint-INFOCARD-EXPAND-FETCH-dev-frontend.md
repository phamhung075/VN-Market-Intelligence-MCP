# Decision Journal — Sprint INFOCARD-EXPAND-FETCH · dev-frontend

**Sprint goal:** Epic INFOCARD-EXPAND-FETCH — kill "Invalid Date" on cascade-macro info card via ONE reusable date-parse helper
**Agent:** dev-frontend
**Started:** 2026-06-16T18:30:00Z

---

### STEP dev-frontend-S2 · dev-frontend · 2026-06-16T19:30:00Z
**task-id:** FIX-INFOCARD-DROPDOWN-EXPAND
**what-done:** Created apps/frontend/app/components/InfoCardExpand.tsx — reusable Radix Collapsible expand-on-click primitive (collapsed=summary, expanded=full finding_data generically rendered); extended AgentSignal domain type with findingData + source fields; updated toAgentSignal mapper; wired MacroImpactPanel + StockSignalsPanel in dashboard.analysis.tsx to the new primitive; 25 new GREEN tests.
**what-considered:**
- Radix Collapsible primitive chosen for the expand/collapse toggle — already a project dep (~/components/ui/collapsible wired from shadcn/ui); provides keyboard-accessible trigger + managed aria-expanded without bespoke state machinery. Alternatives (native `<details>`, custom useState-only disclosure) were rejected: `<details>` lacks design-token styling and aria-expanded observation; custom disclosure duplicates what Radix already ships correctly.
- FIELD_LABELS is a Vietnamese UX label map for well-known finding_data keys, NOT a data branch — FindingDataPanel renders ANY Record<string,unknown> generically via the humanLabel() fallback (snake_case → title-case) for keys absent from the map. This satisfies /goal#2 (generic; no per-card/per-ticker hardcode): a new signal type with unknown keys still renders without a code change.
- Honest empty-state chosen when findingData is null AND source is null: renders "Không có dữ liệu chi tiết." — never fabricates or shows placeholder values, consistent with the standing no-fake-data goal. Empty/null individual field values are also suppressed from the rendered list (formatFieldValue returns "—" → filtered out), so only present data is shown.
- source field rendered as a clickable `<a target="_blank" rel="noopener noreferrer">` link, not plain text — fulfils the standing user goal that every served info element must LINK its source so the user can re-check/verify without leaving the dashboard.
- Component placed in apps/frontend/app/components/ (DDD interface layer) — correct tier for a reusable React primitive; no domain or lib/api imports; fully decoupled from any specific signal type.
**why-decision:** Single reusable primitive covers ALL info-card call sites (/goal#2); uses existing Radix dep (no new installs); honest empty-state + source link directly address the two standing user goals (no-fake-data + source provenance for re-check).
**why-change:** No deviation from task spec; fast-track classification respected; only the DJ entry was absent (procedural DJ-GATE-1 remediated here).

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-16T18:30:00Z
**task-id:** FIX-CASCADE-CARD-INVALID-DATE
**what-done:** Created app/lib/formatDate.ts with 4 exports (parseDate, formatDateVi, formatDateOnlyVi, formatSignalTimestamp); replaced 4 brittle inline date-parse sites across 3 route files.
**what-considered:**
- Only option: single shared helper in app/lib/ (application layer per DDD map) consumed by all 4 call sites; per-card surgery would violate /goal#2 generic mandate and produce recurring bugs as new formats land.
- Considered reusing ClientTimestamp component — rejected: it is SSR-suppressed React, not usable for string output in formatSignalTime or in server-side logic.
- Helper location: app/lib/formatDate.ts — consistent with DDD "application" layer (non-api, non-domain, non-component); formatters that are pure string→string live here.
**why-decision:** Single helper covers ALL 4 call sites + is backend-format-agnostic (works with both current SQLite bare-format AND the upcoming ISO-normalised format from FIX-SIGNALS-STOCK-FULL-DETAIL) — zero coupling to backend sprint ordering.
**why-change:** No deviation from task spec; fast-track classification respected (no new abstractions beyond what was required).
