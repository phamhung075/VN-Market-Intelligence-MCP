# PO Notebook

_Last: 2026-07-02T19:00Z_

## Tick 2026-07-02T18:37Z — dev-team triage: architect recon-return + 6 signals → BATCH(1 FIX)

**Inputs:** pendingSignals=6; telegram(new)=2 (A-30 mem 17:16Z, A-13 api-gateway 18:17Z); list_unresolved=[same 2]; head idle; WIP: in_progress=1 (parked enricher, untouched), ready was 1 (mem-leak). TNB=c103 (06-30, chain ACK'd; stale, not re-processed). ARCHITECT returned FIX-MCP-MEMORY-CODE-LEAK phase-0 recon (d028803e, brief 2026-07-02-mcp-mem-sawtooth-recon.md).

**MEM-LEAK recon disposition (TWO-TRACK):** Architect found (a) image 6-commits stale but NONE mem-relevant → rebuild=owed hygiene not the fix; (b) 2GB cap tight, host 4.37GiB free → bump 3GiB; (c) CONCRETE hotspot: initDatabase() (schema.ts:148) no already-init guard, awaited at 68 tool-handler call-sites → full ~3300-line DDL+backfill sweep per tool call + per-request McpServer rebuild (server.ts:481). Decision: PARKED mem-leak (Track-2 code fix) backlog[] held, next_agent=pm, unpark-gate=[cap+rebuild ships AND sawtooth persists 24-48h @3GiB]; MINTED Track-1 FIX-MCP-MEM-CAP-BUMP-REBUILD→ready[] (ops, cross-service): compose edit 2g→3g (repo, allowed) + user-gated rebuild+`up -d --no-deps mcp-server` (commands emitted, NOT executed). Cheapest-sufficient-first; DEFERRED pm-relay of Track-2. Applied via scripts/po-s138-*.jq | orch-apply.sh (ready 1→1, backlog 385→386; idempotent).

**A-13 api-gateway CURL_ERR (S1) = FALSE POSITIVE.** RAW-corroborated 3 ways: Docker healthcheck FailingStreak=0, host wget /health 200 OK, in-container /health 200 OK. Momentary gateway "mcp:down" blip @18:26:24 correlates with mcp-server mem pressure (tracked), not a gateway bug. curl absent from host shell (rc=127) = plausible systematic auditor CURL_ERR source. NO task.

**Other signals:** S2 HVN ESC-4 deep-dive — already dispatched (opus), open, no action. S3 HVN / S4 VCB routine bctc_signals — cowork→alert-commander, skip. S5 ctx-bloat claude-manager-helper "207L" — RAW=176L (under cap), transient hook FP, dedup FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE, no task. S6 cowork FIRE telemetry — informational.

## Tick 2026-07-02T18:37Z (dev-team) — 3-signal triage → NOTHING (0 new tasks)

**Inputs:** pendingSignals=3 (2 dashboard rows drained+READ by router + 1 file); telegram(new)=2 (dupes of B-05/B-06); list_unresolved=[same 2]; head idle; WIP 1/2 (parked enricher untouched); ready[] empty.

**S1 sau-2026-07-02T18:34:09Z / B-05 (bctc-discover stale 381.85h/~16d, 38 pending) → TRIAGED (subsumed), severity kept CRITICAL.** Board recon: discover-leg fixes B-05-FIX + FIX-BCTC-VPS-FETCH-LEG-DEAD BOTH already DONE (items landed → 38 pending in queue). The 38 pending = ENRICHER backlog; enricher deploy PARKED under FIX-BCTC-ENRICHER-STUCK-BACKLOG (code done d9280133, operator-gated mcp-server rebuild). last-push age = enricher outage, NOT a discover crash (age!=crash; BCTC event-driven, mid-year NEW-report lull normal). No new task (3rd/4th dup avoided); do NOT unpark. **pendingObservation:** after enricher rebuild drains the 38, if B-05 STILL fires → discover-leg DONE tasks need done_verified RAW re-check (possible false-green).

**S2 sau-sbv-202607021834 / B-06 (sbv-vps stale 47min, fired 01:34 VN) → RESOLVED (off-market FP), severity CRITICAL→INFO.** Fired 18:34Z = 01:34 VN, outside VN session 02:00-08:00Z; SBV doesn't publish overnight → 47min is expected idle, not incident (feedback_auditor_freshness_threshold_market_hours_blind; prior sau-vps-sbv triaged INFO). Durable root-cause fix ALREADY tracked: FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE (BACKLOG) + ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD (TODO). No new task. Re-verify next open 02:00Z.

**S3 HVN deep_dive_result (bca-ddres-…003000Z, flag_for_human_review conf 0.62) → ACKNOWLEDGE/CLOSE.** Result artifact of already-closed ESC-4 HVN escalation (human-review reminder already surfaced 18:07Z); analyst found one-time DTA/negative-tax-expense inflates headline P/E 7.6x→normalized ~12x, core healthy. Already in docs/signals/processed/ (_processed.result=routed-to-po). No dev task. **pendingObservation:** analyst noted empty prose_sections (couldn't read tax footnote) — possible BCTC prose/notes extraction gap; single occurrence, not minted.

**Board debt flagged (no action this tick):** B-05-FIX and FIX-BCTC-VPS-FETCH-LEG-DEAD are duplicate DONE entries for the same bctc-discover-stale finding — dedup candidate on a future board-hygiene pass.

**Writes:** signal_queue rows S1→TRIAGED (CRITICAL kept), S2→RESOLVED (INFO) via orch-apply (bound --arg, injection-safe); read-back verified. RETURN=NOTHING.

## Carry-over
- ready[]=FIX-MCP-MEM-CAP-BUMP-REBUILD (ops, cross-service, S) — router dispatches Step-3 FIX this tick; compose edit is a repo change, rebuild+swap USER-GATED (do NOT execute).
- backlog: FIX-MCP-MEMORY-CODE-LEAK PARKED held (pm) — unpark only when cap+rebuild shipped AND sawtooth persists 24-48h @3GiB. Do NOT decompose earlier.
- in_progress=1 FIX-BCTC-ENRICHER-STUCK-BACKLOG PARKED on user gate — do NOT unpark. B-05 (bctc-discover stale, 38 pending) is SUBSUMED here (38 = enricher backlog). Recurring B-05 CRITICAL re-fires expected until operator rebuild ships; keep TRIAGED-subsumed, do NOT re-mint. If B-05 persists AFTER the rebuild drains the queue → done_verified re-check of discover-leg DONE tasks (B-05-FIX / FIX-BCTC-VPS-FETCH-LEG-DEAD).
- B-06 sbv-vps stale = off-market FP class; auto-resolve INFO on off-hours re-fires. Durable fix tracked: FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE + ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD.
- review[5] incl BCTC-HNX-SSL-HARDEN deploy-pending (user-gated ./scripts/deploy-vinahost.sh).
- A-13/A-30 telegram reports: resolution out of PO tool scope (process_telegram_report = dev-team/router); flagged A-13 FP verdict in RETURN for router to action.
- ahead of origin — fleet-push launchd timer owns push; PO never pushes.
