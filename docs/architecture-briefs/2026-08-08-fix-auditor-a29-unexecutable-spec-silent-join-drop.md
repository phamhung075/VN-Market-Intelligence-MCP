# FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP — mechanism, contracts, landed fix (architect, 2026-08-08)

## 1. Re-verification of the row's own 4 claims (all confirmed live, 2026-08-08)

1. `.microservices[0].crons` on `docs/data/system-map.json` → `null`. `.project.microservices[0].crons`
   → 70 entries. Confirmed via live `jq`.
2. Schedule grammar: re-classified all 70 `schedule` strings against a strict 5-field cron regex
   (`^([0-9*/,-]+ ){4}[0-9*/,-]+$`) → **32 CRON5 / 38 PROSE**, exact match to the row's figures.
3. Name join: `get_cron_health`'s backing table (`cron_job_runs.job_name`, live query, all-time
   distinct) → **96** raw runtime names (close to the row's 87 — the job set has grown since
   2026-07-29T02:14Z; 3 of the 96 are process-lifecycle markers, not crons — see §4). A naive
   normalize-strip-suffix join (lowercase, fold `:variant`, strip trailing `Job`, strip punctuation)
   resolves **59/65** periodic system-map crons automatically; **6 more** resolve only via an explicit
   alias (§3); **1** (`dailySummary`) has no runtime counterpart at all because it has no `CRONS` key —
   a dead duplicate entry in system-map itself, not a join problem.
4. `systemAuditTier1/2/3` — confirmed present in `.project.microservices[0].crons` with clean CRON5
   schedules (`*/30 * * * *`, `0 */4 * * *`, `0 2 * * *`) and confirmed absent from `get_cron_health`
   (Claude-Code `CronCreate` jobs, no `cron_job_runs` row ever written for them — no code path exists
   that could write one). PO's ruling that this is a **data-source gap, not an inventory gap** is
   correct and independently reconfirmed: `.claude/commands/crons/cron-system-auditor.md` really does
   register 3 crons matching these three entries.

## 2. The bigger finding: a parallel, already-shipped subsystem solves 90% of this, badly-joined in 2 places

Grepping for `cron-parser` (already a dependency, `apps/mcp-server/package.json`) surfaced
`apps/mcp-server/src/application/cron/cronStatusCompute.ts` +
`.../interface/mcp/routes/cronStatusHandler.ts` + `.../infrastructure/cron/layerBCronRegistry.ts`
(**DASH-CRON-RECHECK-TABLE / TASK-DASH-CRON-1**, live `GET /api/cron-status` on mcp-server:3000,
confirmed reachable — `curl -s http://localhost:3000/api/cron-status`, 2026-08-08T00:31Z). This is a
**second, independent, tested implementation of exactly A-29's own predicate**, and it is materially
better than anything A-29 could hand-roll:

- **Grammar is a non-problem in the real source.** `cronConfig.ts`'s `CRONS` map (the code's own
  schedule SSOT) stores every job as a real 5-field cron expression — **90 keys, all parseable**. The
  38 "prose" strings only exist in `system-map.json`'s hand-typed `schedule` documentation field; they
  were never the machine-readable source. A-29 does not need a prose grammar/parser at all if it reads
  cadence from `CRONS` (via this endpoint) instead of from system-map's `schedule` text.
- **Cadence/expected-fire is already solved uniformly** (`deriveCadenceMs`, `computeExpectedFires`):
  `cron-parser`'s `CronExpressionParser`, MIN-of-6-samples-forward for cadence, `.prev()`/`.next()` for
  expected-last/next-fire. One algorithm, no special-casing — confirmed live for `bctcBatchSweep`
  (quarterly, `0 9 25 1,4,7,10 *`): `expected_last_fire=2026-07-25T09:00Z`, `last_fire=2026-07-25
  09:00:02`, `status=ON_TIME`. **The current A-29 spec's hand-written `bctcBatchSweep` 72h special case
  is subsumed by this generic algorithm and is retired, not re-implemented.**
- **The name join is a documented 3-tier hybrid** (`resolveJobNameDb` — CN-1): (1) a static 25-pair
  reverse-map for known-divergent names, (2) a normalize-and-strip-`Job` match against a live
  `cron_job_runs` DISTINCT scan, (3) an **honest fallback to the CRONS key itself** when neither
  resolves — which intentionally renders that row `NEVER_FIRED` rather than crashing or silently
  vanishing. This is architecturally the right shape (fail loud, not fail silent) — see §3 for its own
  residual bug.
- **Layer B already exists for the Claude-Code side**: `layerBCronRegistry.ts` parses
  `.claude/commands/crons/*.md` (13 files, 23 cron entries incl. `cron-system-auditor#1/#2/#3` = the
  three `systemAuditTier*` crons) and reports them honestly as `status:"SESSION_SCOPED"`,
  `last_fire:null` — **it does not claim fire evidence it doesn't have**, which is exactly PO's
  "structural gap, not laziness" framing confirmed in code.

**Design decision:** A-29 is rewritten to be a **consumer of `GET /api/cron-status`**, not a
reimplementation of the join/grammar it already gets wrong on its own path. This is the
"always_extend_not_duplicate" constraint applied literally — building a second normalizer next to a
tested one is exactly the class of defect this whole row exists to close.

## 3. The reused subsystem's own residual bug (found live, not in the row's text) — and why A-29 must not trust its verdict blindly

Live DTO, 2026-08-08T00:31Z: `layer_a_count=90`, status breakdown `72 ON_TIME / 8 STALE / 1 MISSED / 9
NEVER_FIRED`. **All 9 `NEVER_FIRED` rows have `job_name_db === name`** — the tier-3 honest-fallback
signature — meaning **100% of the current NEVER_FIRED population is an unresolved join, not confirmed
evidence of a dead cron**:

| system-map / CRONS name | real runtime `job_name` (confirmed via source + live DB) | in `STATIC_JOB_NAME_MAP`? |
|---|---|---|
| `marketOpen` | `marketScanJob:open` (`marketScanJob.ts:64`) | **missing** |
| `marketClose` | `marketScanJob:close` | **missing** |
| `dataAuditDaily` | `dataAuditJob:daily` | **missing** (only `dataAuditWeekly` is mapped) |
| `summaryWeekly` | `summaryJob:weekly` | **missing** (only `summaryDaily` is mapped) |
| `summaryMonthly` | `summaryJob:monthly` | **missing** |
| `summaryQuarterly` | `summaryJob:quarterly` | **missing** |
| `foreignFlowFetch` | `foreignFlowFetcherJob` | **missing** |
| `publicContractsRefresh` (CRONS-only, not in system-map's 70) | `publicContractsJob` | **missing** |
| `summaryYearly` | `summaryJob:yearly` — genuinely zero rows since telemetry began 2026-04-23 (annual cadence, first due date since tracking is 2027-01-02) | not in DB yet — correct `NEVER_FIRED` today, for the wrong traceability reason |

This is the **mirror image** of the row's own failure mode: instead of a silent skip, it is a
**mislabel** (false "dead cron" instead of a false "nothing to report"). Same root defect
(SILENT-DROP-ON-JOIN-MISS), opposite manifestation. It proves the generalizable defect is real and
already recurring in a second, independently-written implementation — strong corroboration for PO's
"likely to recur in other detectors" framing.

**Consequence for A-29's design (this is AC5, applied to the reused endpoint's own output, not just to
A-29's historical `get_cron_health` path):** A-29 must NOT take `/api/cron-status`'s `status` field at
face value. It applies its own discriminator on top: a Layer-A row with
`status=="NEVER_FIRED" && job_name_db==name` is reclassified as **UNRESOLVED-JOIN** (reported by name,
WARN-level, check_id `A-29b`, never counted as a confirmed dead-cron CRITICAL) — everything else
(`ON_TIME`/`STALE`/`MISSED`, and any `NEVER_FIRED` where `job_name_db != name`) is trusted as observed.
This is the fleet lesson `feedback_router_verify_raw_not_badges` applied to a badge this row's own fix
now depends on.

**Not fixed here (flagged, correctly out of scope):** the `STATIC_JOB_NAME_MAP` 8-pair gap in
`apps/mcp-server/src/application/cron/cronStatusCompute.ts` is `apps/mcp-server` application code —
explicitly excluded from this row ("Do not implement changes to `apps/mcp-server`"). Recommended
follow-on for PO to mint → `dev-mcp-server`: add the 8 pairs above to `STATIC_JOB_NAME_MAP` (mechanical,
same shape as the 25 existing pairs, ~8 lines). Until it lands, A-29's own UNRESOLVED-JOIN bucket
carries these 8 by name every cycle — visible, not silently absorbed, so nothing regresses by leaving
it unfixed.

## 4. Two more findings, flagged not fixed (system-map data hygiene, not A-29 predicate logic)

- `system-map.json`'s `dailySummary` entry (`22:30 VN daily`) has **no matching `CRONS` key anywhere**
  in `cronConfig.ts` — it duplicates `summaryDaily` (`30 22 * * *`, same VN time) under a different,
  dead name. Recommend removing it from system-map as a follow-on hygiene item; A-29's new design does
  not depend on system-map's `crons[]` array at all (§5), so this stale entry can no longer cause a
  false UNRESOLVED-JOIN once the switch lands — it simply stops being read.
- `CRONS` (90 keys) has **20 keys with no system-map documentation at all** (e.g.
  `publicContractsRefresh`, `agmPlanRefresh`, `boardDetailsRefresh` family) — system-map's crons array
  has been under-documenting the real schedule inventory for a while. Not blocking (A-29's new source
  is `CRONS` directly, so this under-documentation no longer hides jobs from A-29), but worth a future
  system-map regeneration pass. Not executed here — out of scope, data curation not predicate design.
- `cron_job_runs.job_name` also carries 3 non-cron process-lifecycle markers (`mcpServerStartup`,
  `mcpServerCleanShutdown`) and 1 test artifact (`macroIndicatorRefreshJob_FAILTEST`) sharing the same
  table as real cron telemetry. Cosmetic for this fix (they only show up in the `runtime-only, no
  sysmap entry` bucket, which A-29 does not alert on — see §5 N/M formula), flagged for awareness only.

## 5. AC7 mechanism — the `success_rate >= 80%` bar's real origin, found

`system-map.json`'s own `cronHealthAlert` entry: `"desc": "Alert WORK when any job success_rate < 80%"`.
This is not invented prose — it is the **real, already-shipped, separate** job
`apps/mcp-server/src/scheduler/alerts/cronHealthAlertJob.ts` (Task 1103): daily 00:00 UTC, `MIN_RUNS=3`,
`SUCCESS_RATE_THRESHOLD=0.80`, sends one batched WORK-channel alert, silent on all-green. The agent that
substituted this bar into A-29's cycle almost certainly pattern-matched this sibling job's own
description (both live in the same system-map crons list, `cronHealthAlert` sorts near the top) rather
than reading A-29's own spec text — which is exactly why the string "success_rate"/"80%" is real and
findable, yet appears nowhere in `docs/agents/system-auditor/` (confirmed, re-grepped 2026-08-08, zero
hits). **`cronHealthAlertJob` has the exact same "ratio-over-runs-that-happened" blindness to a
genuinely-stopped cron A-29 exists to catch** — but it is a separate, already-shipped, differently-owned
job (Task 1103) with its own alert channel; fixing its blind spot is not this row's scope. A-29's
corrected spec (§6) points at it explicitly and forbids reproducing its logic.

## 6. Landed fix — `docs/agents/system-auditor/flow/main.md` §Cron Fire Check (A-29)

Edited directly (spec-only fix, per this row's own dispatch convention — architect blueprint IS the doc
edit here, same as the pdf-extractor precedent kept remedy *code* plan-only while landing doc/spec
edits). Full diff logic:

- **Primary source switched**: `get_cron_health` (`cron_job_runs` join hand-rolled against system-map)
  → `GET /api/cron-status` on mcp-server (`curl -sf`, same `localhost:<port>` pattern Tier-1 probe
  already uses; tools-package permission line currently reads "curl -sf (health endpoints)" — this is a
  descriptive note, not an enforced allowlist, but flagged for agent-father/whoever owns
  `docs/agents/tools/package/system-auditor.md` to widen the parenthetical to name `/api/cron-status`
  explicitly for auditability).
- **Inventory**: `layer_a` (server-side, keyed by live `CRONS`, currently 90) + `layer_b` filtered to the
  3 `cron-system-auditor#N` rows (Claude-Code side, in AC6 scope). The other 20 Layer-B rows are
  **named explicitly as out-of-scope** in the spec text (AC6's "explicit out-of-scope statement… plus a
  named detector that does cover them" — named detector: none exists yet for those 20; stated honestly
  as a structural gap, matching Layer-B's own `SESSION_SCOPED` honesty).
- **UNRESOLVED-JOIN discriminator** (§3) applied before trusting any `NEVER_FIRED` row.
- **Claude-Code fire-state** for the 3 in-scope crons: reuses Step 0b.2's *already-computed*
  `T1_LAST_EPOCH`/`HB_EPOCH`(tier2)/`HB_EPOCH`(tier3) gap values from earlier in the **same cycle** — a
  Tier-2 cycle already runs Step 0b (unconditional, "every tier's every cycle, before any tier-specific
  work"), so by the time A-29 executes there is nothing new to compute; A-29 folds those results into
  its own N/M line rather than re-alerting the same signal a second time under a different check_id.
- **FAIL-LOUD N/M line**: every cycle prints `observed N of M` plus the UNRESOLVED-JOIN names plus the
  20-name Claude-Code out-of-scope pointer — never a silent count mismatch.
- **AC7 lockout**: explicit "NEVER compute or reintroduce success_rate here" line + pointer to
  `cronHealthAlertJob` as the one legitimate, separately-labelled, separately-owned success-rate check.
- **`bctcBatchSweep` special case retired** — subsumed by the endpoint's generic cadence algorithm (§2).

## 7. Verification

- Live `curl http://localhost:3000/api/cron-status` reachable, schema matches what the new spec text
  assumes (`layer_a[]`/`layer_b[]`, fields `name`/`cron_expr`/`expected_last_fire`/`last_fire`/`status`/
  `job_name_db`), captured 2026-08-08T00:31:22Z.
- All 4 root-cause claims independently re-derived from live data (§1), not taken on the row's word.
- Join-count re-derivation (AC4): Tier-A algorithmic normalization alone resolves 59/65 periodic
  system-map crons; +6 via the (already-shipped, already-attempted) `STATIC_JOB_NAME_MAP` once its own
  8-pair gap is closed (follow-on, §3); the remaining 1 (`dailySummary`) is a dead SSOT entry, not a
  join defect. This supersedes the row's original 48/87/70 snapshot with a live, reproducible number
  and a documented reason for every non-joining name — no unexplained residual.
- No `apps/mcp-server` code was modified. No `docker` mutating command was run (only `docker ps`,
  `docker exec … bun -e` read-only `Database(..., {readonly:true})`, `curl` against the container's own
  already-exposed HTTP port — same class of read as Tier-1 probe.sh already performs).

## 8. Acceptance criteria disposition

| AC | Status | Where |
|---|---|---|
| AC1 predicate executable | DONE | §6, spec now sources `/api/cron-status`, no undefined step |
| AC2 corrected path in spec | DONE (superseded) | spec no longer reads system-map crons[] for inventory at all — `CRONS`/live endpoint is the corrected source; system-map path error can't recur because system-map is no longer read for this purpose |
| AC3 prose-schedule decision recorded | DONE | §2 — decision is "not needed": CRONS is always CRON5; system-map's prose was never the machine source |
| AC4 name-mapping contract + re-derived counts | DONE | §3 table (8 pairs) + §7 counts; contract = the existing 3-tier `resolveJobNameDb`, its gap named, follow-on flagged (not landed — `apps/mcp-server` out of scope) |
| AC5 fail-loud on join miss | DONE | §3 discriminator + §6 N/M line, landed in spec |
| AC6 Claude-Code fire-state disposition | DONE | §6 — reuses Step 0b.2 (extend not duplicate); 3 in-scope crons covered, 20 others explicitly out-of-scope named |
| AC7 no success-rate reintroduction | DONE | §5 mechanism found + §6 explicit lockout line in spec |

All 7 closed by the landed spec edit. The one non-blocking residual (`STATIC_JOB_NAME_MAP` 8-pair gap,
`apps/mcp-server`) is out of this row's stated scope by the dispatch's own instruction and is visible
every cycle in A-29's own UNRESOLVED-JOIN output rather than silently masked — recommended for PO to
mint as a follow-on to `dev-mcp-server`.
