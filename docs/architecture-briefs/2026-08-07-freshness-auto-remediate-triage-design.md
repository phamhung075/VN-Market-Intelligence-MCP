# SPIKE-FRESHNESS-REMEDIATE-TRIAGE — Design Doc

**Task:** `SPIKE-FRESHNESS-REMEDIATE-TRIAGE` (plan_only, supervised, P1, sprint `FRESHNESS-AUTO-REMEDIATE`)
**Author:** architect · 2026-08-07 · timebox 120min
**Status:** design complete — hand-off to PO/PM for implementation-task decomposition
**Zone:** `apps/mcp-server/` (single-zone — BUILD-STANDARD: lean, existing service, no new microservice)

Companion to `FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING` (verifies the existing detector — untouched by
this design) and `FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE` (frontend consumer — untouched). This SPIKE
designs the layer BETWEEN detection (already live, working) and remediation (currently a dead end).

---

## 0. Executive summary

The detector (`freshnessSlaMonitorJob.ts` + `coverageMapFreshnessChecker.ts`) works. Its ONLY escalation
path — `postSignal(toAgent:"alert-commander", signalType:"urgent_news")` — is a dead end by design:
alert-commander is correctly scoped to per-ticker market-moving news (`docs/policies/alert-policy.md` —
position-danger / watchlist-opportunity gates) and correctly suppresses these signals as infra noise every
cycle (`docs/agents/alert-commander/flow/stage-signals.md:24`, discovered live 2026-07-12). **This is not a
bug in alert-commander** — it is the wrong addressee. Nothing else ever reads the breach.

This design:
1. Generalizes `queryBctcPipelineRuntimeState`'s 2-signal (`serviceActive` + `queueDepth`) pattern from one
   hardcoded BCTC probe into a **registry** resolving any coverage-map `.writer` string to the right probe
   (VPS-fetch service / in-process cron job / queue-backed pipeline / no-probe-needed).
2. Splits every breach into two classes — **CRASH** (writer confirmed down/erroring/never-scheduled → mint
   dev FIX) vs **IDLE-OVERDUE** (writer healthy, data merely hasn't refreshed yet, but is now overdue by its
   own declared cadence → re-invoke, don't file a bug).
3. Redirects BOTH classes off alert-commander onto `.signal_queue.rows[]` with `to:"po"`, reusing two
   **already-live, already-routed** PO Pipeline-B types (`microservice_degraded` / `data_stale`) — zero new
   PO-side routing logic.
4. Adds a surface-keyed dedup/cooldown primitive mirroring `apps/alert-engine`'s Fence-A pattern
   (djb2 dedup-key-builder + cooldown-gate), plus an "open-remediation" suppression rule.
5. Root-causes the two PO-folded false positives (`foreign_flow`, `price` CRITICAL at 02:00Z) to a genuine
   **conflated-axes bug** in the existing threshold model — not a one-off tuning miss — and designs the fix
   as a reusable cadence/session-gate declaration, not a 5th point-patch.
6. Scopes (does not implement) the `ENDPOINT_DB_QUERY` widening into 5 buckets so PM can size a follow-up
   FIX independently of this TRIAGE layer landing.

---

## 1. Brownfield findings — verified paths

| Path | Finding |
|---|---|
| `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:233-265` | `queryBctcPipelineRuntimeState` — the reader to generalize. 2 inline SQL queries, hardcoded to `bctc_vps_queue` + `service_name='vn-bctc-fetch'`. Fail-open (`try/catch → undefined`). |
| `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:538-582` | DS-OBS-01-FIX: escalation posts `urgent_news`→alert-commander (dead end). Cooldown check (`isEscalationCooldownActive`, 60min, `sla_breach_audit`) gates it. |
| `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:626-664` | Coverage-map second pass — SAME dead-end addressee, but with **zero** cooldown/audit table at all (see §4). |
| `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts:690-744` | `checkSignalSla` — generic 3-way gate (`crash`/`idle`/`ok`) already exists and is reusable as-is; only the `runtimeStates` map needs widening. |
| `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts:144-159` | `isVnMarketHours` — returns `true` at exactly `utcHour===2` (09:00 ICT). Real market open is 09:15 ICT. **Root cause of PO-fold finding (b).** |
| `apps/mcp-server/src/domain/services/freshnessSlaConfig.ts:119-123` | `foreign_flow: defaultThresholdMinutes:10` — copy-pasted from `price`'s intraday cadence. But the signal it measures (`daily_foreign_flow.updated_at`) is a once-per-session EOD aggregate, not a per-minute stream. **Root cause of PO-fold finding (a)** — deeper than the market-hours boundary alone. |
| `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts:142-162` | `ENDPOINT_DB_QUERY` — only 5/50 coverage-map rows mapped. No `runtimeStates` parameter exists on this path at all (item 5 + classifier gap). |
| `docs/data/frontend-data-coverage-map.json` | 50 rows, `.writer` (often compound, `+`-joined, e.g. `"summaryDaily+eveningSummary+CHEF"`), `.cadence` (cron expr / `on-demand` / `event(...)` / `n/a`), `.store`, `.asof` all populated. `.store`+`.asof` name the underlying table for ~29/50 rows already — useful for §5 scoping, NOT a literal SQL column name (needs code-verification per row, same discipline as TASK-FFT-L2). |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts:475-537` | `vps_service_health` — **already tracks 5 services** (`vn-price-fetch`, `vn-news-fetch`, `vn-foreign-flow`, `vn-sbv-fetch`, `vn-bctc-fetch`), not just BCTC. `queryBctcPipelineRuntimeState` only reads 1 of the 5 rows already available. |
| `apps/mcp-server/src/domain/services/vpsHealthPoller.ts:56-100` | A **second, independent** idle-vs-unhealthy classifier already exists here (`FreshnessConfig.marketHoursOnly` + `queueGuardSql`), feeding `vps_service_health`. Parallel to `freshnessSlaMonitorJob.ts`'s own gate — pre-existing duplication, flagged not fixed (out of this SPIKE's scope; see §7 risk). |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts:34-48` (`cron_job_runs`) + `domain/repositories/IJobRunRepository.ts` + `infrastructure/db/cronJobRunStore.ts` (`getCronJobHealthSummary`) | **Already tracks every one of the 57+ in-process node-cron jobs** in `schedulerJobTable.ts` (`last_status` incl. distinct `'crashed'` vs `'error'`, `last_run`, `success_rate_7d`). This is the generalized "serviceActive" proxy for the majority of `.writer` values that are cron-job names, not VPS services. |
| `apps/mcp-server/src/infrastructure/orchStateStore.ts:275-332` (`appendSignalQueueRow`) | The established in-process TS mechanism for writing `.signal_queue.rows[]` from running scheduler/infra code — own mtime-CAS retry + Zod validation before atomic rename. **Distinct from, and NOT required to route through, `scripts/orch-apply.sh`** — that CLAUDE.md contract governs agent-issued shell/jq writes; `orchStateStore.ts` is the mcp-server's own already-audited in-process equivalent (same guarantee, different call surface). |
| `apps/mcp-server/src/infrastructure/signals/bctcImageFetchDegradedSignalWriter.ts`, `narrativeContradictionSignalWriter.ts` | Existing, live precedent for "thin wrapper over `appendSignalQueueRow()`" signal writers — the pattern to extend, not reinvent. |
| `.claude/skills/anomaly-task-bridge/SKILL.md` + `docs/agents/po/flow/triage-signals.md:44-45` | The already-live anomaly→BACKLOG bridge. `data_stale` and `microservice_degraded` are **already first-class PO Pipeline-B types**, read every PO cycle directly off `.signal_queue.rows[]` (no 2h ATB wait — ATB is a SEPARATE, slower ≥2h-unread ratchet for signals nobody read directly). |
| `apps/alert-engine/pkg/primitive/{dedup-key-builder,cooldown-gate}/*.go` | Fence-A pure primitives, ticker-shaped (`stock`/`signalTypes`). Different bounded context (Go microservice, per-ticker alerts) — algorithm is reusable, the Go binary/HTTP surface is not (see §4). |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts:560-583` (`sla_breach_audit`) | `signal_type` CHECK-constrained to exactly the 12 legacy enum values — cannot hold a coverage-map surface. No `surface`/`breach_class` columns exist anywhere. |
| `docs/data/system-map.json .project.data_sources[]` | 28 entries, ALREADY carry `expected_cadence_hours` + `stale_threshold_hours` (e.g. `foreign-flow: 0.0167h/0.5h` = the raw per-minute VPS push, correctly tight — a DIFFERENT thing from the EOD `daily_foreign_flow` aggregate `freshnessSlaChecker.ts` actually measures). This table is a candidate cadence SSOT that `freshnessSlaConfig.ts` never reads today — two independently-hand-tuned threshold tables already exist and have already drifted. |
| `apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts:56-240` (`schedule_task`) | Live MCP tool: schedules a one-shot dispatch to a COWORK agent (spawned by cowork-team's `*/15` sweeper) or a DEV agent (signal row), with `dedup_key` idempotency + `deadline_at`. Exactly the "re-invoke the responsible agent" primitive for class (b) — already built, needs no new plumbing. |

**Reuse audit (constraint: `always_extend_not_duplicate`):** every mechanism named above already exists and
is live. This design adds exactly 2 new pure-domain files, 2 new infrastructure files, 1 new signal writer,
and 1 new (additive) DB table — see §6.

---

## 2. §1 — Broken-vs-idle CLASSIFIER

### 2.1 Generalize the probe, not just the gate

`checkSignalSla`'s 3-way gate (`crash`/`idle`/`ok`) is already fully generic — **do not touch it**. The
only thing BCTC-specific is the *reader* (`queryBctcPipelineRuntimeState`). Replace the single hardcoded
reader with a **probe registry** keyed by normalized writer token:

```ts
// domain/services/writerRuntimeProbeRegistry.ts (pure — no I/O; returns a ProbeSpec, not a result)
type ProbeSpec =
  | { kind: "vps_service"; serviceName: VpsServiceName }        // → vps_service_health (5 services, already exists)
  | { kind: "cron_job"; jobName: string }                        // → cron_job_runs (57+ jobs, already exists)
  | { kind: "queue_backed"; jobName: string; queueTable: string; activeStatuses: string[] } // bctc-style
  | { kind: "no_probe" };                                        // static / on-demand / computed-on-read

function resolveProbeSpecs(writer: string): ProbeSpec[] {
  // split on "+" — a compound writer (e.g. "summaryDaily+eveningSummary+CHEF") maps to
  // MULTIPLE probes; the surface is CRASH if ANY constituent probe is CRASH.
}
```

`WRITER_PROBE_REGISTRY` is the ONLY hand-authored table (maps writer tokens → `ProbeSpec`); everything else
is a pure function over already-existing data. Unresolvable tokens (no VPS service, no matching
`schedulerJobTable.ts` `name`) fall back to `no_probe` — **fail-open, never fabricate a CRASH**, matching
`queryBctcPipelineRuntimeState`'s existing `try/catch → undefined` discipline exactly.

### 2.2 Reader layer (infrastructure)

`infrastructure/db/writerRuntimeStore.ts` — extract `queryBctcPipelineRuntimeState`'s two inline queries
into reusable, parameterized functions:
- `getVpsServiceActive(db, serviceName)` — generalizes the existing `vn-bctc-fetch`-only query to any of
  the 5 `vps_service_health` rows (zero schema change — the data already exists for `price`/`news`/
  `sbv_fx`/`foreign_flow` too, just never read by this job).
- `getCronJobLastStatus(db, jobName)` — new, reads `cron_job_runs` (`last_status`); `'crashed'`→CRASH,
  `'error'` on the most recent run→CRASH (repeated failure, not transient), `'success'`/`'running'`→active,
  **no row ever** → CRASH (this is literally "never-scheduled", named explicitly in the task's own
  question).
- `getQueueDepth(db, table, activeStatuses)` — generalizes `bctc_vps_queue`'s query to any queue table a
  FUTURE pipeline registers (additive; only BCTC uses it today).

`queryBctcPipelineRuntimeState` itself becomes a **1-line wrapper** calling these generalized functions
with BCTC's own config — same public signature, byte-identical output, so the existing
`FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts` suite is the regression gate (must stay green unmodified).

### 2.3 The cadence/session-gate bug (concrete acceptance input)

Reading the code confirms the PO-fold finding is a **real, generalizable defect**, not tuning drift:

- **Finding (b) mechanism:** `isVnMarketHours()` treats `utcHour===2` (09:00 ICT) as already "market
  hours," but the exchange opens at 09:15 ICT (02:15 UTC). During the 15-minute gap, `MARKET_HOURS_ONLY_SOURCES`
  sources get the tight 10-min threshold applied to a period where the market genuinely hasn't opened yet.
  **Fix:** correct the boundary to `02:15`. One function, shared by both the legacy 12-signal path and the
  coverage-map `STALE_RISK` gate (`isVnMarketHours` is imported by both) — fixing it once fixes both call
  sites.
- **Finding (a) mechanism:** `foreign_flow`'s `defaultThresholdMinutes:10` was copied from `price`'s
  per-minute cadence, but the signal type actually measures `daily_foreign_flow.updated_at` — a once-daily
  EOD aggregate (confirmed: system-map.json's OWN `foreign-flow` data-source entry has
  `expected_cadence_hours:0.0167` for the RAW VPS push, which is a *different* table from the EOD aggregate
  `freshnessSlaChecker.ts` measures). **The conflation:** `MARKET_HOURS_ONLY_SOURCES` (a session-WINDOW
  concept — "is this source expected to be active at all right now") and `defaultThresholdMinutes` (a
  CADENCE concept — "how often does it actually update within its active window") are collapsed into one
  boolean + one constant. `foreign_flow` is session-gated (only active during trading days) but
  daily-cadence (updates once, at EOD) — the current model has no way to express that combination without
  a dedicated point-fix, which is exactly the churn pattern already flagged 3x (`FIX-SLA-SBV-FX-*`,
  `FIX-SLA-BCTC-THRESHOLD-*`, `FIX-SLA-SIGNALQUALITYAUDIT-*`).

**Design (not implementation):** decouple the two axes into an explicit per-source declaration:

```ts
// domain/services/freshnessCadenceConfig.ts (pure data)
interface CadenceDeclaration {
  sessionGate: "always" | "market-hours" | "business-day" | "publish-hours";
  cadenceClass: "continuous" | "intraday" | "daily-eod" | "weekly" | "monthly" | "event";
}
```

`getSlaThreshold` becomes `f(sessionGate, cadenceClass, now)` instead of `f(hand-tuned-minutes, now)`. SSOT
candidate: `system-map.json .project.data_sources[]` — already the documented SSOT (`_note`) and already
28/~40 sources populated; `freshnessSlaConfig.ts`'s `DEFAULT_SLA_CONFIG` becomes the migration source for
the remaining signal types, not a permanent second hand-tuned table (this closes a **pre-existing** drift
risk between the two tables, not one this design introduces). **Acceptance test (bakes the fold directly
into the design):** `foreign_flow` and `price`, evaluated at `now=2026-08-0XT02:00:00Z` on a trading day,
must NOT classify CRITICAL when the underlying data is current by each source's own recheck harness
(`scripts/check-foreign-flow-freshness.sh` for foreign_flow).

This is additive/parallel-run in the implementation phase (do not rip out `MARKET_HOURS_ONLY_SOURCES` etc.
in one shot) — PM should scope the cutover as its own verification-gated step, not a silent behavior swap.

---

## 3. §2 — ROUTING targets + payload contract

### 3.1 Classification → route

| Runtime verdict | Meaning | Action | Signal `type` |
|---|---|---|---|
| **CRASH** | `serviceActive===false` (any constituent probe), OR `cron_job` last run `status='crashed'`, OR never-scheduled | Writer is broken — mint dev FIX | `microservice_degraded` |
| **IDLE, within cadence** | `queueDepth===0` / cron healthy, age within the surface's own `cadenceClass` window | Normal — **no signal at all** (matches BCTC's own idle branch today: suppress, don't escalate) | — |
| **IDLE, overdue** | Writer healthy but age exceeds its own declared cadence + grace (a skipped tick, not a crash) | Re-invoke the writer, not a bug report | `data_stale` |

### 3.2 Owning-agent/zone resolution — from `system-map.json`, never hardcoded

- **CRASH → dev FIX zone:** for `cron_job`/`queue_backed` probes the writer lives inside `apps/mcp-server/`
  by construction (every `schedulerJobTable.ts` job runs in that process) → `zone: "apps/mcp-server/"`
  always. For any writer whose token doesn't resolve to an mcp-server-internal job (e.g. a future
  ops/VPS-side writer), resolve via `.claude/skills/zone-detect/SKILL.md`'s Tier-2 keyword match against
  `system-map.json .project.zones[].keywords`; Tier-3 fallback emits `zone_missing_tier3` (existing
  mechanism, not new).
- **IDLE-overdue → re-invoke target:** for `cron_job`-backed writers, re-invoking means "call the job's own
  exported `run*Job()` function" — cheapest, in-process, no signal bus needed at all (the SLA monitor
  already runs inside the same Bun process as every cron job). For cowork-agent-owned writers named
  literally in the `.writer` string (e.g. `CHEF`, `bctc-analyst(release)`), use the **already-built**
  `schedule_task` MCP tool: `agent=<resolved agent id>`, `intent="freshness_reinvoke:<surface-slug>"`,
  `delay_seconds=0`, `dedup_key="freshness-reinvoke:<surface>:<YYYY-MM-DD>"` (1 nudge/surface/day cap via
  the tool's own idempotency, not a new mechanism). Agent-id resolution: match writer token against
  `docs/agents/<slug>/` directory names — a writer with no matching agent directory AND no matching
  `schedulerJobTable.ts` job name has no re-invoke target; falls through to the CRASH path instead (fail
  toward visibility, never silently drop an overdue surface).

### 3.3 Payload contract

**Class (a) CRASH row** (`microservice_degraded` — matches PO's existing Pipeline-B rule verbatim, "Named
service failing its health probe... mint FIX, `zone: apps/{service}/`"):
```json
{
  "id": "fsla-<compact-ts>-<surface-slug>",
  "ts": "<ISO>", "from": "freshness-sla-monitor", "to": "po",
  "type": "microservice_degraded",
  "summary": "<surface> writer <writer-token> CRASH: <probe-detail, e.g. service unreachable / cron last-run crashed / never scheduled>",
  "severity": "CRITICAL",
  "status": "NEW",
  "payload_ref": null
}
```

**Class (b) IDLE-OVERDUE row** (`data_stale` — matches PO's existing rule, "named pipeline/service stopped
ingesting... mint FIX + companion ops recon, or `pendingObservations[]` for WARN"):
```json
{
  "id": "fsla-<compact-ts>-<surface-slug>",
  "ts": "<ISO>", "from": "freshness-sla-monitor", "to": "po",
  "type": "data_stale",
  "summary": "<surface> stale <ageMinutes>min (cadence <cadenceClass>, writer healthy) — reinvoke dispatched to <agent-or-job>, dedup_key=<key>",
  "severity": "HIGH",
  "status": "NEW",
  "payload_ref": null
}
```

Both shapes are `OrchStateSignalRow`-compatible (no schema change) — same shape family as
`bctcImageFetchDegradedSignalWriter.ts`'s `bctc_image_fetch_degraded` row.

---

## 4. §3 — SIGNAL-BUS REDIRECT

Replace, in `freshnessSlaMonitorJob.ts`:
- `escalateToCommander()`'s `postSignal(toAgent:"alert-commander", signalType:"urgent_news", ...)` call.
- The coverage-map second pass's identical `postSignal(...)` call (`freshnessSlaMonitorJob.ts:640-655`).

...with calls into a new `infrastructure/signals/freshnessSlaBreachSignalWriter.ts`, following the
**existing, live pattern** set by `bctcImageFetchDegradedSignalWriter.ts` / `narrativeContradictionSignalWriter.ts`:
a thin wrapper building the row (§3.3) and calling `orchStateStore.appendSignalQueueRow()` directly —
**in-process, not a shell-out to `scripts/orch-apply.sh` or `emit-audit-signal.sh`** (those are the
agent/bash-context path; the mcp-server's own runtime code has its own already-audited atomic+CAS+Zod
writer, per §1's brownfield finding — this is the established exception, not a violation of the
orch-apply.sh contract, which governs agent-issued writes).

This lands on `.signal_queue.rows[]` with `to:"po"`, `type` ∈ `{microservice_degraded, data_stale}` — **both
already first-class PO Pipeline-B routing rules** (`docs/agents/po/flow/triage-signals.md:44-45`), read on
**every** PO cycle via the "Pre-check — Signal dashboard" step — no dependency on `anomaly-task-bridge`'s
slower ≥2h-unread ratchet (ATB exists for signals nobody reads directly within 2h; this path is read
directly, so it never needs ATB at all).

**Recommendation: drop the `urgent_news`→alert-commander call entirely** for this job, rather than
dual-write. Alert-commander's suppression is *correct* behavior for infra noise (§0) — routing around it by
also keeping the old call is dead weight, not defense-in-depth. The `sla_breach_audit`/direct-BUG-telegram
writes (observability plane) are unaffected — only the escalation *addressee* changes.

---

## 5. §4 — ANTI-SPAM keying

`apps/alert-engine`'s primitives are Fence-A pure Go, ticker-shaped (`stock`+`signalTypes`+`message`) and
live in a separate Go microservice with its own bounded context (per-ticker MARKET alerts via `POST
/evaluate`) — not callable in-process from a Bun scheduler, and semantically the wrong shape (a freshness
breach has no ticker). **Reuse = mirror the algorithm, not the binary** — same precedent this repo already
follows for `computeFingerprint` (djb2, seed 5381) existing natively in more than one bounded context
already (`scripts/migrations/backfill-signals-db.ts`).

New pure-domain primitive, `domain/services/freshnessBreachDedup.ts`:
- `buildBreachDedupKey(surface, breachClass, messagePrefix)` → djb2(`surface|breachClass|prefix`, same
  seed=5381, same 50-rune message cap as `dedup-key-builder/builder.go` — byte-shape-compatible even though
  it's a fresh TS implementation).
- `shouldSuppressBreachAlert(input, recentBreaches, cfg, now)` → mirrors `cooldown-gate/gate.go`'s Rule 1
  (same-key-within-window suppression) **plus a new Rule 3, open-remediation suppression**, replacing
  Go's Rule 2 (daily-cap, which doesn't map onto a non-ticker surface): if a NON-TERMINAL `.task_board` row
  already carries this exact `dedup_key` (stamped at mint time, §3.3), suppress — remediation is already in
  flight, re-signalling adds nothing. (Severity-escalation bypass, mirroring `emit-audit-signal.sh`'s own
  `_severity_rank`/escalation-bypass convention: a CRASH superseding a previously-suppressed IDLE-OVERDUE
  for the same surface is new information and re-fires.)

**Persistence: new table, not an ALTER on `sla_breach_audit`.** That table's `signal_type` CHECK constraint
is hard-limited to the 12 legacy enum values by design; retrofitting 50 non-enum coverage-map surfaces onto
it risks the constraint (and every existing query against it). Add `surface_breach_audit`
(`infrastructure/db/surfaceBreachAuditStore.ts`, additive `CREATE TABLE IF NOT EXISTS` — zero risk to the
existing table, same defensive-DDL pattern already used for `cron_job_runs`'s `'crashed'` status
migration):

```sql
CREATE TABLE IF NOT EXISTS surface_breach_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surface TEXT NOT NULL,               -- coverage-map page/elem slug OR legacy signal_type
  breach_class TEXT NOT NULL CHECK(breach_class IN ('crash','idle_overdue')),
  dedup_key TEXT NOT NULL,
  breached_at TEXT NOT NULL DEFAULT (datetime('now')),
  age_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'breach_open' CHECK(status IN ('breach_open','recovered')),
  signal_row_id TEXT,                  -- back-ref to signal_queue.rows[].id
  recovered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_surface_breach_dedup ON surface_breach_audit(dedup_key, status, breached_at DESC);
```

Default cooldown window: **240 min** — same convention `postSignal`'s own type-aware `urgent_news` dedup
default already uses (`agentSignalStore.ts:154`), not an arbitrary new number.

This also closes a real, currently-existing gap noted during brownfield scan: the coverage-map second pass
has **zero** cooldown/audit today (only the legacy 12-signal path has `sla_breach_audit` + 60-min cooldown)
— every coverage-map breach currently re-fires on every 30-min tick with no suppression at all.

---

## 6. §5 — DETECTION-COMPLETENESS: scoping the `ENDPOINT_DB_QUERY` widening

50 coverage-map rows, code-verified against `.store`/`.endpoint`/`.asof`, sort into 5 buckets:

| Bucket | Count | Examples | Disposition |
|---|---|---|---|
| 1. Already mapped | 5 | market-digest, alerts, quality-checklist, price-history, vps-proxy-health | Done — no action |
| 2. Single named DB store, mappable the same way TASK-FFT-L2 did | ~24 | agm-plan-actual, bctc-eval, conviction-history, corporate-events, fed-rates, financials, global-markets, kinh-dich-signals, macro, market-summaries, news-buzz, news-sentiment, officers, prediction-claims, reputation, sector-cascade, shareholders, cron-status (`cron_job_runs`, trivially mappable — also the generic cron-health surface itself) | **Recommended immediate follow-up FIX** — mechanical, low-risk, high detection-value. `.store`/`.asof` name the table but NOT necessarily the literal SQL column (code-verify per row against the handler, same discipline as L2 — do not mechanically trust the JSON field name as a column name) |
| 3. MCP-REST/computed gauges | ~14 | indicator-gauges ×5, momentum-indicators ×5, money-radar ×4 | Freshness is **derived** from upstream tables (`daily_ohlcv`/`market_prices`/`news_articles`) already covered by the legacy `price`/`technical`/`news` signal types. Recommend NOT building 14 redundant per-gauge probes — annotate as upstream-bounded instead. **Product-scope question for PO** (§8) if independent per-gauge staleness is wanted for frontend badge accuracy regardless. |
| 4. Non-DB / different check shape | ~5 | `services` (gateway HTTP liveness, not a timestamp), `fetch` (self-referential — this IS the SLA monitor's own output), `db` (multi-store compound, splits into already-covered `technical`+`news`), `(NEW) cheb-synthesis` (the one true GAP, no writer at all — pre-existing, out of scope) | Different mechanism per row (HTTP probe / split / already-tracked) — not a `MAX(col)` widening candidate |
| 5. STATIC/GAP | 2 | kinh-dich-reference (STATIC), cheb-synthesis (GAP, counted in bucket 4 too) | Already excluded by `checkCoverageMapFreshness`'s own filter |

**Net scope decision:** the classifier (§2-§5 above) is **orthogonal to and unblocked by** this widening —
it should ship against the 17 currently-checkable surfaces (5 coverage-map + 12 legacy) first. Bucket 2's
~24-row widening is sizeable enough (and independently valuable enough) to be its own parallelizable FIX,
not a precondition for this TRIAGE layer landing.

---

## 7. Files to create / modify (DDD layer assignment)

**NEW — domain/services/ (pure, zero I/O):**
- `writerRuntimeProbeRegistry.ts` — `.writer` token → `ProbeSpec[]` resolution (§2.1)
- `freshnessCadenceConfig.ts` — per-source `{sessionGate, cadenceClass}` declaration (§2.3)
- `freshnessBreachDedup.ts` — dedup-key-builder + cooldown-gate port (§5)

**NEW — infrastructure/db/:**
- `writerRuntimeStore.ts` — generalized `getVpsServiceActive`/`getCronJobLastStatus`/`getQueueDepth` readers, extracted from `queryBctcPipelineRuntimeState`'s 2 inline queries (§2.2)
- `surfaceBreachAuditStore.ts` — `surface_breach_audit` CRUD (record/query/cooldown-lookup), mirrors `sla_breach_audit`'s existing functions but correctly placed in infrastructure/ (§4)

**NEW — infrastructure/signals/:**
- `freshnessSlaBreachSignalWriter.ts` — thin `appendSignalQueueRow()` wrapper, mirrors `bctcImageFetchDegradedSignalWriter.ts` precedent exactly (§3)

**MODIFY:**
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — `queryBctcPipelineRuntimeState` becomes a thin wrapper over the new generalized readers (byte-identical output for the bctc call site); new loop resolving `runtimeStates` for every coverage-map row via the probe registry; both `postSignal(→alert-commander)` calls replaced with the new signal writer, gated by `freshnessBreachDedup.ts` + `surfaceBreachAuditStore.ts`.
- `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts` — thread an additive optional `runtimeStates` param into `checkCoverageMapFreshness` (mirrors `checkSignalSla`'s existing additive `runtimeState?` param exactly — same pattern, not a new one).
- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — `isVnMarketHours` 02:00→02:15 UTC boundary correction (§2.3) — small enough to be its own independent FIX (see §8).
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — additive `surface_breach_audit` DDL (§4).
- `docs/data/frontend-data-coverage-map.json` — additive `cadence_class`/`session_gate` per row (PM/BA decomposition detail, not authored in this SPIKE).

**Ports/adapters split:** `ProbeSpec` resolution and the dedup/cooldown decision are pure domain (ports);
`vps_service_health`/`cron_job_runs`/`surface_breach_audit` reads and the `signal_queue.rows[]` write are
infrastructure adapters — mirrors the existing `freshnessSlaChecker.ts` (domain) / `freshnessSlaMonitorJob.ts`
(scheduler, orchestrates domain+infra) split already in place. No DDD violation introduced; `writerRuntimeStore.ts`
and `surfaceBreachAuditStore.ts` must not be imported by domain/ files (domain calls out via injected data,
same as the existing `runtimeStates?` parameter convention).

---

## 8. Test strategy

- **Unit (domain, pure):** `writerRuntimeProbeRegistry` — multi-token `+`-split resolution, unresolvable-token fail-open. `freshnessCadenceConfig` — the two folded false positives as explicit regression fixtures (`foreign_flow`/`price` at `02:00Z` on a trading day must NOT classify CRITICAL). `freshnessBreachDedup` — djb2 stability (same seed/output shape as the Go port), cooldown-window suppression, open-remediation suppression, severity-escalation bypass.
- **Integration:** extend `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts`'s Group C pattern (DB fixture + `runFreshnessSlaMonitor` end-to-end) — assert a CRASH-classified surface lands a `microservice_degraded` row in `signal_queue.rows[]` (not `agent_signals`/alert-commander); an IDLE-OVERDUE surface lands `data_stale` + triggers `schedule_task`/in-process re-invoke; an IDLE-within-cadence surface emits nothing.
- **Regression (mandatory, zero-tolerance):** the EXISTING `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts` suite must stay 100% green, unmodified — `queryBctcPipelineRuntimeState`'s public contract does not change.
- **Live acceptance:** re-run `scripts/check-foreign-flow-freshness.sh` alongside the new classifier at a real 02:00Z tick and confirm no CRITICAL fires while the harness itself reports `verdict=PASS`.

---

## 9. Risk flags

- **Behavior-preservation:** `queryBctcPipelineRuntimeState`'s bctc call site must remain byte-identical — regression-gated by the existing test suite (§8), not a new one.
- **Migration risk:** `surface_breach_audit` is purely additive (`CREATE TABLE IF NOT EXISTS`) — zero risk to `sla_breach_audit` or any existing query against it.
- **Pre-existing duplication (flagged, not fixed here):** `vpsHealthPoller.ts`'s own `FreshnessConfig.marketHoursOnly`/`queueGuardSql` is a SECOND, independent idle-vs-unhealthy classifier feeding `vps_service_health`, parallel to this job's gate. This design's `writerRuntimeStore.ts` reads `vps_service_health`'s STORED verdict (`health_status`) rather than re-deriving it — it does not touch or duplicate `vpsHealthPoller.ts`'s own logic. Full consolidation of the two classifiers is out of this SPIKE's scope; noted for PO/PM.
- **Two-threshold-table drift (pre-existing, not introduced by this design):** `DEFAULT_SLA_CONFIG` (hand-tuned minutes) and `system-map.json .project.data_sources[].stale_threshold_hours` (already-populated SSOT candidate) have already drifted for at least `foreign_flow`. §2.3's cadence-config migration should pick one SSOT going forward rather than adding a third table.
- **Fail-open discipline (hard constraint):** every new probe must preserve `queryBctcPipelineRuntimeState`'s existing convention — an unresolvable/errored probe returns "no verdict" (falls back to legacy age-only check), **never** a fabricated CRASH. A classifier that manufactures false CRASH FIX rows is strictly worse than the current dead-end (creates busywork instead of silence).
- **Security/injection:** none — no new external input surface; all new queries are parameterized (`?` placeholders), matching existing convention throughout this file family.
- **Memory/perf:** negligible — same cardinality class as the existing 12-signal + 50-row passes; all new reads hit existing indexes (`idx_vps_service_health`, `idx_cron_job_runs_job_started`) or the new table's own index.
- **DDD:** no violation — see §7 ports/adapters note.

---

## 10. Open questions for PO (noted, not blocking)

1. Bucket 3 (§6, ~14 MCP-REST computed gauges): is "bounded by already-covered upstream tables, no
   independent probe" an acceptable disposition, or is independent per-gauge staleness wanted for frontend
   badge accuracy regardless of upstream coverage? Affects whether PM sizes a 4th bucket-3 follow-up.
2. `surface_breach_audit` as a genuinely new table (§4) vs. relaxing `sla_breach_audit`'s CHECK constraint
   to accept both legacy signal types and coverage-map surfaces in one table — this design recommends the
   new-table option (zero risk to the constrained column) but it is a schema decision PO/PM may want to
   weigh in on before dev starts.
3. `isVnMarketHours` 02:00→02:15 boundary (§2.3) is small, isolated, and independently verifiable —
   recommend PM mint it as its own fast-turnaround FIX rather than bundling into the larger TRIAGE
   implementation, so the live false-positive stops firing sooner.

---

## 11. Build-standard classification

`apps/mcp-server/` already exists → **BUILD-STANDARD: lean** (`docs/standards/microservice-build-standard.md`).
No new microservice, no `pilot-status-*.json`, no PO→BA→architect→PM→dev-\<svc\>→QA relay — `dev-mcp-server`
drives end-to-end per the existing lean-feature convention.

---

## Decision journal

See `docs/agent-memory/decisions/sprint-<id>-architect.md` § `architect-S<N>` entry for this task,
stamped `task-id: SPIKE-FRESHNESS-REMEDIATE-TRIAGE`.
