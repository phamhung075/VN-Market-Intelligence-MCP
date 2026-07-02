# BA Requirement Spec — MERGE-MONEY-RADAR-INTO-MOMENTUM

**Sprint:** MERGE-MONEY-RADAR-INTO-MOMENTUM
**BA task:** BA-MERGE-MONEY-RADAR-INTO-MOMENTUM
**Status:** SPEC COMPLETE
**Author:** ba
**Date:** 2026-07-02
**NEXT:** pm (SPRINT-S chain: ba → pm → dev-frontend → qa; single zone, NO architect split)

---

## 1. Feature Context

User request (verbatim, 2026-07-02): "need merge money-radar to momentum". Money Radar
(`/dashboard/money-radar`, Phase-0 shipped 2026-07-01) and Momentum P1
(`/dashboard/momentum`, shipped 2026-06-30) are two PARALLEL surfaces built from the same
mirror template (`docs/architecture-briefs/2026-07-01-money-radar.md` §8/§11.3 — money-radar
was explicitly built to "mirror `dashboard.momentum.tsx` structure"). PO product decisions
are already locked in `docs/data/orch/orch-state.json` `.task_board.in_progress[]` row
`BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.product_decisions` / `.design_constraints` — this spec
transposes those decisions into FR/DDD/AC form for pm to decompose, and adds the concrete
file-level findings PO's decisions did not need to resolve.

This task ABSORBS `FIX-FE-HEADER-NAV-MONEY-RADAR` (superseded, relocated to `done[]`,
**zero code was written** for it — confirmed by `git status --porcelain apps/frontend/` =
clean and `git log` showing no commit touching `TopNav.tsx` after money-radar shipped).

---

## 2. Live Surface Inventory (BA-verified by direct file read, 2026-07-02)

| Surface | File | Role | Merge fate |
|---|---|---|---|
| Momentum page | `apps/frontend/app/routes/dashboard.momentum.tsx` (481L) | 4 honest-NULL P1 cards; colocates DTOs + parser + formatters + fetcher + default component | **SURVIVES** — becomes the single unified surface |
| Money-radar page | `apps/frontend/app/routes/dashboard.money-radar.tsx` (561L) | 4 non-null P0 cards; identical colocation pattern | **CONVERTS** to redirect-only loader; business logic relocates into `dashboard.momentum.tsx` |
| Momentum proxy | `apps/frontend/app/routes/api.momentum-indicators.tsx` | Transparent `proxyUpstream` to mcp-server `/api/momentum-indicators` | **UNCHANGED** |
| Money-radar proxy | `apps/frontend/app/routes/api.money-radar.tsx` | Transparent `proxyUpstream` to mcp-server `/api/money-radar` | **UNCHANGED** — feeds the merged loader |
| Nav SSOT | `apps/frontend/app/components/TopNav.tsx` | `ANALYST_NAV[26]` (0-based) = `{ to: "/dashboard/momentum", label: "Động Lực P1" }`. **No money-radar entry exists today** (confirmed by grep — `FIX-FE-HEADER-NAV-MONEY-RADAR` was never implemented) | Relabel this ONE entry; do NOT add a second entry |
| Shared UI primitive | `apps/frontend/app/components/GaugeCard.tsx` | Generic card shell — renders its OWN `FreshnessBadge`, scalar, badge, details, `nullReason`, `expandContent`. **Already reused verbatim by BOTH pages today** | UNCHANGED — this is the correct reuse boundary (see §5 non-goals) |
| Shared UI primitive | `apps/frontend/app/components/FreshnessBadge.tsx`, `InfoCardExpand.tsx` | Per-card freshness + source-link dropdown | UNCHANGED |
| Shared hook | `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts` | `daily` tier → `clientRefreshMs: null` (no auto-poll interval; badge is still computed from `dataAsof`) | UNCHANGED; called ONCE per page (see FR-3) |
| Fetch layer | `apps/frontend/app/lib/api/fetchUtils.ts` `safeFetch<T>()` | **Already never throws** — internal try/catch returns `{data: parse(null), error}` on any failure (network, non-2xx, parse) | Confirms `Promise.allSettled` (PO's `loader` decision) is defense-in-depth, not the only guard — still implement literally per PO instruction |
| Test — momentum logic | `apps/frontend/app/__tests__/ind-p1-momentum-cards.test.ts` (458L) | Imports from `~/routes/dashboard.momentum` | **UNCHANGED** (imports still resolve — file survives) |
| Test — money-radar logic | `apps/frontend/app/__tests__/money-radar-cards.test.ts` (450L) | Imports `parseMoneyRadarCompositeDto`, `formatScalar2`, `formatCompositeScoreBadge`, `formatForeignAccumBadge`, `formatRelVolBadge`, `formatDivergenceBadge`, `formatDivergenceScalar`, `fetchMoneyRadarComposite`, type `MoneyRadarCompositeDto` from `~/routes/dashboard.money-radar` | **MUST update import path** to `~/routes/dashboard.momentum` (see FR-2) — this is what AC7 "assertions preserved/migrated" means concretely |
| Test — nav | `apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` (148L) | Hardcodes label `"Động Lực P1"` in 6 assertions + `ANALYST_NAV[26]` position check | **MUST update** the 6 label-string assertions to the new relabeled copy once pm/dev-frontend pick final copy (count assertions `toHaveLength(27)` / `toHaveLength(34)` **do NOT change** — no new entry added) |
| Test — nav (header SSOT) | `apps/frontend/app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx` | Was targeted by the (never-implemented) `FIX-FE-HEADER-NAV-MONEY-RADAR` for a 27→28 bump | **NOT touched by this task** — that bump does not happen; count stays 27/34 |
| Freshness SSOT | `docs/data/frontend-data-coverage-map.json` | 4 rows for `/dashboard/momentum` (roc/RS/52w/foreign_accum), **ZERO rows for `/dashboard/money-radar`** (confirmed by grep — gap predates this task, opened when Money Radar P0 shipped 2026-07-01 after the last coverage-map reconciliation on 2026-06-27) | Add 4 new rows under `page: "/dashboard/momentum"` for the radar scalars (see FR-5) — closes a pre-existing freshness-transparency gap as a side effect of the merge |

**Path correction (BA finding):** the task-board row's `files[]` lists
`apps/frontend/app/routes/__tests__/money-radar-cards.test.ts` — the real path (verified by
`find`) is `apps/frontend/app/__tests__/money-radar-cards.test.ts` (no `routes/` segment,
matches `ind-p1-momentum-cards.test.ts` sibling). pm should correct this in the decomposed
task's file list.

---

## 3. PO Product Decisions (verbatim from orch-state, carried forward as constraints)

Read from `.task_board.in_progress[]` row `BA-MERGE-MONEY-RADAR-INTO-MOMENTUM` (created_by:
po, 2026-07-02T04:37:13Z) — reproduced here so pm/dev-frontend do not need to re-read
orch-state:

- **Target:** `dashboard.momentum.tsx` becomes the single unified surface — TWO labelled
  sections: Section A = 4 existing momentum honest-NULL cards; Section B = 4 money-radar
  non-null cards (moved from `dashboard.money-radar.tsx`). Section headings/order/VN labels
  = BA detail (this spec proposes them in FR-1).
- **Loader:** merge both feeds via `Promise.allSettled` — fetch `/api/momentum-indicators`
  AND `/api/money-radar` independently so one feed's failure never blanks the other section.
- **Money-radar route fate:** convert `dashboard.money-radar.tsx` to a redirect loader →
  `/dashboard/momentum` (302). Do NOT delete the file (bookmarks/deep-links must not 404).
  `api.money-radar.tsx` proxy STAYS (feeds the merged loader).
- **Nav fate:** ONE unified nav entry. Relabel the existing "Động Lực P1" entry so it's
  discoverable as carrying the money-flow radar too (final copy = this spec's FR-1). Do NOT
  add a second "Radar Dòng Tiền" entry — that route becomes a redirect; a second entry would
  be a doomed double-entry.
- **Do-not-homogenize (HARD, brief §10):** radar cards render non-null (depth-independent
  inputs); momentum cards render honest-NULL (OHLCV-depth-gated). The merged page MUST
  preserve BOTH behaviors distinctly — the contrast validates the architecture.
- **Freshness:** each card keeps its OWN `FreshnessBadge`; SLA tier `daily`
  (`maxStalenessMin=1560`, 26h) for both families.
- **Source-link:** each card keeps its `InfoCardExpand` source-link + detail dropdown.
- **Language:** plain Vietnamese for all user-facing copy; divergence enum tokens
  (`GREEN`/`AMBER`/`RED`/`UNKNOWN`) render as-is per brief §8 — the human-facing badge under
  them stays Vietnamese.

---

## 4. Functional Requirements

### FR-1 — Unified page composition (interface layer)

`dashboard.momentum.tsx`'s default component renders TWO labelled `<section>` blocks inside
the existing `<div className="w-full space-y-6">` wrapper:

- **Section A — "Động Lực Thị Trường"** (existing `aria-label="Chỉ báo động lực thị
  trường"` grid, 4 cards, UNCHANGED markup/logic) — subtitle keeps its current copy.
- **Section B — "Radar Dòng Tiền"** (new `aria-label="Chỉ báo radar dòng tiền"` grid, 4
  cards, markup ported verbatim from `dashboard.money-radar.tsx`'s existing `<section>`
  block, lines 424–550) — each card's JSX is copied as-is (title/subtitle/badge-fn/details
  logic unchanged), only the data source changes from `useLoaderData` money-radar shape to
  the merged loader's `radar` sub-object (see FR-2).
- Page `<PageHeader>` title/subtitle updated to reflect the merged scope — suggested:
  title `"Động Lực & Dòng Tiền"`, subtitle `"Chỉ số động lực thị trường và radar dòng tiền
  hợp nhất"`. Final copy is a BA-detail decision pm may adjust with PO sign-off if the
  wording needs polish — not a blocker.
- Footnote paragraph: keep BOTH existing footnotes (momentum's + money-radar's), stacked,
  or merge into one paragraph naming all 8 tools — dev-frontend's call, non-blocking.
- Nav label (FR-1 continued): relabel `ANALYST_NAV[26]` from `"Động Lực P1"` to a label that
  signals both families — suggested: `"Động Lực & Dòng Tiền"` (mirrors the page title,
  keeps plain-Vietnamese, keeps nav-bar width reasonable). pm/dev-frontend may pick
  alternate copy; whatever is chosen MUST be applied consistently to (a) `TopNav.tsx`
  `ANALYST_NAV[26].label`, (b) the route-existence doc-comment at `TopNav.tsx:66`, and (c)
  every hardcoded `"Động Lực P1"` string assertion in
  `ind-p1-momentum-nav.test.tsx` (6 occurrences) and the DOM-render assertion (Suite 5).

### FR-2 — Merged loader + DTO/logic relocation (application + domain layer)

`dashboard.momentum.tsx` gains a second data path, colocated in the SAME file (mirrors the
codebase's existing precedent: `dashboard.momentum.tsx` already imports `formatZScore` from
sibling route `dashboard.indicator-gauges.tsx` — cross-route-file exports are an established
pattern here, and both money-radar and momentum already self-colocate DTO+parser+formatter+
fetcher+component in one file).

- **FR-2.1** — Port money-radar's exported symbols into `dashboard.momentum.tsx` VERBATIM
  (unchanged bodies): `DivergenceFlag`, `DivergenceSection`, `MoneyRadarComponents`,
  `EMPTY_COMPONENTS`, `MoneyRadarCompositeDto`, `FALLBACK_DIVERGENCE`,
  `parseMoneyRadarCompositeDto`, `parseDivergence`, `formatScalar2`,
  `formatCompositeScoreBadge`, `formatForeignAccumBadge`, `formatRelVolBadge`,
  `formatDivergenceBadge`, `formatDivergenceScalar`, `fetchMoneyRadarComposite`. These stay
  a **fully distinct type/function family** from the existing momentum
  `RocSection`/`RelativeStrengthSection`/`Proximity52wSection`/`ForeignAccumSection`/
  `MomentumIndicatorsDto`/`parseMomentumIndicatorsDto`/`formatRSComposite`/
  `fetchMomentumIndicators` — **no merged/unified DTO type, no shared parser function**. This
  IS the do-not-homogenize contract at the code level.
- **FR-2.2** — New combined `loader()`:
  ```ts
  const [momentumResult, radarResult] = await Promise.allSettled([
    fetchMomentumIndicators(origin),
    fetchMoneyRadarComposite(origin),
  ]);
  const momentum = momentumResult.status === "fulfilled" ? momentumResult.value : <all-null momentum LoaderData with error message>;
  const radar = radarResult.status === "fulfilled" ? radarResult.value : <all-null radar LoaderData with error message>;
  return json({ momentum, radar });
  ```
  Because `fetchMomentumIndicators`/`fetchMoneyRadarComposite` already swallow all errors
  internally (via `safeFetch`) and always resolve, the `Promise.allSettled` rejected branch
  is a secondary/defensive guard, not the primary error path — implement it anyway per PO's
  explicit `loader` instruction (defense-in-depth; also protects against any FUTURE change
  to `fetchMomentumIndicators`/`fetchMoneyRadarComposite` that might introduce a throw).
- **FR-2.3** — `dashboard.money-radar.tsx` shrinks to a redirect-only route:
  ```ts
  export async function loader() {
    return redirect("/dashboard/momentum", 302);
  }
  ```
  All type/parser/formatter/fetcher exports and the default component are REMOVED from this
  file (they now live solely in `dashboard.momentum.tsx`) — the file's only remaining job is
  the redirect. `meta` export may be dropped (redirect never renders the page shell) or kept
  harmlessly.
- **FR-2.4** — `money-radar-cards.test.ts` import statement changes from
  `~/routes/dashboard.money-radar` to `~/routes/dashboard.momentum` — no assertion content
  changes (same fixtures, same function names, same expected outputs — the functions moved,
  their behavior did not). This directly satisfies AC7's "assertions preserved/migrated onto
  the merged momentum page."
- **PM-RATIFY-1** (non-blocking implementation choice, no architect step in this chain so pm
  ratifies): the alternative to FR-2.1–2.4 is extracting the money-radar DTO/parser/
  formatter/fetcher family into a new shared module (e.g.
  `apps/frontend/app/lib/moneyRadar/dto.ts`) instead of colocating in
  `dashboard.momentum.tsx`, with `money-radar-cards.test.ts` importing from there instead.
  BA recommends AGAINST this for the merge sprint — it's a larger diff, breaks from the
  codebase's established route-file colocation precedent (both source pages already do this;
  no existing `lib/` DTO module exists for these page-level features), and is not required by
  any AC. pm may override if it prefers the cleaner module boundary; either satisfies the
  ACs equally.

### FR-3 — Freshness + revalidation (NFR, interface layer)

- `useFreshnessRevalidator("daily")` — call ONCE per page (not twice) since both families
  share the same `daily` SLA tier and the hook only sets up a client interval when
  `clientRefreshMs` is non-null (it's `null` for `daily`, so today it's a no-op either way,
  but calling the hook twice would be a lint/architecture smell — one call is correct).
- Page-level `<PageHeader>` `FreshnessBadge` — decide which `generated_at` it reflects.
  Recommendation: show the OLDER (less fresh) of `momentum.generated_at` /
  `radar.generated_at`, since the page-level badge should represent "how stale is the
  stalest thing on this page" — do not silently prefer one feed. Non-blocking detail for
  dev-frontend; either scheme is acceptable as long as it is not hardcoded to always show
  ONE feed's timestamp while ignoring the other's staleness.
- Per-card `FreshnessBadge` (inside each `GaugeCard`, via `dataAsof` prop) — UNCHANGED
  per-section behavior for both families (momentum cards use `computed_as_of`; radar cards
  use the composite's top-level `generated_at`, exactly as today).

### FR-4 — Redirect + nav wiring (interface layer)

- `dashboard.money-radar.tsx` loader returns a 302 to `/dashboard/momentum` for ALL request
  methods it currently supports (GET only — this route never had a non-GET handler).
- `api.money-radar.tsx` is UNCHANGED — it is a resource route (JSON proxy), not a page route;
  it has no redirect semantics and continues to serve `/api/money-radar` 200 as today,
  feeding the merged loader's `fetchMoneyRadarComposite` call.
- `TopNav.tsx`: relabel `ANALYST_NAV[26]` in place (same array position, same `to`, new
  `label`). Do NOT insert a new array entry. Do NOT touch the `SSOT count comment` numbers
  (`27`/`34`) since array length is unchanged. DO update the doc-comment line at `TopNav.tsx
  :66` (route-existence table) to reflect the new label text and note it now also carries
  the money-radar content.

### FR-5 — Freshness-transparency SSOT backfill (infrastructure, side-effect of merge)

`docs/data/frontend-data-coverage-map.json` currently has ZERO rows for money-radar (gap
predates this task — opened when Money Radar P0 shipped 2026-07-01, after the last
`frontend-data-coverage-map.json` reconciliation pass on 2026-06-27, per
`BA-FRONTEND-FRESHNESS-TRANSPARENCY` notebook entry "all 35 live page routes match
coverage-map rows" as of that date). While merging, append 4 new rows under
`page: "/dashboard/momentum"` (mirroring the existing 4 momentum rows' shape) for:
`score` (composite), `components.foreign_accum_z_market`, `components.rel_vol_z_20`,
`divergence.flag` — each with `endpoint: "/api/money-radar → <field>"`,
`sla: "daily"`, `asof: "generated_at"`, `l3b_status: "WIRED"`. This is scope-adjacent
(closes a pre-existing gap this merge exposes) rather than a new requirement the merge
itself creates — pm may size it as part of this task or split it out; BA recommends folding
it in since it is a ~15-line JSON addition touching the exact page this task already edits.

---

## 5. Non-Goals (explicit — carried from the dispatch prompt + brief §10)

- **NO card-contract homogenization.** `MoneyRadarCompositeDto` and
  `MomentumIndicatorsDto` (+ their 4 sub-section types each) stay two distinct,
  non-unified type families. No shared parser, no shared "generic indicator DTO." The
  honest-NULL semantics differ meaningfully: momentum sections are `null` when OHLCV depth
  is insufficient (a temporal/accrual state); radar's `score`/components are `null` when
  `coverage_pct < 0.5` (a coverage-threshold state) and `divergence.flag` has its OWN
  UNKNOWN-not-GREEN semantic (HN-4, brief). Collapsing these into one null-handling code path
  would silently blur two different "why is this null" stories the user needs to trust.
- **NO backend/mcp-server change.** Both `/api/momentum-indicators` and `/api/money-radar`
  already serve 200 with the exact shapes both existing frontend pages already consume
  correctly — verified live by PO before this task was minted. `api.momentum-indicators.tsx`
  and `api.money-radar.tsx` (both pure `proxyUpstream` resource routes, zero domain logic)
  are UNCHANGED.
- **NO deletion of `dashboard.money-radar.tsx`.** It becomes a thin redirect file — deleting
  it would 404 any bookmark/deep-link/external reference to `/dashboard/money-radar`.
- **NO second nav entry.** Exactly one `ANALYST_NAV` entry reaches the merged content.
- **NO reorder/relabel/removal of any OTHER nav entry** — only `ANALYST_NAV[26]` changes.
- **NO change to `GaugeCard.tsx`, `FreshnessBadge.tsx`, `InfoCardExpand.tsx`,
  `useFreshnessRevalidator.ts`.** These are generic, already-shared UI primitives — both
  pages already call them identically today; that reuse is correct and pre-existing, not
  part of this task's homogenization concern (the "distinct card contracts" constraint is
  about the DOMAIN DTOs/formatters, not the presentational shell — see clarifying note below).

**Clarifying note for pm (avoids a likely misread):** "money-radar cards and
momentum-indicator cards keep their own distinct contracts/props" refers to the DATA layer
(FR-2.1's two separate type/parser/formatter families), NOT the UI-component layer. Both
card families already render through the SAME shared `<GaugeCard {...props}>` component
today (that has been true since money-radar shipped, mirroring momentum's page on purpose)
— this is legitimate, pre-existing, correct reuse of a generic presentational primitive, and
continuing it is not a violation of the do-not-homogenize constraint.

---

## 6. Edge Cases

- **One feed 200, one feed 502/error:** `Promise.allSettled` + each `fetch*` function's
  internal `safeFetch` error handling means the failing feed's section renders its own
  all-null/error state (existing error-banner pattern in each source file, lines
  `momentum.tsx:342-349` / `money-radar.tsx:414-421`) while the other section renders real
  data. Both banners may show simultaneously if both fail — acceptable, each is scoped to
  its own section (do not merge into one combined error banner that hides which feed
  failed).
- **Direct navigation to `/dashboard/money-radar`:** must 302 to `/dashboard/momentum`
  losing no user-visible functionality (deep link intent honored, content is the same page
  now unified).
- **`divergence.flag === "UNKNOWN"`:** renders as the radar section's honest-null state
  (gray badge, "Chưa có dữ liệu") — this is a THIRD null flavor distinct from both momentum's
  section-null and radar's score-null; FR-2.1 preserves `formatDivergenceBadge`'s existing
  UNKNOWN handling verbatim, so this edge case is already solved by the ported code, not new
  logic.
- **`is_estimate: true` on the radar composite:** the existing "Cảnh báo: Có thành phần ước
  tính" detail row (money-radar.tsx:374-376) must survive the port unchanged — it is a
  distinct warning from momentum's `low_sample_warning` detail row; do not conflate the two
  warning types into one shared "data quality" component.
- **Nav test breakage is EXPECTED and IN-SCOPE**, not a regression to work around:
  `ind-p1-momentum-nav.test.tsx`'s 6 hardcoded `"Động Lực P1"` assertions + Suite 4's
  position/DOM assertions must be updated to the new label in the SAME commit as the
  `TopNav.tsx` relabel — pm should sequence this as one atomic dev-frontend work unit, not
  two, to avoid a red-test window.
- **`FE-HEADER-SSOT-top-nav.test.tsx` count assertions:** confirmed OUT of this task's blast
  radius (array length unchanged) — pm does not need to touch this file. If dev-frontend
  discovers a label-text duplication assertion in that file too (unlikely — it wasn't found
  in the label-string grep), treat it the same as `ind-p1-momentum-nav.test.tsx`.

---

## 7. DDD Layer Mapping

| Requirement | DDD layer | Notes |
|---|---|---|
| FR-1 (page sections, nav label) | interface | Remix route component + `TopNav.tsx` presentational |
| FR-2.1 (ported DTOs/types) | domain (page-scoped) | Pure types, no I/O — matches existing colocation pattern in both source files |
| FR-2.2 (merged loader, `Promise.allSettled`) | application | Orchestrates two independent fetch calls, no business rules beyond error isolation |
| FR-2.3 (redirect loader) | interface | Remix `loader()` — pure routing concern |
| FR-2.4 (test import path) | interface (test) | No production logic change |
| FR-3 (freshness/revalidation) | interface | Presentational hook + badge wiring |
| FR-4 (redirect + nav wiring) | interface | Route + nav SSOT |
| FR-5 (coverage-map backfill) | infrastructure | JSON SSOT data file, not code — read by no runtime path other than doc tooling/audits |

No `apps/mcp-server` (application/domain/infrastructure service layers) or Go
`apps/technical-analysis` change in this task — 100% `apps/frontend/` interface-layer work
plus one docs/data JSON backfill, consistent with the sprint's "PURE FRONTEND, single zone"
scope_in.

---

## 8. Blockers (questions only PO can answer)

**ZERO PO blockers.** All product decisions needed to start implementation are already
locked in the task-board row's `product_decisions`/`design_constraints` (§3 above) or are
resolved by direct code inspection (§2). The two open items below are PM-RATIFY, not
PO-blocking — pm can decide either way without looping back to PO:

- **PM-RATIFY-1** (§FR-2, non-blocking): colocate money-radar logic inside
  `dashboard.momentum.tsx` (BA recommendation) vs. extract to a new `app/lib/moneyRadar/`
  module. Either satisfies all ACs.
- **PM-RATIFY-2** (§FR-1, non-blocking): exact Vietnamese copy for the merged page title/
  nav label — BA suggests `"Động Lực & Dòng Tiền"`; pm/dev-frontend may substitute
  equivalent plain-Vietnamese copy without a PO round-trip (this is presentational-copy
  detail, not a scope decision).

---

## 9. Acceptance Criteria (for pm decomposition)

Carried forward VERBATIM from the task-board row (AC1–AC7, PO-authored) plus 3 new BA-added
ACs (AC8–AC10) closing gaps found during code survey that the PO-authored ACs did not name
explicitly:

1. **AC1:** `/dashboard/momentum` serves ONE page with all 8 cards — 4 momentum
   (honest-NULL, OHLCV-depth-gated) + 4 money-radar (non-null, depth-independent) — each in
   its labelled section with its own `FreshnessBadge` + source-link dropdown.
2. **AC2:** The loader fetches `/api/momentum-indicators` AND `/api/money-radar` via
   `Promise.allSettled`; a forced failure of ONE feed leaves the other section rendering
   correctly (per-section isolation, page always HTTP 200).
3. **AC3:** Do-NOT-homogenize preserved — radar cards render non-null on live data; momentum
   cards render honest-NULL when accruing/blocked ("Chưa có dữ liệu" + gray badge +
   `null_reason`); NO card contract is flattened to the other (verified: two distinct DTO/
   parser/formatter families remain in the code, per FR-2.1).
4. **AC4:** `/dashboard/money-radar` 302-redirects to `/dashboard/momentum` (deep links
   preserved, no 404, no dead route); `api.money-radar.tsx` proxy still serves 200.
5. **AC5:** `TopNav.tsx` has ONE unified enabled nav entry reaching the merged surface; NO
   separate `/dashboard/money-radar` nav entry is added; SSOT count comments + guard test
   updated in lockstep and GREEN (note: counts stay 27/34 — no length change, only label
   text changes); no unrelated nav entry reordered/relabelled/removed.
6. **AC6:** `FIX-FE-HEADER-NAV-MONEY-RADAR` is confirmed superseded (folded here) — not
   independently shipped as a second nav entry (already true in orch-state as of this spec's
   authoring — pm just needs to not resurrect it).
7. **AC7:** `tsc` + full frontend test suite GREEN; `money-radar-cards.test.ts` assertions
   preserved/migrated onto the merged momentum page (concretely: import path updated to
   `~/routes/dashboard.momentum` per FR-2.4, all existing assertions unchanged); no momentum
   regression.
8. **AC8 (BA-added):** `ind-p1-momentum-nav.test.tsx`'s 6 hardcoded `"Động Lực P1"` label
   assertions + the DOM-render assertion are updated to the new relabeled nav copy in the
   SAME commit as the `TopNav.tsx` change (no red-test window).
9. **AC9 (BA-added):** `docs/data/frontend-data-coverage-map.json` gains 4 new rows for the
   money-radar scalars now living on `/dashboard/momentum` (per FR-5) — closes the
   pre-existing zero-coverage gap for money-radar data surfaces.
10. **AC10 (BA-added):** the two DTO/parser/formatter families (momentum's 4 sections vs.
    radar's composite+components+divergence) remain textually distinct and independently
    importable in the final code — i.e. a grep for `MoneyRadarCompositeDto` and
    `MomentumIndicatorsDto` in the final `dashboard.momentum.tsx` both return non-empty,
    non-unified type definitions (mechanical proof of AC3's "no homogenization" for qa's
    RAW-verify step).

---

## 10. Risks

- **Test-file churn is the main risk surface**, not the page logic — 2 test files
  (`ind-p1-momentum-nav.test.tsx`, `money-radar-cards.test.ts`) need coordinated edits in
  the SAME commit as the source changes they test, or CI goes red between commits (dev-team
  standing gate: `feedback_red_prepush_strands_fleet` — pnpm check FIRST).
  - **Escalation trigger**: no branches are used in this codebase (main-only, per CLAUDE.md)
    — dev-frontend must land page + nav + both test-file updates + coverage-map backfill as
    one commit (or a tightly sequenced series that never leaves a red main), not staged
    separately.
- **`generated_at` badge semantics for the merged page header** (FR-3) is an under-specified
  detail in the PO decision — BA recommends "older of the two" but this is not enforced by
  any AC; if dev-frontend picks a different (reasonable) scheme, it should not block qa.
- **Coverage-map backfill (FR-5/AC9) is scope-adjacent**, not explicitly named in the PO's
  original 7 ACs — flagged as BA-added AC9 rather than a blocker; if pm decides to defer it
  to a follow-up task, that is an acceptable, low-risk descope (does not affect AC1-AC8
  functional correctness), but BA recommends folding it in given it's a ~15-line JSON diff
  on a file this task already has open context for.
- **No architect step in this chain** (SPRINT-S ba→pm→dev-frontend→qa) — FR-2's file-
  placement recommendation (PM-RATIFY-1) is BA's best judgment given codebase precedent, not
  an architect-ratified design. Low risk: either placement choice is mechanically simple and
  reversible: choosing the non-recommended path does not risk defect classes, only affects
  future DRY-ness.
- **`FreshnessBadge`/`useFreshnessRevalidator` are unaffected** by the merge (both already
  handle the `daily` tier identically in both source pages) — no risk of a stale-badge or
  double-poll regression as long as the hook is called exactly once (FR-3).

---

## 11. Summary for pm

Single-zone (`apps/frontend/`), single dev-frontend work unit is sufficient — this is a
SPRINT-S with no cross-service dependency and no architect step. Suggested WU decomposition
(pm's call, BA suggestion only):

- **WU-1 (dev-frontend):** FR-1 + FR-2 + FR-3 + FR-4 — page merge, loader merge, redirect,
  nav relabel — landed as one atomic commit with its 2 test-file updates (AC1-AC8).
- **WU-2 (dev-frontend or folded into WU-1):** FR-5 — coverage-map backfill (AC9).
- **qa gate:** RAW-live verify per the task-board row's `verification_gate` — curl
  `/dashboard/momentum` (both card families render), curl `/dashboard/money-radar` (302),
  grep rendered nav (one anchor, zero `/dashboard/money-radar` entry), run
  `FE-HEADER-SSOT-top-nav.test.tsx` + full frontend suite + `tsc`.
