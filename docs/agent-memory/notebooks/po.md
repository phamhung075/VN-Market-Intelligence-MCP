# PO Notebook

_Last: 2026-07-03T06:37Z_

## Tick 2026-07-03T06:37Z — dev-team triage: dispatch COLUMN-ORDER (unblocks W5) + create B-05 discover SPIKE

**Inputs:** pendingSignals=4 (all READ by drain); board IDLE (ready=0, in_progress=0, WIP=0/2); .head idle. Backlog=396.

**BATCH returned (WIP 2):**
- FIX-BCTC-BANK-BS-COLUMN-ORDER (FIX, apps/mcp-server, dev-mcp-server) — HIGHEST. Existing backlog TODO; `unblocks` field already lists both BLOCKED W5 review tasks (VALIDATION-REINGEST + W5-FU-CTG-REFINE-96e36139). Composite FIX-A+D+C = refinedMarkdownParser.ts column-order + bctcFormType.ts bold-tolerance + detectSection bank-BS vocab.
- SPIKE-BCTC-DISCOVER-PIPELINE-DEAD (SPIKE, zone=multi, next=architect, critical, 120m) — NEW backlog row. Different agent (architect) => no dev-mcp-server concurrency conflict with COLUMN-ORDER; different subsystem (discover/enqueue vs parse) => no file conflict.

**Signal dispositions:**
1. rag A-22 RestartCount 294→297 HEALTHY (LOW) — SKIP watch-note (FU-RAG-DEPLOY-MEMORY already tracks). No task.
2. chef-marker-leak (agent_flow_defect) — DEDUP, no new row. Folded 4 facets (early-gate-before-decide / no-post-exit leak / owner_client_session="placeholder" / ttl 3600 vs 100800) into FIX-CHEF-PUBLISHED-MARKER-RELEASE.status_note. KIN FU-CHEF-MARKER-INFLOW (claim-side) + FIX-CHEF-SENDTELEGRAM-ARGSHAPE. Route stays agent-md-factory→architect→agent-father (NOT dev apps/).
3. B-05 CRITICAL bctc-discover dead 396.6h / 36 pending rows during Q2 earnings — REAL breakage (false-P0 ruled out). NEW SPIKE (above). DEDUP-checked distinct from HNX-SSL-HARDEN (fetch works via curl -k, not blocker), FU-CTG-DISCOVERY-FILENAME-FILTER (CTG-only), FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH (detector-side), BCTC-ENRICHER-OLD-QUARTERS (KIN, old-quarters).
4. B-13 WARN queue aging 9 rows>72h — FOLDED into B-05 SPIKE (same root).

**HELD:** FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP — serialize behind COLUMN-ORDER (SAME files refinedMarkdownParser.ts/bctcFormType.ts) + architect flagged partly superseded. Re-eval after COLUMN-ORDER lands (likely close-as-superseded or residual-only).

**Data-quality note:** 11 dup signal_queue rows id=sau-d4-202607030300 — root cause already tracked by FU-AUDITOR-D4-SIGNAL-ID (one row per divergence, shared id). No new task; prune not worth it (all READ).

**Board writes (orch-apply.sh, exit 0):** +SPIKE row; CHEF status_note enrich; last_triaged_at/by. .head untouched. 105 coherence warnings pre-existing (SHG migration, non-blocking).


## Tick 2026-07-03T04:37Z — dev-team triage: rebuild landed → UNPARK cluster, dispatch QA on 3 review items

**Inputs:** pendingSignals=EMPTY (drain clean); telegram(new)=0; unresolved_reports=0. Board: head IDLE (free slot), in_progress=1 (enricher), review=7 (3 next=qa), ready=0, backlog=297 BACKLOG+42 TODO (NOT "mostly deferred" — only 11 DEFERRED+3 BLOCKED).

**KEY EVENT — the user-gated rebuild cluster (prior carry-over) UNBLOCKED itself.** The parked mcp-server rebuild landed externally 04:38:34Z (per feedback_user_gates_delegate_to_ops — user/peer ran it). RAW-verified: `docker inspect` img=a169f5e2, health=healthy, RestartCount=0, mem 477.6MiB/3GiB=15.55% (A-21/A-30 leak fixed, cap 2->3GiB). Both enricher fix d92801332 AND BS-classifier code 2c7fb5b08 are ancestors of the built HEAD => shipped in a169f5e2.

**Dispositions:**
- (c) FIX-BCTC-ENRICHER-STUCK-BACKLOG — NOT stale/orphaned. Code done + deploy gate now SATISFIED. UNPARKED (status_note updated, supersedes "do NOT unpark"). Stays in_progress WIP=1, next=dev-mcp-server for post-deploy verify (reset migration dry-run ~21 rows -> apply -> verify enricher */15 stamps attempts+last_attempt). NO reset.
- (a) 3 REVIEW/next=qa ALL ready → dispatch QA batch: FIX-BCTC-BANK-BS-SECTION-CLASSIFIER (deploy-gate CLEARED, behavioral DoD now runnable, annotated); FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION (pure JS, route_to=qa set); FIX-CRON-REGISTRY-BASERATE-CADENCE-DRIFT (docs/data sync, route_to=qa set).
- (b) NO new backlog pull. Enricher becomes active (fills dev WIP toward 2/2); HPG-REPARSE-POST-REBUILD (P2 TODO) is newly rebuild-unblocked but touches the SAME bctc/enricher pipeline as the enricher verify — sequence next tick after enricher stamping proven healthy (avoid table contention / over-parallel host starvation).

**Writes:** 1 orch-apply pass (--arg bound, exit 0): bump last_triaged; unpark enricher note; BS-classifier deploy-cleared note; route_to=qa on 2 review rows. 101 coherence warnings pre-existing (SHG lane/status drift, non-blocking). Did NOT push (dev-team tick owns push).

_(prev tick 01:07Z below)_

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
