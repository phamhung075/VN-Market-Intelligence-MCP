# UC-SDF-P6 — BA Spec: Collapse the scheduler-count triplication

**Row:** UC-SDF-P6 (P1, `cross-service/`) | **Minted:** 2026-07-13 by po | **BA pass:** 2026-08-23T19:56Z dispatch, session 007e33e4-b453-4bb3-8ab1-ef31495906a3
**Verdict:** RESCOPE (confirms row's own `verdict:"RESCOPE"`) + **SPLIT recommended** (see Blocker Q3)

---

## 0. Router pre-dispatch measurement — re-verified live, all 3 findings confirmed

1. **`docs/data/cron-registry.json` already exists** (since 2026-07-15, 2 days after this row was
   minted) and its own `_ssot` key already reads: *"docs/data/system-map.json — canonical cron
   list. This file kept for backward-compat only."* Confirmed via direct read — the "generate
   cron-registry.json" half of the title is stale; the file is not merely present, it has been
   deliberately self-demoted.
2. **Internal self-contradiction confirmed**: `schedulerFileCount` field = 69, `jobs[]` array
   length = 70 (`jq '.jobs | length'` = 70). **Root cause found** (new, not in the router's
   note): `apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts:301` hardcodes
   `expect(json.schedulerFileCount).toBe(69)`, frozen since the 2026-07-15
   `ragFtsRebuildCronJob` bump (see comment block lines 277-301 documenting each prior bump
   68→69, 67→68, etc. by hand). Someone since added a `jobs[]` entry (69→70) without also
   bumping `schedulerFileCount`, and the hardcoded test literal absorbed the drift silently
   instead of catching it structurally.
3. **88 vs 70 confirmed as a genuine DEFINITION divergence, live re-derived (not just quoted from the note):**
   - `project-stats.json` `cronJobCount:88` = **source call-sites**: 61 table-driven `name:`
     entries inside `buildJobTable()` (`schedulerJobTable.ts:129-1066`, verified by direct
     count: `cron: CRONS.` occurrences = 62, `name: '...'` entries = 61) + 22 `scheduleCron(`
     call sites inside `registerBespokeJobs()` (`schedulerJobTable.ts:1088-1366`, verified) +
     5 `scheduleCron(` call sites in `summaryJobs.ts` (verified) = 88. This is computed live
     by `scripts/gen-project-stats.ts:97-171`'s `countCronJobsFromSource()`, which already
     ships a `MIN_PLAUSIBLE_CRON_COUNT=50` fail-loud floor and a computed-vs-written mismatch
     guard (lines 168-171, 294-298) — commit `c9e7ed717`.
   - `cron-registry.json`/`system-map.json` (both 70) count **distinct named jobs** — a
     different unit. These are NOT drop-in interchangeable with the 88 call-site count.

## 1. NEW finding not in the router's brief: cron-registry.json and system-map.json's 70-entry
   lists are the SAME LENGTH BUT NOT THE SAME CONTENT — already diverged today

`diff <(jq -r '.jobs[].name' cron-registry.json | sort) <(jq -r '...crons[].name' system-map.json | sort)`:
- Only in `cron-registry.json`: `accuracyDigestJob`, `bctcEvalRecomputeJob`,
  `signalOutcomeResolution`, and a **literal `null` entry** (a jobs[] element with no `name`
  field — a data-quality defect in its own right).
- Only in `system-map.json`: `macroIndicatorRefreshJob`, `systemAuditTier1`, `systemAuditTier2`,
  `systemAuditTier3`.
- `weeklyPortfolioReport+weeklySummary` (one combined string, cron-registry.json) vs
  `weeklyPortfolioReport` (split, system-map.json).

Any plan that assumes "repoint consumers from cron-registry.json to system-map.json" is a pure
rename is **wrong** — the two lists have independently drifted in *content*, not just count, and
sharing length=70 today is coincidence, not evidence of parity.

## 2. NEW finding: consumer footprint contradicts the file's own `_ssot` self-demotion

Real (non-doc) programmatic consumers found via full-repo grep, narrowed to code/tests:
- `apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts` — hardcoded
  `schedulerFileCount === 69` (the drift root cause, §0.2 above).
- `apps/mcp-server/src/__tests__/1298b-imf-infra.test.ts` — asserts entry existence
  (`id==='imf_indicator_poller' || name==='imfIndicatorPoller'`).
- `apps/mcp-server/src/__tests__/239c-macro-refresh-integration.test.ts` — asserts
  `schedulerFileCount >= 38` (loose, structural) + entry existence for `macroIndicatorRefreshJob`.
- `docs/standards/cron-jobs.md:7` — "Live data → `docs/data/cron-registry.json`" (the standards
  doc's own SSOT pointer).
- `docs/agents/system-auditor/flow/main.md:814` — instructs the auditor to "Verify JSON counts:
  ... `cron-registry.json` vs jobs ..." (doc-hygiene check).

Zero test files or runtime code were found reading `system-map.json`'s
`.project.microservices[].crons[]` array (grep for `.crons[` / `microservices.*crons` across
`apps/mcp-server/src` and `scripts/` returned no hits). The file the row's own note calls
"canonical" has **zero programmatic enforcement**; the file it demotes has **three**. This
contradiction is a genuine PO-level ruling, not something BA can resolve unilaterally
(Blocker Q1).

## 3. NEW finding: JANITOR-028's "59" is historical color, not a live 4th source

`docs/data/code-janitor-known-findings.json`'s JANITOR-028 record quotes "actual ...
cronJobCount=59 per project-stats.json" — but `discovered_at: 2026-05-10`, predating the
2026-07-22 `project-stats.json` reconciliation (commit `c9e7ed717`) that fixed the generator
from a dead `cron.schedule(` grep (post-refactor collapse to ~2) to the current 88-call-site
method. JANITOR-028 itself is about a *different* file (`.claude/agents/dev-mcp-server.md`'s
hardcoded agent-description prose, status `proposed`, blocked on agent-father approval) — not a
competing cron-count SSOT candidate. Do not treat 59 as live data.

## 4. NEW finding: `gen-project-stats.ts` already IS the "fix gen-project-stats stale probe"
   line item from the row's own rescope note — already shipped, nothing left to do

The row's `note` field lists "fix gen-project-stats stale probe" as a deliverable. Live-verified:
this already shipped (commit `c9e7ed717`, `MIN_PLAUSIBLE_CRON_COUNT` floor + mismatch guard,
§0.3 above) — it predates this BA dispatch by weeks. **Drop this line item from scope.**

## 5. Precedent confirmed: `scripts/gen-tool-registry.ts` is a real, working template

Regex source-extraction (`server.tool("name"` / `server.registerTool("name"`) + atomic
temp-file-then-rename write + fail-loud + documented expected-count header
(`docs/data/tool-registry.json`, `_maintained_by: "generator (do not hand-edit)"`). A
`gen-cron-registry.ts` should reuse this write/fail-loud pattern AND can literally
adapt `countCronJobsFromSource()` already proven in `scripts/gen-project-stats.ts:97-171`
rather than re-derive extraction regexes from scratch.

## 6. Live data-quality note (found, not previously tracked)

`cronConfig.ts`'s `CRONS` object currently has **89** named keys (live recount) — one more than
`project-stats.json`'s own 2026-07-22 note claims ("cronConfig.ts named CRON keys=88, matches
by coincidence"). This shows even that reconciliation note is now stale-by-one against current
source — reinforcing that ANY count baked into prose (not re-derived by a generator on every
run) silently rots. `gen-project-stats.ts` already re-derives live every run; a `gen-cron-registry.ts` must do the same, never trust a cached note.

---

## Requirements

### FR-1 — Build `scripts/gen-cron-registry.ts`
DDD layer: **infrastructure** (build-time tooling, outside the runtime service boundary).
Source-derive `cron-registry.json#jobs` + `#schedulerFileCount` from `schedulerJobTable.ts`
(`buildJobTable()` table-driven entries + `registerBespokeJobs()` scheduleCron sites) +
`summaryJobs.ts`, reusing the extraction logic proven in `gen-project-stats.ts:97-171` and the
atomic-write/fail-loud/dry-run pattern proven in `gen-tool-registry.ts`.
- AC: `--dry-run` output count is internally consistent (`schedulerFileCount === jobs.length`,
  always — closes §0.2's self-contradiction structurally, not by hand-bump).
- AC: atomic write (temp file → validate JSON → rename), fail loud on missing source files.
- Edge case: not every bespoke `scheduleCron(` call site is necessarily 1 distinct "job" (e.g.
  the scheduler-watchdog self-heal manifest builds local state before registering) — generator
  must pick and document a 1-call-site = 1-entry rule, or diverge with a documented reason.
- **Blocked on Q2** (counting-unit ruling) before this can be built correctly.

### FR-2 — Fix `1190-pipeline-watchdog.test.ts`'s hardcoded literal (the confirmed root cause)
DDD layer: infrastructure (test suite).
Replace `expect(json.schedulerFileCount).toBe(69)` (line 301) with a structural assertion
(`schedulerFileCount === jobs.length`, and/or `=== ` the generator's derived count) — per the
row's own rescope note "Update pipeline-watchdog test to structural assert." This is the exact
mechanism that let §0.2's drift happen unnoticed.

### FR-3 — Verify `239c-macro-refresh-integration.test.ts` AC-4 survives regeneration
DDD layer: infrastructure (test suite). Already loose/structural (`>= 38`) — low risk, verify
only after FR-1 lands.

### FR-4 — Verify `1298b-imf-infra.test.ts` entry-existence assertion survives regeneration
DDD layer: infrastructure (test suite). Generator must preserve both `id` and `name` key
conventions this test relies on (`j["id"] === ... || j["name"] === ...`).

### FR-5 — Reconcile `system-map.json`'s `crons[]` to the code-derived set
DDD layer: infrastructure. SURGICAL patch only (per the row's own note — never full-doc
overwrite of a shared structural file). Must resolve the 6 concrete name-level divergences
found live in §1 (3 cron-registry-only names + 1 null entry, 4 system-map-only names, 1
combined-vs-split string). **Direction depends on Q1.**

### FR-6 — Canonical-direction decision + documentation update
DDD layer: N/A (governance/documentation decision, not code). See Blocker Q1. Whichever way PO
rules, `docs/standards/cron-jobs.md:7`'s "Live data →" pointer must be updated to match, and
(if system-map.json is confirmed canonical) 3 test files + the generator must be repointed at
it instead of cron-registry.json.

### FR-7 — `docs/agents/system-auditor/flow/main.md:814` doc-hygiene instruction update
DDD layer: infrastructure (agent doc). **BLOCKED — `docs/agents/**` is agent-father's exclusive
zone.** No dev-team agent (BA, architect, developer) can write there. Needs an agent-father
sub-task or PO-mediated cross-zone routing once FR-6 is ruled.

### NOT part of this row's scope (recommend split — see Q3)
The row's own `po_scope_expansion_20260722` field adds a structurally different requirement: a
session-scoped `CronCreate` liveness plane (5 concurrent CLI sessions, zero on-disk persistence
today), framed as "Part 1 of 3" alongside `ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG` (Part 2,
still BACKLOG) and `ARCH-CRON-THREE-TIME-BASES-UNIFY` (Part 3, still BACKLOG, no note). This is
an open design problem (a watchdog for an unpersisted cross-session registration plane), not a
mechanical "regenerate a JSON from TypeScript source" fix — bundling it into this M-sized row
risks a developer reading the title and shipping only FR-1..FR-7 while silently dropping Part 1.

---

## Blockers (PO-only)

- **Q1 — Canonical direction.** Keep `cron-registry.json` as the generated SSOT (it has 3 live
  test consumers + 1 standards-doc pointer today) and reverse its own `_ssot` self-declaration,
  OR retire it and repoint those 3 tests + the standards doc at `system-map.json` (which has 0
  test consumers today and its own content-drift to fix first, per §1)? The 2026-07-12
  architecture brief (`docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#state-data-files-P6`)
  explicitly offered both as valid RESCOPE outcomes and never adjudicated between them.
- **Q2 — Counting-unit ruling.** Does the generated registry count SOURCE CALL-SITES (88,
  `project-stats.json`'s proven, live-reproduced definition) or DISTINCT JOB NAMES (~70, the
  cron-registry.json/system-map.json convention — which, per §1, already diverges by more than
  count)? These are genuinely different units (a table-driven entry plus a dedicated bespoke
  retry site is 2 call-sites but arguably 1 "job") and cannot be reconciled into one number
  without a ruling. FR-1 cannot be built correctly without this.
- **Q3 — Split recommendation.** Should the `po_scope_expansion_20260722` session-CronCreate
  liveness-plane content be carved into its own row (sibling to the other two BACKLOG parts of
  the same 3-part ruling) rather than staying bundled inside this M-sized mcp-server-scheduler-
  file fix? BA recommends YES (see "NOT part of this row's scope" above).
- **Q4 — FR-7 execution owner.** `docs/agents/system-auditor/flow/main.md`'s stale doc-hygiene
  instruction sits in agent-father's exclusive zone. Who executes the fix — an agent-father
  sub-task, or does PO accept leaving it stale pending agent-father's own-initiative pass?

## Edge Cases

- The literal `null` entry already inside `cron-registry.json`'s live `jobs[]` array (a
  malformed/nameless element) must be dropped or repaired by regeneration — independent
  data-quality debt, not caused by this row.
- `cronConfig.ts`'s 89-vs-88 live-recount drift (§6) shows any hand-typed count note rots;
  the generator must never trust a cached prose number, always re-derive from source.
- Found en route, unrelated to cron scope (FYI only, not actioned here): a stale, dirty
  worktree at `.claude/worktrees/agent-ae9ed2cd6f04b3686/` (last touched 2026-08-12, dirty
  changes to BCTC-scalar-aggregator files — unrelated to cron-registry.json content, surfaced
  only as a grep false-positive on an old mirrored copy of the file). Likely the same known
  "orphaned agent worktree hides uncommitted work" bug class as the 2026-08-22 cleanup-pass
  finding, but a distinct worktree hash — flagging for PO awareness, not decomposed here.

## Recommendation

RESCOPE UC-SDF-P6 to FR-1..FR-7 (the mcp-server scheduler-file triplication — the row's
original architecture-brief scope). Route Q1/Q2/Q4 to PO before architect starts (Q1/Q2 change
FR-1/FR-5/FR-6's actual content, not just their priority). Recommend PO split
`po_scope_expansion_20260722`'s session-CronCreate content into its own row rather than
force-fitting Part 1 of a 3-part ruling into an M-sized mechanical-fix row.
