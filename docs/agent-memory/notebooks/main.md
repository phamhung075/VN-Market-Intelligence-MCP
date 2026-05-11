# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 10:03 UTC (Cycle 20 close — Sprint 1871 fully SHIPPED, 7 SPRINT-S tasks)

## Cycle 20 SHIPPED Sprint 1871 (2026-05-11 10:03 UTC)

| Task | Type | SHA | Result |
|------|------|-----|--------|
| 1871a | SPRINT-S | `309c8562` (in bundle `6c939b4b`) | ARCHITECTURE.md + project-stats.json counts: 132 tools / 59 cron / 62 scheduler files (doc-updated). |
| 1871e | SPRINT-S | `dbab4db4` (in bundle `6c939b4b`) | tran-ngoc-bau flow get_agent_signals call fixed: `{agent="tran-ngoc-bau", status="all"}` (code-fixed, Path A). |
| 1871g | SPRINT-S | `27bd6356` (in bundle `6c939b4b`) | alert-policy.md two-stage WRITE→DERIVE→READ verdict flow rewrite (doc-updated). |
| 1871b | SPRINT-S | merge `6f161a4b` | ARCHITECTURE.md infrastructure/ tree expanded: 11 subdirs (added adapters, agents, cache, fileStore, microservices, observability, vps). fileStore/ entry calls out alertVerdictStore.ts. (doc-updated) |
| 1871d | SPRINT-S | merge `2bcae2e5` | cron-registry.json backfilled: 41→62 entries, 21 missing jobs added. schedulerFileCount=59 matches cronConfig.ts. (doc-updated) |
| 1871f | SPRINT-S | merge `30030baa` | DDD code-fix: domain/models/vnstockTypes.ts NEW (6 interfaces extracted from infra/fetchers/vnstockBridge). IVnstockRepository + SqliteVnstockRepository + vnstockStore re-imported from domain. domain/ now has 0 infra imports. (code-fixed) |
| 1871c | SPRINT-S | merge `22bef183` | ARCHITECTURE.md Module Boundaries + tools/ folder tree: added analysis/ (sequential_market_analysis) + backtesting/ (3 tools). 12 modules total. (doc-updated) |

## Cycle 20 process notes

- **Two signals re-fired** between cycle 19 drain (07:30 UTC) and close (08:06 UTC). Both content-identical to processed/ copies. Drained as `routed-to-po-rerun`. TNB likely re-emits idempotently while audit file is unchanged; architect signal re-fire is more concerning (no cron source). **Flag for c35 TNB**: signal-dedup needed at drain layer or TTL on architect signals.
- **Parallel-dispatch race in Tier 1** (1871a + 1871e + 1871g): all 3 developers shared the local git working dir, commits stacked on `task/1871a-arch-counts` branch instead of 3 dedicated branches. Commits were clean (different files, no conflicts), salvaged via single-bundle QA + merge `6c939b4b`. **Process fix applied Tier 2+: worktree isolation** via `isolation: "worktree"` Agent param. Tier 2 (3 parallel devs in worktrees) ran cleanly with 3 separate branches.
- **Baseline truth-finding**: cycle 19 carried a phantom 9297/16 baseline. Authoritative from Tier-2 QA: **9168 pass / 12 fail / 38 skip** with **23 pre-existing TSC errors** on main. Cycle 20 deltas all 0.
- **1871f baseline anomaly explained**: developer reported 9046/117 from worktree — root cause was broken symlink `apps/mcp-server/data/ → ../../data` in worktree (target path doesn't exist for subpath). NOT a code regression. QA verified vs authoritative main baseline.
- **TNB c34 F3 = 1871e** closed (one-line flow fix). Pattern: undetected because Zod failure was swallowed by cowork error boundary. **Flag for c35**: error boundary should surface Zod validation failures to WORK channel, not silently continue.
- **1872c candidate REJECTED** (not promotable to FIX): `update_analysis_brief` tool does NOT exist in `apps/mcp-server/src/` — entirely absent, not a SKILL_MANIFEST gap like 1872b. Needs BA scoping (tool spec + handler + storage + manifest + tests). Park as NEW-MEDIUM for next sprint.
- **F7 lock pattern**: 0 occurrences this cycle (pre-emptive `rm -f` held). 5 cycles tracked but no actual triggers — pattern may be self-clearing.
- **Worktree GC**: 4 worktrees still locked post-merge — will be GC'd by lifecycle. Verify next cycle.

## Sprint 1871 summary (all 7 tasks shipped)

7 architecture/code drift reconciliations now closed:
- D1 (counts: 132/59/62) ✓
- D2 (infrastructure/ tree 11 subdirs) ✓
- D3 (Module Boundaries 12 modules) ✓
- D4 (cron-registry 62 entries) ✓
- D5 (TNB get_agent_signals param) ✓
- D6 (IVnstockRepository DDD code-fixed) ✓
- D7 (alert-policy.md two-stage verdict flow) ✓

Reconciliation directions documented per task (5 doc-updated, 2 code-fixed). Divergence root-causes mostly trace to Sprint 1863/1864/1865 additions never re-syncing to docs (3-month doc-drift window).

## Current baseline

- **9168 pass / 12 fail / 38 skip** (authoritative main HEAD `98878473` per Tier-2 QA + post-merge)
- **23 pre-existing TSC errors** — UNCHANGED through all 7 1871 merges. **NEW finding for c35**: investigate + escalate as separate FIX-MEDIUM (likely 1873a candidate).
- toolCount=132, cronJobCount=59, schedulerFileCount=62 (now SSOT-aligned across ARCH + stats + registry)
- currentSprint=1874 (incremented; 1871 + 1872 fully closed)
- pipeline-state: idle

## Carry-over to Cycle 21

### New candidates (not yet PO-triaged)
- **1873a candidate** — 23 pre-existing TSC errors on main. Investigate scope, sprint-size, fix. Architect-tier scoping likely.
- **1872c candidate (carried)** — news-scout `update_analysis_brief` tool missing entirely. NEW-MEDIUM with BA scoping.
- **Error boundary upgrade** — cowork error boundary swallows Zod validation failures silently (1871e revealed this). Surface to WORK channel.
- **Signal re-fire dedup** — TNB + architect signals both re-fired this cycle. Drain-layer or TTL fix needed.
- **Worktree GC verification** — 4 worktrees locked post-merge; lifecycle should clean them. Verify.
- **agents-architect notebook commit** — no flow file; agent-father to add commit step at agent definition level (1872a tail).

### Ops-gated (unchanged)
- 1862c-D + 1862c-E — Cloudflare config
- 1862c-F + 1862c-G — rebuild + observation gated
- Reuters/TE 5-curl probe — ops to run
- 1862g news-scout dedup undeployed (re-verify)

### TNB c34 deferred findings (status)
- F1 → SHIPPED as 1872a (cycle 19)
- F2 → SHIPPED as 1872b (cycle 19)
- F3 → SHIPPED as 1871e (this cycle)
- F4 push-prices ASYNC — OPS-monitor only
- F5 get_unreviewed_market_messages 79k overflow — architect-tier deferred
- F6 climate/energy transient timeout — monitor (one-shot)
- F7 doc self-heal blocked — architectural
- F8 HEAD.lock recurrent — no triggers this cycle, pattern may be self-clearing
- F9 system-auditor silent — cron fire expected 16:00 UTC today (~6h)

### Monitoring (C-6 no re-trigger)
- 2833, 2834, 2836, 2839, 2841, 2842, 2845, 2847 (unchanged; 2839 = 1872c-candidate parked)

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, 59 cron keys, 62 scheduler files
- alertVerdictStore + verdictResolutionJob cron `7 * * * *` live; flow now correctly described in alert-policy.md (1871g)
- domain/ folder has 0 infrastructure/ imports after 1871f
- ARCHITECTURE.md fully reconciled with live code (Sprint 1871)
- cron-registry.json SSOT-aligned (Sprint 1871)
- All cowork notebook-writing flows have UTC + commit guard (1865a/b + 1869c + 1872a)
- alert-commander skill manifest now correctly includes write_alert_verdict (1872b)
- All 16 circuit breakers OK in DB

## Next-cycle intent (Cycle 21)

1. Drain new signals + reports (watch for re-fire pattern)
2. PO triage — scope 1873a (TSC errors) and 1872c (BA for update_analysis_brief tool)
3. Verify 4 worktrees auto-GC'd
4. Check 16:00 UTC system-auditor fire → F9 close-loop
5. Check if PO MARKET/WORK/BUG audit surfaces new issues

---

## Cycle 19 SHIPPED Sprint 1872 (2026-05-11 08:06 UTC)

| Task | Type | SHA | Result |
|------|------|-----|--------|
| 1872a | FIX-HIGH | `ca1bcba3` + `6cc76798` → merge `cd7fcc09` | TNB c34 F1 — extended 1865b notebook-commit pattern to 5 cowork flows (alert-commander, unified-agent, financial-analyst, tran-ngoc-bau, system-auditor). 3 already compliant (market-watcher, news-scout, qa-responder from 1865a/1869c). agents-architect deferred — no flow dir exists, recommend agent-father add inline at agent definition level. |
| 1872b | FIX-MEDIUM | `c838c8ca` → merge `fb2d6fd2` | TNB c34 F2 — alert-commander 06:04 UTC `write_alert_verdict` not-found root cause = **skill manifest gap, NOT missing tool**. Tool existed since Sprint 1863d but never added to `SKILL_MANIFEST["alert_commander"]` in `agentBootstrap.ts:115`. One-line array addition + 2 unit tests. |

## Cycle 19 process notes

- **Drained 2 signals** at Step 0a: TNB c34 audit-handoff (06:30 UTC) + architect 1871-batch (06:42 UTC). Routed to PO. Files moved to `docs/signals/processed/`.
- **PO BATCH return = [1872a, 1872b]** — 2 new entries from TNB c34 F1/F2. 1871a-g batch (7 SPRINT-S tasks) explicitly "carry forward" in Todo per architect brief sequencing — PO chose to focus this cycle on the fresh TNB findings, not the pre-scoped 1871 batch.
- **TNB c34 F3 = 1871e** (already queued) — no new action, close-loop confirmed.
- **TNB c34 F4 (push-prices ASYNC invisibility)** — OPS-monitor only, no batch. Defer.
- **F5/F6/F7/F8/F9** — LOW/architectural/cron-pending. No batch.
- **Sequencing:** 1872a + 1872b serialized because both potentially touch `.claude/flows/alert-commander/cycle.md`. After 1872b investigation chose path **a** (skill manifest only, no flow edit), no actual conflict materialized — but serialization held anyway.
- **Pattern reveal — same root cause:** 1872b's skill-manifest gap is the SAME class of bug as report 2839 (`update_analysis_brief` not found in news-scout). The tool likely exists; the news-scout SKILL_MANIFEST entry just misses it. → **1872c candidate** for next cycle.
- **F7 lock recurrence:** No HEAD.lock/index.lock issues this cycle (pre-emptive `rm -f` cleared before each commit). 4th cycle in a row tracking — pattern continues despite no triggers.
- **Baseline drift:** 9163/15 → 9295/16 → 9297/16. Drift confirmed pre-existing from sprints between cycle 18 and now. 1872a (0 code change) + 1872b (+2 tests) had zero regression.

## Carry-over to Cycle 20

### Already-scoped batch (architect-pre-planned) — needs PO BATCH next cycle
- **1871 batch (a-g)** — 7 SPRINT-S tasks in Todo from cycle 18 signal. Brief: `docs/architecture-briefs/2026-05-11-1871-reconciliation.md`. Sequencing:
  - Tier 1 parallel: 1871a (ARCH counts), 1871d (cron-registry), 1871e (get_agent_signals param), 1871g (alert-policy verdict)
  - Tier 2: 1871b (after 1871a — ARCH infra/ tree), 1871f (after 1871g — IVnstockRepository DDD)
  - Tier 3: 1871c (after 1871b — Module Boundaries)
- **1872c candidate (NEW)** — news-scout `update_analysis_brief` skill-manifest gap (TNB c34 F2 sibling pattern from report 2839). Likely same one-line fix in `agentBootstrap.ts` SKILL_MANIFEST. Verify before promoting to FIX.

### TNB c34 deferred findings (still in scope)
- F4 push-prices ASYNC market_prices invisibility (06:28:17 log error) — OPS-monitor, re-evaluate if persistent
- F5 `get_unreviewed_market_messages` 79k overflow — needs pagination/limit param (architect-tier)
- F6 `get_climate_risk` + `get_energy_grid` transient timeout — one-shot, monitor
- F7 doc self-heal blocked (architectural)
- F8 HEAD.lock recurrence — 4th cycle pattern; sandbox permission limitation
- F9 system-auditor silent — cron fire expected 16:00 UTC today (~8h ahead)

### Open candidates (not yet PO-triaged)
- **agents-architect notebook commit** — no flow file; agent-father to add commit step at agent definition level (1872a follow-up)
- **FPT income-statement split-label OCR limit** (carry from cycle 16) — architect-tier deferred

### Ops-gated (unchanged)
- 1862c-D + 1862c-E — Cloudflare config edits
- 1862c-F + 1862c-G — rebuild + observation gated
- Reuters/TE 5-curl probe — ops to run
- 1862g news-scout dedup — undeployed per c34 PO note (re-verify)

### Monitoring (C-6 no re-trigger)
- 2833, 2834, 2836, 2839, 2841, 2842, 2845, 2847 (unchanged from c18; 2839 now actionable as 1872c candidate)

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- **NEW**: All cowork notebook-writing flows now have explicit git-commit invariant (1872a — extends 1865b pattern from orchestrators to agents)
- **NEW**: alert-commander now has working `write_alert_verdict` via skill manifest fix (1872b)
- Adaptive price-drop threshold system live (Sprint 1869)
- FPT BCTC P_NET_PROFIT regex hardened (Sprint 1870)
- ALL known timestamp-writing surfaces have UTC guard (1865a/1869c/1865b chain)
- All 16 circuit breakers OK in DB

## Next-cycle intent (Cycle 20)

1. Drain new signals + reports
2. PO triage scans Todo → expect 1871a-g BATCH (architect brief already authoritative)
3. Verify report 2839 root cause matches 1872b pattern → if yes, append 1872c to batch (one-line skill manifest fix)
4. Execute Tier 1 of 1871 batch in parallel (4-way: a/d/e/g)
5. Watch for F7 HEAD.lock — 4th-cycle pattern, pre-emptive cleanup before each commit

---

## Cycle 18 IDLE (2026-05-11 06:32 UTC)

- 0 new telegram reports, 0 signals drained
- 8 unresolved reports — all `monitoring` (2833, 2834, 2836, 2839, 2841, 2842, 2845, 2847). C-6 guard active, no Step 1 re-entry.
- Branches: only `main`. Baseline 9163/15.
- **c34 PO-ACK gap mitigation verified:** `docs/handoffs/tnb-audit-latest.md` ACK section persists in git via `ba55819e` (cycle 17 close commit). The fix landed — no overwrite/loss recurrence.
- **1870b regex fix validated post-hoc:** New BCTC report 2848 (2026-05-11T04:43:30Z FPT) resolved as `fixed` at 05:15 UTC. Confirms P_NET_PROFIT retained-earnings exclusion is working in prod pipeline. Stale 2841 (FPT) + 2842 (VNM) remain monitoring; will auto-expire at 72h (~13:06 UTC on 2026-05-13).
- **Reuters/TE probe:** still pending ops.
- **system-auditor 16:00 UTC:** still ahead (~9.5h).

No notebook rewrite — appended idle entry only.

---

## Cycle 17 SHIPPED Sprint 1871 (2026-05-11)

| Task | Type | SHA | Result |
|------|------|-----|--------|
| 1865b | FIX-LOW | `daec15ac` (merge `8a334edc`) + `29ba7409` (TASKS) | Extended 1865a/1869c UTC guard to dev-team + PO orchestrator writes. `.claude/flows/dev-team/main.md` +11 lines (covers pipeline-state.json + notebooks/main.md). `.claude/flows/po/main.md` +11 lines (covers po notebook + handoff ACK `At:` fields). No code, no tests, no rebuild. Flow-doc-only. |

## Cycle 17 key insights

**Re-fire of TNB c33 signal exposed PO-ACK-not-committed flow gap.** At 05:13 UTC, `docs/handoffs/tnb-audit-latest.md` was overwritten (likely by TNB cycle re-running its template), erasing PO's cycle-15 ACK appendix that was on disk only — NEVER git-committed. PO re-appended ACK with note this cycle; dev-team close will commit it this time. Surface flagged for TNB c34: dev-team flow / PO flow should commit handoff ACK appendices to git, not leave on disk.

**1865b closes the last unguarded timestamp-writing surface.** Prior fixes:
- 1865a: market-watcher (sessions + notebook)
- 1869c: news-scout (sessions + notebook) + qa-responder (notebook)
- 1865b: dev-team orchestrator (pipeline-state.json + notebooks/main.md) + po orchestrator (po notebook + handoff ACKs)

After 1865b, all known timestamp-writing surfaces have explicit UTC guard. TNB c34 finding F2 (H1-future recurrence) should self-clear if no new agent surfaces emerge.

**Dog-fooded the new guard immediately.** This notebook header `**Written:** 2026-05-11 05:35 UTC` and pipeline-state.json `updatedAt: 2026-05-11T05:35:30Z` both came from `date -u +"%Y-%m-%dT%H:%M:%SZ"` returning `2026-05-11T05:35:30Z` at write time. Compare to cycle 15 close where I picked 04:55 UTC speculatively against actual 04:38 UTC (the bug 1865b fixes).

**Cycle 16 forced no c33 retriage need.** Cycle 16 shipped Sprint 1870 (FPT BCTC regex) independently of c33 findings. By cycle 17, all c33 findings were already in their final disposition (F2 + F5 shipped; F1/F4/F6-F9 deferred). PO retriage was a no-op — just re-confirmation of prior decisions plus the new c34 finding.

## Current baseline

- **9163 pass / 15 fail** (unchanged — 1865b is doc-only)
- toolCount=132, totalTasksDone=563 (+1 this cycle: 1865b)
- currentSprint=1872 (incremented; 1871 closed)
- pipeline-state: idle
- Todo: 1862c-D/E/F/G (ops-gated, unchanged)
- Branches: only `main` (cleaned 1865b inline)

## Carry-over to Cycle 18

### Open candidates (not yet PO-triaged)
- **PO-ACK-not-committed flow gap** — recommend dev-team or PO flow auto-commits handoff ACK appendix after PO close. Owner: agent-father. Likely FIX-LOW.
- **FPT income-statement split-label OCR limit** (carry from cycle 16) — narrative-paragraph numeric extraction. SPRINT-S minimum, needs architect.

### Ops-gated (unchanged)
- **1862c-D + 1862c-E** — Cloudflare config edits
- **1862c-F + 1862c-G** — rebuild + observation gated
- **Reuters/TE 5-curl probe** — ops to run

### Monitoring (C-6 no re-trigger)
- 2833, 2834, 2836, 2839, 2841, 2842, 2845, 2847
- 2841/2842 may auto-clear when BCTC pipeline recomputes confidence on next reparse (1870b fix landed)

### TNB c33 deferred findings (still in scope for future cycles)
- F1 Reuters/TE config gate — awaiting ops probe
- F4 system-auditor stale — cron re-registered c14, next fire 16:00 UTC today (~10.5h)
- F6 VPB price_anomaly emission gap
- F7 HEAD.lock retry
- F8 get_agent_signals param
- F9 doc self-heal

## Cycle 17 process notes

- Cycle started with TNB c33 signal RE-FIRED (handoff overwritten 05:13 UTC, prior PO ACK lost on-disk only).
- PO retriage was abbreviated — recognized prior c33 actioning + flagged c34 candidate.
- Single dispatch: BATCH(1865b) FIX-LOW → agent-father.
- 1865b is the FOURTH iteration of the UTC guard pattern (1865a → 1869c → 1865b — each one extending coverage to new surfaces).
- Skipped QA — flow-doc-only edit; agent-father's TDD ethos applies even to docs.
- Inline branch cleanup.
- Dog-fooded 1865b on this very cycle close (using `date -u` for all stamps).

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- Adaptive price-drop threshold system live (Sprint 1869)
- FPT BCTC P_NET_PROFIT regex hardened (Sprint 1870)
- **NEW**: ALL known timestamp-writing surfaces have UTC guard (1865a/1869c/1865b chain)
- All 16 circuit breakers OK in DB

## Next-cycle intent (Cycle 18)

1. Drain new signals + reports
2. Verify the PO-ACK-not-committed gap doesn't recur (i.e., this cycle's handoff commit IS persisting)
3. Check if Reuters/TE 5-curl probe verdict published → F1 dispatch
4. Check system-auditor 16:00 UTC fire → F4 self-clear or escalate
5. Check FPT BCTC 2841 + VNM 2842 auto-clear status (post-1870b)
6. Idle if no new dev-actionable work
