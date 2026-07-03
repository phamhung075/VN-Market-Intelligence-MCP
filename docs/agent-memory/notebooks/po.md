# PO Notebook

_Last: 2026-07-03T01:34Z_

## Tick 2026-07-03T01:07Z — dev-team triage: 4 signals + 3 telegrams → BATCH(1 FIX promote), 0 new mints

**Inputs:** pendingSignals=4 (all system-auditor, drained NEW→READ by dev-team 0a-D); telegram(new)=3 (3397 timeout, 3398+3404 A-21 dupes); board CI GREEN, in_progress=1 (enricher PARKED), review=6, backlog 393, ready 0, sprint_goal=16. TNB c104 already ACK'd 07-02T20:33Z (no re-process).

**KEY: all 4 sau signals + telegram 3397 are ALREADY covered by existing board tasks — the prompt's "no board task exists" (3397) and "consider minting" (C-08) were both wrong on RAW-verify. 0 new mints.**
- **sau-…-c08** (C-08 alerts→signals orphan, actual=1, HIGH): folded into existing **FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID** (P1) — same alert↔signal FK family (annotated w/ the re-fire corroboration; auditor RAW-DB probe IS the corroboration per orphan-FK-may-be-miscaused lesson). RE-OPEN dedicated C-08 scope only if count grows past this 1 row. → RESOLVED.
- **sau-…-doc1** (task_board cap 85>80): tracked by **FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY** (auditor over-counts; predicate WIP-only fix pending). → RESOLVED.
- **sau-…-doc2** (sprint_goal 16>15): grooming tracked by SHG-4 / FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE; DONE FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT self-grooms on sign-off. 1-over is transient; did NOT risk an inline vision delete during triage. → RESOLVED.
- **sau-…A-21** (mcp RestartCount 4>2): covered by **OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN** + user-gated FIX-MCP-MEM-CAP-BUMP-REBUILD (review). → RESOLVED (no new FIX for the rebuild itself).

**Actionable = search_similar_context 4th recurrence.** Existing **FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING** PROMOTED backlog→ready (high, apps/mcp-server/), SCOPED to part-(a) client-side fail-soft in analysis.ts:511/563 (mirror analysis.ts:84 service-down omit-block) so a rag-down stops blocking bctc-analyst Step 2b for ALL tickers. Root rag restart-loop stays tracked in FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP. Returned in BATCH. Graceful-degrade is correct behavior, NOT symptom-mask (bounded-fetch lessons).

**Signal-queue sweep (debt reduction):** flipped ALL 51 rows READ(4)+TRIAGED(47) → RESOLVED. TRIAGED is NOT a cold-evict terminal (only READ/RESOLVED/SUPERSEDED/ACUTE-RESOLVED-ROOT-TRACKED are) so the 47 were permanently stuck; RESOLVED makes them archivable (non-destructive — cold-evict → docs/tasks/archive, board tasks remain the durable trackers). Did NOT flip the 4 sau to TRIAGED (would have UN-evicted them).

**Telegrams:** 3397 monitoring (covered+promoted), 3398+3404 duplicate (A-21). All deleted. resolution enum = none/fixed/wontfix/duplicate/monitoring (NOT free text).

**Writes:** 2 orch-apply passes (Pass A signal sweep; Pass B annotate+promote), all --arg bound. backlog 393→392, ready 0→1. **PUSH: owned this tick (dev-team defers when PO spawned) — ahead=205 >> 20; invoked scripts/fleet-worktree-push.sh (self-gating bounded-tsc + divergence classifier).**

## Carry-over
- ready[1] = FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING (high, apps/mcp-server/, part-a fail-soft) — router dispatches; WIP would hit 2/2.
- in_progress=1 FIX-BCTC-ENRICHER-STUCK-BACKLOG PARKED on user gate — do NOT unpark. review=6.
- USER-GATED rebuild blocks a cluster: FIX-MCP-MEM-CAP-BUMP-REBUILD (review, A-21 root), REFLOW-MBB-Q1-2026 (BLOCKED), CTG classifier FIX-BCTC-BANK-BS-SECTION-CLASSIFIER (REVIEW). All wait on `docker compose build mcp-server && up -d --no-deps mcp-server`. Leave parked. A-21 RestartCount will re-fire every window until swap lands — keep RESOLVING as covered, do NOT re-mint.
- FIX-AUDITOR-COMMIT-MUTEX-SKIP in REVIEW — observation AC needs 3 consecutive mutex-paired [auditor-commit] runs (1/3 landed fd9e7ce12). Do NOT flip DONE.
- ahead=205 is HIGH — fleet-push launchd timer appears to be lagging/failing; flag for ops if it stays >100 next tick.
- sprint_goal=16 (1 over cap): grooms itself as sprints sign off (set status terminal → cold-evict). FIX-BCTC-BANK-SUMMARY-MAPPING vision is near-complete (bank-mapping fixes landed) — candidate to close at next sign-off.
- FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID (P1) now carries C-08 re-fire note — watch alerts→signals orphan count.
