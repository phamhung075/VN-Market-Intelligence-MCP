<!-- size-justification: 420L — full next-level blueprint: 3 structural constraints with board evidence, 8 capability moves, phased plan with risk/effort, prerequisite vs parallel classification. Each section load-bearing for PO sprint planning. -->
# Next-Level Architecture Blueprint — 2026-06-22

**Author:** architect
**Status:** FINAL — hand-off to PO for sprint dispatch
**Scope:** Structural constraints + capability foundation moves for next-level evolution
**Standing goals addressed:**
  - Goal 1: NO fake data — real fetch only
  - Goal 2: FB post = expert decision-grade synthesis
  - Goal 3: ALL info source-linked + expand to full fetched detail

---

## Part 1 — The Three Structural Constraints

These are the three hardest walls the project is running into. Everything else is debt on top of them.

---

### Constraint 1 — mcp-server runtime instability caps everything above it

**Evidence (board-confirmed):**

- `FIX-MCP-MEMORY-CODE-LEAK` (TODO, priority=high): server accumulates 87% RAM in 12h from a 5% fresh start. Docker OOM-kill is the confirmed hypothesis.
- `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` (BACKLOG, P2): 30/61 restarts in 7 days were unclean (49%). Unclean shutdowns trigger Bun-JIT corruption, orphan task locks, mid-aggregator row drops, WAL truncation races.
- `ARCH-CRON-SCHEDULER-RELIABILITY` brief (2026-06-14): 3 confirmed-dead cron jobs — `vnstockFundamentalsRefresh` (dead since 2026-06-08), `ohlcvDailyAggregatorJob` (missed 2026-06-13), `reputationComputeJob` — caused by node-cron tick drops under event-loop saturation. The four-lever fix (uniform `recoverMissedExecutions`, T4 idempotency guards, jitter, watchdog) is designed but BLOCKED on FIX-MCP-CRASH-LOOP-WRITEWAL landing first.
- `FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE` (2026-06-21): two parallel TA compute paths (TS-local vs Go service) produce divergent RSI values because the assembler path still uses the deprecated TS-local engine and a different candle window construction. Symptom of the underlying code-health deficit.

**Impact on goals:** every upstream pipeline that feeds Goal 2 (FB synthesis) and Goal 3 (source-linked data) runs on cron jobs. Silent tick-drops mean the intelligence layer arrives stale or missing. An OOM-killed server means in-flight briefing assembly is dropped mid-write.

---

### Constraint 2 — Gateway-blind local subagents cap cowork throughput to cloud-only

**Evidence (board-confirmed):**

- `.mcp.json` is `{"mcpServers": {}}` — confirmed live. All locally-spawned Agent subagents are gateway-blind.
- `feedback_local_cowork_subagents_gateway_blind` (MEMORY): fabrication confirmed live 2026-06-18 (blind news-scout wrote fake sentiment into 5 briefs and stamped all 62 tickers in `coverage-state.json`).
- `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST` (BACKLOG, priority=high): cloud RemoteTrigger backstop slots also have no `call_tool` surface — `send_telegram` silently no-posts from cloud headless sessions.
- `cowork-blind-session-guard` brief (2026-06-18): fix designed (blind-guard.md + spawn-fanout.md Step 5.0 gate); implementation delegated to agent-father; not yet confirmed shipped.
- `FIX-CADENCE-COWORK-DUP-MARKET-WATCHER` (BACKLOG): duplicate market-watcher firings from both CLI dispatcher and cloud backstop — symptom of the same two-path problem.

**Impact on goals:** local-run cowork slots that lack cloud backstops (any `trigger_id: null` slot) produce fabricated or silent outputs when the CLI session is gateway-blind. The five guaranteed slots (`chef-morning`, `chef-eod`, `chef-evening`, `digest-sunday`, `tnb-audit`) had their RemoteTriggers deleted (`trigger_status: deleted`). Goal 2 (FB expert synthesis) depends on CHEF EOD dish quality; Goal 1 (no fake data) is directly violated when blind agents fabricate.

---

### Constraint 3 — 102 FACTORY P0/P1 code-debt items block maintainability and cap safe iteration velocity

**Evidence (board-confirmed):**

- 102 FACTORY-* tasks in backlog: 11 P0, 38 P1, 44 P2, 9 P3.
- P0 examples: `FACTORY-DOMAIN-split-cascade-engine`, `FACTORY-APP-split-pollNews`, `FACTORY-APP-split-assembleBriefing`, `FACTORY-INTERFACE-split-server-ts`, `FACTORY-ALERT-consolidate-dual-engines`, `FACTORY-INFRA-split-agentSignalStore`.
- `assembleBriefing.ts` is a monolith that houses the stale TS-local RSI engine (confirmed root in FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE brief) — every sprint that touches briefing synthesis has to navigate this file.
- `FACTORY-ALERT-consolidate-dual-engines` (P0): two alert engines running in parallel with no canonical authority — alert dedup, accuracy, and quality metrics are unreliable until consolidated.
- `FACTORY-SCHEDULER-split-intelligenceCycleJob` and `FACTORY-SCHEDULER-split-dataAuditJob` (both P0): monolithic scheduler jobs that run mixed concerns, making tick-drop debugging and idempotency hardening (from Constraint 1 fix) harder to apply atomically.
- Dead code confirmed live: `FACTORY-MACRO-delete-dead-ts-tree` (P1), `FACTORY-TECHANALYSIS-delete-orphaned-ts-service` (P1), `FACTORY-KINHDICH-delete-deprecated-ts-tree` (P1) — stale TS trees from the Go migration remain in the repo, polluting imports, slowing tsc, and creating false-similarity traps when searching code.

**Impact on goals:** every new capability (deep-fetch, hybrid RAG, FB prediction loop) must be layered on top of unstable foundations. A split `assembleBriefing.ts` is a prerequisite for the FB synthesis upgrade. A consolidated alert engine is a prerequisite for reliable Goal 3 signal accuracy cards.

---

## Part 2 — The Eight Highest-Leverage Moves

### Move 1 (PREREQUISITE — Constraint 1) — Fix mcp-server memory leak and restart churn

**What:** Profile and fix the process-level memory accumulation in mcp-server (87% in 12h). Instrument with `process.memoryUsage()` checkpoints at scheduler boundaries. Most likely candidates: LanceDB in-process vector cache not bounded, RAG embedding model loaded per-request rather than once, or a circular reference in the session tool cache.

**Why now:** until memory is bounded, the four-lever scheduler reliability fix (`ARCH-CRON-SCHEDULER-RELIABILITY`) cannot ship safely — restarts clear in-process idempotency state mid-fix.

**Effort:** S–M (profile + patch). Risk: Medium (needs live heap snapshot to confirm root without guessing).

**Files:** `apps/mcp-server/src/infrastructure/rag/vectorstore.ts`, `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts`, `apps/mcp-server/src/infrastructure/rag/embeddings.ts`.

---

### Move 2 (PREREQUISITE — Constraint 1) — Ship ARCH-CRON-SCHEDULER-RELIABILITY

**What:** Apply the four levers defined in the 2026-06-14 brief: T4 idempotency guards → uniform `recoverMissedExecutions: true` → deterministic jitter for 8 high-collision jobs → `schedulerWatchdogJob.ts`. Resurrect the 3 confirmed-dead jobs.

**Why now:** silent tick-drops are a direct cause of stale intelligence reaching both the FB poster and the dashboard. The watchdog provides the system's first self-healing scheduler layer.

**Effort:** M. Risk: High for Phase 1a (T4 guards must ship before `recoverMissedExecutions` to prevent double-Telegram). Sequential: 1a → 1b → 1c → watchdog.

**Dependency:** Move 1 must land first (IMPL gate: R-5 in the brief).

---

### Move 3 (PREREQUISITE — Constraint 2) — Register gateway in .mcp.json + ship blind-guard.md

**What (part A):** User-action: register the gateway MCP server in `.mcp.json` so locally-spawned subagents inherit `mcp__gateway__call_tool`. This is a single-line JSON change but requires a CLI reconnect.

**What (part B):** Ship the `cowork-blind-session-guard` brief (agent-father): `blind-guard.md` Step 0c + `spawn-fanout.md` Step 5.0 gate. Prevents fabrication when `.mcp.json` is empty (session restart safety).

**What (part C):** Restore the 5 deleted RemoteTrigger backstops per `cowork-guaranteed-backstop` brief (2026-06-13). Confirmed: all 5 have `trigger_status: deleted`.

**Why now:** Goal 1 is directly violated in every blind-session cowork tick. The FB poster's input quality (Goal 2) depends on CHEF EOD dish quality, which runs on the same pipeline.

**Effort:** Part A = XS (user action). Part B = S (agent-father). Part C = S (PO or router re-creates 5 RemoteTriggers). Risk: Low for B and C. Part A risk = medium (reconnect may surface other tool surface issues).

---

### Move 4 (FOUNDATION — all goals) — Split FACTORY P0 monoliths

**What:** Ship the 11 P0 FACTORY tasks as a dedicated sprint, in two batches:
- Batch 1 (domain + app layer): `FACTORY-DOMAIN-split-cascade-engine`, `FACTORY-APP-split-pollNews`, `FACTORY-APP-split-assembleBriefing`, `FACTORY-INFRA-split-agentSignalStore`.
- Batch 2 (interface + alert): `FACTORY-INTERFACE-split-server-ts`, `FACTORY-ALERT-consolidate-dual-engines`, `FACTORY-INTERFACE-confidence-score-50-mask`, `FACTORY-INFRA-agentsignal-confidence-50-default`.

Delete confirmed-dead stale TS trees in the same sprint: `FACTORY-MACRO-delete-dead-ts-tree`, `FACTORY-TECHANALYSIS-delete-orphaned-ts-service`, `FACTORY-KINHDICH-delete-deprecated-ts-tree`.

**Why now:** `assembleBriefing.ts` split is a direct prerequisite for Move 5 (FB synthesis upgrade). The dual-alert-engine consolidation is a prerequisite for Move 7 (source-linked signal accuracy cards). Removing dead TS trees reduces tsc time and false-positive code search hits.

**Effort:** M–L (102 tasks; batch them; 11 P0 = 1 sprint). Risk: Medium (merge surface is large; PM must enforce strict task atomicity).

---

### Move 5 (CAPABILITY — Goal 2) — Ship FB-POSTER-TNB-UPGRADE

**What:** Ship the TNB 6-layer upgrade to `docs/agents/fb-market-poster/flow/main.md` per the 2026-06-16 brief. Insert STEP 2b (TNB top-down causal walk) + STEP 2c (T-45 adversarial gate) + per-ticker conviction schema. Enforce that CHEF silent = independent full-walk (not fallback to recap).

Ship also the 5 pending fb-gate sub-fixes: `FIX-FB-GATE-CURRENCY-UNIT-GUARD` (P1), `FIX-FB-GATE-POINT-PCT-MATH`, `FIX-FB-GATE-STALE-MACRO-GUARD`, `FIX-FB-GATE-BREADTH-PCT-INTERNAL`, `FIX-FB-GATE-WEEKLY-FRAME-MODE`.

Fix `FIX-FBPOSTER-SENTIMENT-TREND-BARE-CALL` (P3): `get_sentiment_trend` is called with empty args, silently failing every cycle — the sentiment signal has been blind throughout.

**Why now:** Goal 2 is defined and unmet. The brief proves the methodology gap (not a data gap) is the root cause. The manual walkthrough confirmed a materially better post from the same data.

**Dependency:** Move 4 Batch 1 (`assembleBriefing.ts` split) should land first, but is not strictly blocking — the fb-poster flow is in `docs/agents/fb-market-poster/flow/` (agent-father zone), independent of the TypeScript refactor.

**Effort:** S (agent-father for flow .md + scripts for gates). Risk: Low.

---

### Move 6 (CAPABILITY — Goal 3) — Deep-fetch + hybrid RAG upgrade

**What:** Ship `ARCH-DEEPFETCH-RAG-REDESIGN` (brief: 2026-06-08). Two pillars:
- Pillar A: wire `article-body-fetcher.py` (exists on VPS, currently unused) into the push pipeline for domain-relevant RSS items (watchlist ticker or sector match). No browser engine needed — plain requests + BeautifulSoup covers the primary sources.
- Pillar B: extend LanceDB schema with domain-awareness fields (`ticker`, `sector`, `source`, `depth_tier`, `doc_type`, `confidence`, `published_at`) + add BM25 hybrid scoring alongside vector similarity. Differentiated decay half-lives (fast-decay for news, slow-decay for filings).

**Why now:** today every consumer (news-scout, market-watcher, BCTC analyst, unified-agent) retrieves from the same undifferentiated 80–400-char RSS snippet index. Deep-fetch directly upgrades the raw input quality for Goal 2 (FB synthesis) and Goal 3 (expandable source detail).

**Dependency:** Move 3 (gateway registered) so local dev agents can verify live. Move 4 Batch 1 (`pollNews.ts` split) makes Pillar B schema migration safer.

**Effort:** M (VPS wiring is S; RAG schema migration is M; hybrid search is S on top of existing LanceDB). Risk: Medium (LanceDB schema migration needs careful rollout; existing 226-item/cycle throughput must not regress).

---

### Move 7 (CAPABILITY — Goal 3) — Source-link + expand-to-full-detail on dashboard signals

**What:** This is the `INFOCARD-EXPAND-FETCH` epic. Three sub-components:
1. Backend: `cascade-signals` endpoint currently flattens `finding_data` to a `detail` string — extend it to pass the full object through. Similarly for `agent_signals` the `finding_data` column must survive the `toAgentSignal` mapper.
2. Frontend: `InfoCardExpand` primitive exists (shipped by dev-frontend in `FIX-INFOCARD-DROPDOWN-EXPAND`). Wire it to the now-full `findingData` field across ALL card types (not just MacroImpactPanel and StockSignalsPanel — every card type).
3. Source provenance: every served signal must carry `source_url` and render it as a clickable link. `get_agent_signals` already has `source` field; confirm it is non-null for all producers.

**Dependency:** Move 4 Batch 2 (`FACTORY-ALERT-consolidate-dual-engines`, `FACTORY-INFRA-agentsignal-confidence-50-default`) — until alerts are on a single engine, the confidence and source fields cannot be reliably non-null.

**Effort:** M (backend change to cascade endpoint is S; frontend wiring across all card types is S–M; provenance audit per signal producer is M). Risk: Low-Medium.

---

### Move 8 (CAPABILITY — future) — Tiered BCTC pipeline durability + prediction calibration loop

**What:**
- Part A: Ship BCTC pipeline durability contracts (2026-06-16 brief): consecutive-zero counter + escalation (Contract 1), freshness gate with `latestTimestampSql` replacing `passive: true` (Contract 2), enrich fail-loud production wiring verification (Contract 3). Board items: `FIX-BCTC-QUEUE-MAXAGE-GATE`, `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH`.
- Part B: Ship `FIX-FB-PREDICTION-CALIBRATION-LOOP`: auto prediction-calibration ledger — fb-poster logs forward calls, digest-predict weekly auto-scores hit/miss. This closes the feedback loop that makes Goal 2 posts self-improving over time.

**Dependency:** Move 1 + Move 2 (stable scheduler is required for any BCTC enricher job fix to hold). Move 5 (FB poster upgrade ships first; calibration loop is the follow-on that measures it).

**Effort:** M. Risk: Low-Medium.

---

## Part 3 — Phased Blueprint

### Phase 1 — Foundations (unblock everything else)

Goal: eliminate the two active reliability drains and the gateway-blind fabrication risk.

| Task | Move | Owner | Parallel? |
|---|---|---|---|
| Profile + fix mcp-server memory leak | Move 1 | dev-mcp-server | START |
| User registers gateway in .mcp.json | Move 3A | user | START (independent) |
| Ship blind-guard.md + spawn-fanout gate | Move 3B | agent-father | After Move 3A |
| Restore 5 deleted RemoteTrigger backstops | Move 3C | PO / router | After Move 3A |
| Ship ARCH-CRON-SCHEDULER-RELIABILITY (4-lever) | Move 2 | dev-mcp-server | After Move 1 |

**Exit gate for Phase 1:** mcp-server memory stable (no OOM-kill in 48h); all 3 confirmed-dead cron jobs auto-firing; `.mcp.json` registered; blind-guard live; 5 guaranteed backstops restored.

---

### Phase 2 — Code foundations (enable safe capability work)

Goal: split monoliths, delete dead code, consolidate dual engines.

| Task | Move | Owner | Parallel? |
|---|---|---|---|
| FACTORY P0 Batch 1 (cascade, pollNews, assembleBriefing, agentSignalStore) | Move 4 | dev-mcp-server | START |
| FACTORY P0 Batch 2 (server.ts, alert engine consolidation, confidence masks) | Move 4 | dev-mcp-server | After Batch 1 |
| Delete dead TS trees (macro, technical-analysis, kinhdich) | Move 4 | dev-mcp-server | Parallel with Batch 1 |

**Exit gate for Phase 2:** `assembleBriefing.ts` split clean; single alert engine; zero dead TS trees in apps/; test baseline not regressed.

---

### Phase 3 — Capability layer (ship the three goals)

Goal: the three standing goals become verifiably met.

| Task | Move | Owner | Parallel? |
|---|---|---|---|
| FB-POSTER-TNB-UPGRADE + 5 gate fixes + sentiment-trend fix | Move 5 | agent-father | START (independent of Phase 2 for flow .md; gates need scripts) |
| Deep-fetch VPS wiring (Pillar A) | Move 6 | dev-vps-crawls | START (can run alongside Phase 2) |
| RAG hybrid schema + BM25 (Pillar B) | Move 6 | dev-mcp-server | After Phase 2 Batch 1 (pollNews split) |
| Source-link + expand backend (cascade + agent_signals) | Move 7 | dev-mcp-server | After Phase 2 Batch 2 (alert consolidation) |
| Source-link + expand frontend wiring | Move 7 | dev-frontend | After backend source-link fix |
| BCTC pipeline durability contracts | Move 8A | dev-mcp-server + dev-vps-crawls | After Phase 1 |
| FB prediction calibration loop | Move 8B | agent-father | After Move 5 ship and 5 posts measured |

**Exit gate for Phase 3:** Live FB post meets TNB 6-layer bar verified by T-45 adversarial pass; dashboard signal cards carry source link + expandable full-detail; RAG retrieval serves article body not RSS snippet for domain-relevant news; BCTC pipeline alerts within 30 min of a zero-URL outage.

---

## Part 4 — Prerequisite vs Parallelizable Classification

### Hard prerequisites (blocking order)

```
Move 1 (memory fix) → Move 2 (scheduler reliability)
Move 3A (user: .mcp.json) → Move 3B (blind-guard) + Move 3C (backstops)
Move 4 Batch 1 → Move 4 Batch 2
Move 4 Batch 1 → Move 6 Pillar B (RAG schema)
Move 4 Batch 2 → Move 7 backend (alert engine must be single)
Move 7 backend → Move 7 frontend
Move 5 (TNB upgrade) → Move 8B (calibration loop)
Move 1 + Move 2 → Move 8A (BCTC durability, scheduler must be stable)
```

### Parallelizable (can run concurrently)

- Move 3A is user-action, independent of all agent work — execute immediately.
- Move 5 (FB flow .md upgrade, agent-father zone) is independent of Phase 2 TypeScript work — can start in parallel with Phase 2.
- Move 6 Pillar A (VPS wiring, dev-vps-crawls zone) is independent of Phase 2 — can start now.
- Deleting dead TS trees (Move 4 clean step) is parallel with Batch 1 splits — different files, no merge conflict surface.
- Move 8A BCTC durability (scheduler + VPS zone) can start after Phase 1 exits, parallel with Phase 3 capability work.

---

## Part 5 — Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Memory fix requires heap profiling under live load — root may be multi-source | HIGH | Timebox to 1 sprint; if no root found in 2 sprints, cap container memory and treat OOM as an acceptable restart (add WAL checkpoint before SIGTERM) |
| Move 2 T4 dedup guards must ship BEFORE `recoverMissedExecutions: true` — sequence violation causes double-Telegram | HIGH | PM enforces Phase 1a → 1b hard sequencing in task decomposition |
| Move 4 Batch 1 has large merge surface (cascade-engine, pollNews, assembleBriefing are all high-traffic files) | MEDIUM | One file per task; dev-mcp-server uses atomic task boundary per FACTORY brief |
| Move 3A (.mcp.json registration) may expose previously-silent tool name conflicts or rate limits in the gateway surface | MEDIUM | Run list_server_tools immediately after reconnect; compare against known 166-tool inventory |
| Phase 3 RAG schema migration (Pillar B) requires backfilling domain-awareness fields into existing LanceDB entries | MEDIUM | Migration is additive (new columns, not replacing); existing entries get `depth_tier=shallow`; no data loss |
| Move 5 FB-POSTER-TNB-UPGRADE ships independently before Phase 2 — the flow calls `assembleBriefing`-produced notebooks as input; if the split lands later and changes notebook format, the flow may need a minor re-read update | LOW | fb-market-poster reads notebook files by filename only; format change risk is low |

---

*Authored: 2026-06-22 | Zone: docs/architecture-briefs/ | Hand-off: PO for sprint planning*
