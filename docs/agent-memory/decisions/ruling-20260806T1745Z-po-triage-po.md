# PO Ruling — 2026-08-06T17:45Z general triage (dev-team Step 1)

**task_id:** `po-triage-20260806` (lock `task:po-triage-20260806`, owner_client_session `f298ccf7-8cf4-452d-9a5a-57dcb47e65ac`)
**Inputs:** 2 `pendingSignals[]` · 83 unresolved telegram reports (4380–4462, +4463 arrived mid-tick) · live `.task_board` · `git log -30` · `git branch` (main only)

---

## STEP po-1 — Signal sys-20260806T171507-1243 (rag-service A-30 floor-breach, WARN)

- **what-considered:** (a) mint a new rag-service memory row; (b) FOLD onto an existing rag row; (c) treat as a regression of the fix that landed 42 min earlier.
- **why-change:** (c) was the trap and is REFUTED by measurement. Fix `0308514f5` committer-date **2026-08-06T16:33:53Z**; `docker inspect vn-market-intelligence-mcp-rag-service-1` → `StartedAt=2026-08-06T12:57:42Z`, `RestartCount=0`. The running binary predates the fix by 3h36m. The 17:15Z breach measured the **pre-fix** embedder singleton, so it is neither a regression nor an AC failure.
- **decision:** FOLD onto `FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH` (review[]/P1) per `triage-signals.md` § `microservice_degraded`. No mint. Attached a **hard QA precondition** to that row: rebuild + redeploy rag-service and confirm the image/StartedAt actually moved *before* verdicting — otherwise QA verifies the pre-fix binary and issues a false CHANGES_REQUESTED.
- **generalisation:** this is the third live instance of *code on main, never built into a container, row advanced anyway*. Escalated on the root-cause row (STEP po-2).

## STEP po-2 — Deploy-gate root cause escalated to occurrence 3

- **decision:** `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` → P1, `occurrence_count: 3`.
  - OCC-1 `OPS-MCPSERVER-REBUILD-STALE-IMAGE-PREDATES-MEMLEAK-FIX` (mcp-server memleak fix never built).
  - OCC-2 today, `FIX-MARKETDB-WAL-SEQUENCE-STEPS-2-4-NO-OWNER`: fix `31d691d52` on main, never built; stock-price container `StartedAt 2026-07-31T00:41:51Z`, `RestartCount=0` → kinh-dich returned "insufficient price data" for **every** ticker for **6 days**, and the row's DONE claim rested on notebook-only commit `70584ca3b`.
  - OCC-3 today, `FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH` (STEP po-1).
- **scope ruling:** the gate must be a machine-checked precondition on `review→qa` for any `apps/<svc>/`-zoned row whose AC asserts runtime behaviour. Minimum discriminant: **deployed image build/StartedAt newer than the fix commit's committer-date, read from `docker inspect`, never from an agent's own claim.** Prose `REBUILD_REQUIRED=true` has now failed silently three times — a marker no gate reads is not a gate.

## STEP po-3 — Signal dev-20260806T172101-qanb (qa.md notebook lost 2 peer cycle entries)

- **what-considered:** (a) mint a qa.md-specific row; (b) FOLD onto `GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS`.
- **why-change:** (b). Prior art is a genuine match at the mechanism level, not just the topic level: occurrence 1 was `tran-ngoc-bau.md` destroyed by an **Edit** collision; occurrence 2 is `qa.md` losing cycle-522/523 to a **Write full-overwrite** race. Two notebooks, two different write tools, one shared root cause — notebook files have no write mutex. Recurring-bug 2+ threshold met.
- **decision:** FOLD as occurrence 2 + **widen the row's scope** (PO authority): the primitive must cover both the Edit-collision and Write-full-overwrite paths, for any notebook under `docs/agent-memory/notebooks/`, and must be reachable by **Bash-less agents** (several notebook writers have no Bash grant — a mutex only Bash-capable agents can take leaves the same hole open).
- **secondary:** signal type `notebook_concurrency_gap` is not in `triage-signals.md`'s routed-type table. That routing gap is the already-tracked `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED`; no separate mint.

## STEP po-4 — `FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT` (P1, BLOCKED on PO since 08:51Z)

Its `status_note` carried an explicit undecided item: *"harden mcp-server's push-endpoint … so an 11h silent hang can't recur undetected … own FIX row or folds into an existing track?"*

- **decision: SPLIT, then unblock.**
  - **(a) stays here** — harden the mcp-server-side `/api/push-news` endpoint. This is code in `apps/mcp-server/`, so `next_agent` po→**dev-mcp-server**, zone `cross-service/`→`apps/mcp-server/`, status BLOCKED→BACKLOG. AC rewritten to scope (a) only. ops's AC-1 recon is complete; nothing further is owed by ops or PO.
  - **(b) moves out** — "independent health probe so it can't recur *undetected*" is a detector-plane gap, not an mcp-server code change, and it is the **same** gap that let kinh-dich sit dark 6 days. Burying a cross-service detector defect inside a single-service hardening task is how it stays invisible. Tracked separately (STEP po-5).
- **not reopened:** ops's AC-2 finding is accepted verbatim — Tier-1/Tier-2 cadence behaved as designed. The defect is the **absence of a probe class**, not a mis-tuned existing detector. (`feedback_router_blames_detector_when_actuator_or_policy_is_at_fault` cuts the other way here too: do not manufacture a detector bug where the detector was correct.)

## STEP po-5 — MINT `FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR` (P1, cross-service/)

The only new row minted this tick. Two independent live occurrences in 8 days, no prior art.

- **OCC-1** kinh-dich dark 6 days: container healthchecks PASS, `docker ps` healthy, `market-db-journal-guard` PASS — because it probes the DB **file's** journal_mode, not whether any read path returns rows. Report 4461's own closing line: *"no detector fired for 6 days … needs an active read-path probe, not a DB-file probe."*
- **OCC-2** news push silent 663 min: Tier-1 B-01 fired at 06:41:27Z, ~1 minute before self-recovery — i.e. 11h into an 11h04m outage. Threshold-on-staleness detectors are structurally trailing; they alarm at threshold-expiry, not at failure onset.
- **root cause:** the fleet has container-health probes, DB-file probes and staleness-threshold probes, and **zero** probes that call a public read path and assert the response is non-degenerate. Empty array, 503 and "database is locked" are all indistinguishable from healthy today. `feedback_passive_health_masks_dead_data`, now measured at 6-day blast radius.
- **AC-3 is the load-bearing one and is deliberately adversarial:** the probe must be replayed against the **pre-fix** state of both occurrences and shown to go RED while `docker ps` and the journal-guard stay GREEN. A probe validated only on a healthy system is worthless when the entire failure mode is "everything green while dead."
- **AC-4 guards the known sequel:** `FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED` shipped a green, self-testing guard with zero call sites for 7 days. Wiring must be proven by a live fire, not a code-reading claim.
- **AC-5:** read-only, must not itself become a WAL re-armer (`FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-…` is why this caveat is load-bearing).
- **not_duplicate_of** recorded on the row with the six nearest neighbours and why each is a different plane.

## STEP po-6 — Manual-dispatch sweep: deliberate deviation from `[rank, idx]`

- Candidate set: 19 DRS-stranded backlog + 2 ready-XOR. Spec head by `sort_by([.rank,.idx])` was `TE-T03` (P1, `reflag=true`).
- **Selected `GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS` instead.** Same rank (P1); `idx` is an arbitrary array-position tiebreak carrying no priority information; and this row took a **fresh second live occurrence this tick** (realised peer data loss in `qa.md`), which `main.md`'s own priority order puts first — *"recurring bugs → UNBLOCK → FIX → …"*. `TE-T03` is a token-economy chore already re-admitted across several ticks.
- Deviation is recorded verbatim on the row's `po_manual_dispatch_note` so it is auditable rather than silent.

## STEP po-7 — Telegram backlog: 84 reports resolved, 1 minted

Classified before resolving; every id dispositioned against live prior art or live re-verification.

| Class | ids | Disposition |
|---|---|---|
| BCTC period-mismatch | 4381–4399, 4407, 4418–4441 (subset) | duplicate → `FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT` (review) + root cause `FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST` (ready/P0) |
| emit-signal E-3 `scheduler_locks-FAIL` | 4411, 4419, 4422, 4424, 4428, 4450, 4452, 4453, 4458 | duplicate → `FIX-EMITSIGNAL-E3-RC3-FATAL-NORETRY-DROPS-DETECTOR-FINDING` + `FIX-EMITSIGNAL-BUGTELEGRAM-NO-TEST-SINK-GATE` (both review) |
| audit-output-contract | 4417, 4447, 4454, 4456, 4457 / 4451, 4455 | duplicate → `FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH` / `FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS` |
| WAL / journal-guard / kinh-dich 503 | 4413–4416, 4438, 4443, 4448, 4449, 4459, 4460, 4461 | RESOLVED by the 15:59Z stock-price rebuild; both WAL rows left in `qa[]` for independent sign-off |
| BCTC OCR-corruption + write-BLOCKED guards | 4400–4403, 4442, 4444, 4445, 4446 | guard behaving **correctly** (refusing to store `total_assets=0` / assets<equity); class tracked → `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` |
| reconcile-exhausted | 4380, 4404, 4405 | duplicate → `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` (review/ops) |
| sla-monitor staleness | 4409, 4410, 4412 | trailing-threshold class → now owned by the STEP po-5 mint; feeds self-recovered (prices/foreign-flow pushing normally) |
| cowork fleet dormancy | 4406 | RESOLVED — fleet re-armed, cowork ticks live today (`4d8a96ce4`, 16:30Z) |
| get_bctc_full "outage day 4" | 4408 | **RESOLVED, re-verified live this tick** — `get_bctc_full(code="FPT")` returns real 2026-Q1 data (assets 68,586.1 tỷ, confidence 81%, validation passed) |
| emit-dashboard mutex | 4463 | duplicate → `FIX-AUDITOR-DASHBOARD-MUTEX-RETRY-NEXT-TICK-NO-ACTUATOR` |

`delete_success=false` on ids 4380–4410 only — those messages are >48h old and Telegram's bot API cannot delete them. Rows are still marked processed. Expected API limit, not a defect; not minted.

## STEP po-8 — Carried-over P0 folded into BATCH

`FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST` (P0, `ready[]` since 08-05T16:51Z) has now been carried three PO cycles with the prior notebook stating *"if still un-dispatched at next full triage, the inaction is the finding."* It is the **root cause of the largest single class in this tick's telegram backlog** (30+ period-mismatch refusals, same tickers repeating across 08-04 and 08-06). Folded into BATCH.

**Observation, not minted:** `ready[]` currently holds **21 P0 rows**; BOUNDED-1 promoted a P2 `backlog[]` row (`DEFLAKE-VNSTOCK-3STATEMENT`, `priority_rank=2`) this tick while those P0s sat untouched, because its promoter is backlog-scoped. Already covered by `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (ready) / `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (review) / `FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE` (review) — throughput, not triage. No new row.

---

## Not done, deliberately

- No sprint kicked off — board is saturated (360 backlog / 241 review / 60 ready / 21 P0 ready). Adding scope would not have been product-positive.
- No BA spec review, no sprint sign-off — none pending.
- Both WAL rows left in `qa[]`. PO was the executor of the rebuild; executor-self-certification is this incident's own defect class.
- Supervised-hold pre-check: `should_hold=false` (head `DEFLAKE-VNSTOCK-3STATEMENT`, `supervised=false`) → no-op, correctly.
- TNB pre-check: `docs/handoffs/tnb-audit-latest.md` unchanged since 2026-08-01, already double-ACKed. No new findings.
