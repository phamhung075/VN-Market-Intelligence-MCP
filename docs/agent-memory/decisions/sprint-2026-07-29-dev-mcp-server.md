# Decision Journal — Sprint 2026-07-29 · dev-mcp-server

**Sprint goal:** no active sprint scoped to this task — ambient BOUNDED-1 auto-pickup (date-fallback journal id per decision-journal SKILL § Resolve Sprint ID).
**Agent:** dev-mcp-server
**Started:** 2026-07-29T04:47:29Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-29T05:00:00Z
**task-id:** FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
**what-done:** RAW-verified LIVE (named-volume market_data, docker exec, read-only bun:sqlite): current total=202 rows, ALL-TIME identical dup-groups (from_agent,signal_type,stock_code,minute,payload)=0, ACTIVE-24h dup-groups=0 — the 2026-06-25 finding (102 all-time / 43 active-24h) is stale, rows expired via TTL + cleanExpired GC.
**what-considered:**
- Trust the month-old finding as-is vs re-verify — chose re-verify per corroboration convention (feedback_false_infra_failure_corroboration_gate).
- 0 current dup-groups could mean "already fixed" or "TTL-purged, mechanism still live" — checked cron_job_runs (7d): 41 distinct job names multi-fire within the same scheduled minute (2702 job/minute pairs), including freshnessSlaMonitorJob (10x) and intelligenceCycleJob (35x) — confirms the underlying re-entrancy mechanism (broader than FIX-SCHEDULER-DOUBLE-REGISTRATION's originally-scoped 2 jobs) is still live today.
**why-decision:** 0-count does not retire the mandate — PO's item 2 is "MUST" build the permanent backstop regardless of current count; proceeded to implement.
**why-change:** none from mandate — confirms rather than contradicts the premise.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-29T05:05:00Z
**task-id:** FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
**what-done:** Implemented data-layer backstop: partial `CREATE UNIQUE INDEX idx_agent_signals_dedup_identical ON agent_signals(from_agent, signal_type, COALESCE(stock_code,''), payload, substr(created_at,1,16)) WHERE payload != '{}'` (schema-news.ts) + `INSERT OR IGNORE` on all 10 INSERT variants in `_postSignalInner` (agentSignalStore.ts), returning -1 (existing suppression sentinel) via new `resolveInsertId()` helper when `changes===0`.
**what-considered:**
- Literal PO key (from_agent,signal_type,stock_code,payload,minute) with NO exclusion vs partial index excluding `payload='{}'`.
- RAW-checked live: payload='{}' is used EXCLUSIVELY by alert-engine|verified_decision (51/202 rows) — alertStore.ts's correlation-stub co-write, which ALREADY has a precise alert_id-scoped dedup guard (FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID, done-live-verified). Applying the coarse key there too would risk silently dropping a legitimate 2nd correlation stub when 2 DIFFERENT real alerts (e.g. one TA + one BB) fire for the same stock in the same minute, since payload carries zero differentiating content for that emitter.
**why-decision:** excluded payload='{}' via partial index WHERE clause — avoids a silent correctness regression on the one emitter whose payload is a designed constant, while still catching the general case (rich-payload emitters: freshness-sla-monitor, news-scout, bctc-analyst, system-auditor, market-watcher) where payload IS the differentiating signal. Verified live: 0 candidate violations of the partial index at CREATE time (safe to deploy).
**why-change:** deviates from the LITERAL mandate text (which didn't anticipate the payload='{}' correlation-stub pattern) — documented here per DJ-GATE-1 as the reasoned justification; not scope creep, a correctness safeguard.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-29T05:15:00Z
**task-id:** FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
**what-done:** Per-emitter root-cause (mandate item 3, in-zone only). freshness-sla-monitor: code review confirms every escalateToCommander()/coverage-map postSignal() call embeds a fresh millisecond `timestamp` in payload (present since file creation, predates the 06-25 finding) — structurally cannot produce byte-identical duplicate payloads even under scheduler re-entrancy; does NOT share r2's defect class in a way that reproduces THIS symptom. system-auditor/news-scout/bctc-analyst: post via the generic `post_agent_signal` MCP tool from cowork-agent sessions OUTSIDE mcp-server's process — any double-CALL root cause is in their own agent flow (out of dev-mcp-server zone per boundary_rules) — noted, not fixed. alert-engine (NOT one cowork agent — 8 mcp-server scheduler call sites sharing the `from_agent='alert-engine'` correlation-stub tag): 7/8 already use deterministic alert ids (taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob/predictionMarketJob/intelligenceCycleJob), safe under re-entrancy. `scanMarket.ts` (via `alertGenerator.ts`'s `chooseAlertId` "otherwise" fallback) used a random id with NO fingerprint — `computeAlertFingerprint` existed in alertDedup.ts with ZERO production callers (dead/unwired). Fixed: added `computeGenericAlertFingerprint` (minute-bucket, content-keyed) and wired it into `generateAlerts()` unconditionally, feeding the EXISTING `alerts.fingerprint` UNIQUE gate.
**what-considered:**
- Leave scanMarket.ts gap as a noted finding only (out of P2 scope) vs fix it.
- Reuse the existing (unwired) `computeAlertFingerprint` as-is — rejected: it has NO time-bucket, would permanently collapse a legitimately-recurring same-content alert on a LATER day (regression risk).
**why-decision:** fixed — it is squarely in-zone (apps/mcp-server/src/domain/services/), low-risk (additive field, existing unit-tested fingerprint module), and is the most plausible concrete root cause of the cited historical DPM 0.9s-apart sample (mandate explicitly asks to "add idempotent dedup at emission" for in-zone paths). New `computeGenericAlertFingerprint` deliberately uses a NARROW minute-bucket (unlike `computeScanAlertFingerprint`'s day-bucket) so genuinely-recurring one-time events on a later cycle are never suppressed.
**why-change:** none from mandate — this is exactly the "PER-EMITTER ROOT-CAUSE... mcp-server scheduler path" ask, applied to the specific code path that actually lacked protection.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-29T05:20:00Z
**task-id:** FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
**what-done:** VERIFY-DON'T-CLAIM (mandate item 4): traced `verified_decision` consumers. `from_agent='alert-engine'` rows are a write-only correlation stub (payload always `{}`, consumed only by the C-08 orphan-audit check via `alert_id`) — the real Telegram/MARKET dispatch is driven directly from the `alerts` table by `alert-commander` (a SEPARATE `verified_decision` emission path, `from_agent='alert-commander'` per its own init.md, broadcast AFTER it fires/suppresses — not what the PO's dedup count measured). `stockSignalsHandler.ts` explicitly drops empty verified_decision rows from at least one display path, corroborating zero downstream consumer keys off payload content here.
**what-considered:** escalate severity to HIGH (per mandate's conditional) vs hold at P2.
**why-decision:** held at P2 — duplicate alert-engine correlation-stub rows do NOT trigger any Telegram/MARKET send; worst-case impact of a duplicate is a harmless extra DB row (now also closed by S3's fingerprint fix). No user-facing double-alert risk confirmed.
**why-change:** none — mandate explicitly says only escalate if genuinely confirmed; it was not.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-29T05:32:00Z
**task-id:** FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
**what-done:** G12 evidence. Targeted suites (agentSignalStore/alertGenerator/alertDedup/alertStore + new test file) 114/114 pass. `bun tsc --noEmit` clean. `gen-project-stats --dry-run`: toolCount=184/cronJobCount=88 unchanged. Live boot (fresh `:memory:` instance, PORT=3098): `/health` toolCount=184, `/api/bctc-inspect`+`/dashboards/news-fetch/` 200. Full `bun test`: 14886 pass/40 skip/54 fail/1238 files (570s) — matches the standing `FIX-MCP-SUITE-HEALTH-BASELINE` band exactly (a same-day sibling task logged 54 fail with an identical baseline); zero failures reference agent_signals/agentSignalStore/alertGenerator/alertDedup/schema-news/verified_decision/dedup_identical.
**what-considered:** re-run a full git-stash A/B (revert my 4 files, re-run whole 9.5min suite) vs rely on targeted-suite 0-fail + keyword-scan of the full-suite failure list + same-day sibling-task baseline match.
**why-decision:** relied on the latter — CANONICAL pinned policy (`dev-standards.md` § Autonomous Push Gate, `BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA`) states the real gate is the targeted/merge-gate suite, not a literal full-suite 0-fail (permanently unsatisfiable at this repo's scale); the full run was for transparency/context, already sufficiently corroborated without a second 9.5-minute run.
**why-change:** none — task carries `REBUILD_REQUIRED: true` (apps/mcp-server/src/ is Docker-image-baked); held REVIEW/next_agent=ops per the Docker Microservice Code-Change Close Gate (matches this same session's FIX-SCHEDULER-DOUBLE-REGISTRATION precedent), not self-closed to qa directly.
