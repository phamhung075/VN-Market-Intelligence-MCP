# Decision Journal — Sprint FE-PAGE-REORG · po

**Sprint goal:** FE-PAGE-REORG (active); this cycle scopes the cross-cutting ERROR-AUDIT-2026-06-15 epic (ambient to the sprint).
**Agent:** po
**Started:** 2026-06-15T21:24:00Z

---

### STEP po-S1 · po · 2026-06-15T21:24:00Z
**task-id:** FIX-ERRAUDIT-W1-MCP-P0
**what-done:** Minted the 3-wave error-handling audit epic (7 tasks) and dispatched the dev-mcp-server P0 pair into the 1 free coding lane; queued the pdf-extractor P0 pair behind the active same-zone lane; backlogged Waves 2-3.
**what-considered:**
- Dispatch mcp-server P0 pair first (free lane, no fetch surface, lowest-risk Wave-1) vs pdf-extractor P0 pair — pdf-extractor zone is ACTIVELY edited (FIX-BCTC-BANK-PDF-OCR-RASTERIZE in_progress) → same-zone serialization forbids a concurrent agent.
- Mint pek P0s at all vs skip-as-duplicate — RAW-checked: active commits fffef229/56129626 touched ocr_adapter.py + test + docs ONLY; pek_engine_adapter.py:668/:342/:717 unmodified on disk → DISTINCT, real, must mint (queued not dispatched).
- Promote Wave-2/3 to ready vs backlog — backlog; promoting would invite WIP>2 fan-out (host-starvation lesson). ba→architect grooms later.
**why-decision:** dev-mcp-server P0 pair is the safest Wave-1 first dispatch (pure error→marker, no fetch surface, the only free coding lane); pek pair correctly queued via blocked_by to honor same-zone-serialization + WIP≤2.
**why-change:** Board has no `todo` array (brief said "todo"); mapped to live lifecycle: dispatch→in_progress, same-zone-queue→ready+blocked_by, ungroomed→backlog.

### STEP po-S2 · po · 2026-06-16T01:30:00Z
**task-id:** FIX-ERRAUDIT-W1-PEK-P0
**what-done:** Signed off W1-PEK-P0 done_verified (po-s73 atomic dual-mutation) → Wave-1 complete; promoted W2-FRONTEND-SAFEFETCH backlog→ready + set head=ba; decided PUSH-NOW.
**what-considered:**
- done_verified vs reject — QA cycle-274 APPROVED + router RAW-verified live DB (161 healthy/14 quarantined real varied reasons) + pytest 42/0 docker-exec + image .Created > commit; absent paddle/table-extraction strings correctly fire only under forced failure (sentinel-injected per architect matrix) = contracted DoD, not a gap. AC-1..7 + EC-1 met → concur.
- Next wave: W2-FRONTEND (sequence_after dep done_verified, distinct zone) vs W3-MCP-P2 (still backlog, brief orders W2 before W3) → W2-FRONTEND ba first.
- PUSH-now vs hold — 13 local commits all benign chore/RAW-verified fix; the 106-behind divergence is 100% cloud-chore (health-recheck/TNB/memory); a deferred sign-off is honest-done; no CI-red gate, no conflict surface on touched files → push-now.
**why-decision:** Whole W1-PEK chain RAW-verified green; the only reason push was held was the deferred-call policy, not a real blocker — clearing it now publishes a completed wave + unblocks the router's lock-claim for the ba hop.
**why-change:** no change from plan — W2-FRONTEND was the pre-specced next wave hop (sequence_after gate now satisfied by the done_verified mcp-server deadlines).

### STEP po-S3 · po · 2026-06-16T01:45:00Z
**task-id:** FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367
**what-done:** Push-now BLOCKED by red pre-push tsc hook; escalated this already-tracked task P3→P2+blocking, promoted ready, repointed head=ba (po-s74) so the fleet push can land; held PUSH.
**what-considered:**
- Push around the red (--no-verify) vs hold+fix — NEVER bypass the gate; a red main strands the whole fleet invisibly (red-prepush-strands-fleet) and would push a known-broken tree.
- Is it weather or self-introduced? RAW-checked: `bun tsc --noEmit` = exactly 1 error; the file was last modified by unpushed commit 4f5192c5 (in my chain) → self-introduced, NOT benign cloud-chore. My earlier "push-now, divergence is all cloud-chore" assumption was WRONG.
- Fix it myself vs dispatch — PO never writes code; the one-line type-narrowing fix is dev-mcp-server's; a fully-specced P3 task already existed → escalate+promote, router spawns.
**why-decision:** The push blocker is a real self-introduced red, not policy; clearing it by dispatch (not bypass, not PO-authored code) is the only honest path to publish the RAW-verified W1-PEK-P0 sign-off + the rest of the chain.
**why-change:** PUSH flipped push-now → HELD-until-green; the W1-PEK-P0 done_verified flip itself is unaffected (already committed locally; correctness independent of push timing).

### STEP po-S79 · po · 2026-06-16T04:41:29Z
**task-id:** FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367
**what-done:** Relocated TS2367 ready[]→done_verified[] (ba fix 6f9b3eba, po+router both re-ran bunx tsc --noEmit=EXIT 0, tests 22/0) and advanced top-level .head off it to the planned Wave-2 hop FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH (P1, ba).
**what-considered:**
- New head = W2-FRONTEND-SAFEFETCH (prior head note's planned next, dep already done_verified)
- New head = cowork-doublefire trio (MEDIUM, ~12h stale) or P1 BCTC/HNX/SSC cluster
**why-decision:** W2-FRONTEND was the explicitly-recorded next dispatch in the po-s74/po-s76 head note; its dep is cleared and next_agent already=ba — respects the planning chain over a priority reshuffle; the MEDIUM trio + P1 cluster stay in ready for later picks.
**why-change:** Renamed script po-s78→po-s79 (po-s78 prefix already taken by committed rsi-singledigit reconcile); po-s77 OHLCV signoff was already-run idempotent no-op (conservation harness correctly aborted redundant write).

### STEP po-S80 · po · 2026-06-16T04:41:29Z
**task-id:** FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367
**what-done:** PUSH decision: 13-behind classified ALL benign cloud-chore/docs; tsc GREEN so pre-push hook no longer strands — but HELD the rebase because the working tree carries 120+ uncommitted entries from concurrent bg agents.
**what-considered:**
- Rebase+push now (tsc green, divergence benign)
- HOLD rebase — dirty tree (git pull --rebase refuses; stash would sweep other agents' in-flight work)
**why-decision:** git pull --rebase requires a clean tree; force-stashing 120+ other-agent dirty entries risks corrupting their uncommitted work (router-commit-captures-dirty-board class). Committed only my 2 scoped files; left the rebase+push as the next clean-tree opportunity.
**why-change:** Router said push is mine to execute if green-lit — code-green but tree-not-clean blocks the mechanism; recorded WHY held rather than forcing it.

### STEP po-S6 · po · 2026-06-16T07:32:41Z
**task-id:** FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 / FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2
**what-done:** Minted 2 cycle-277 OHLCV aggregator follow-ons (qa→po PENDING) — stranded-rows repair→ready[] P1 (leads), class3 cold-start seed→backlog[] P2; flipped both signal rows PENDING→TRIAGED.
**what-considered:**
- Stranded-rows lane: ready[] vs backlog[] — chose ready[] (live MARKET "giá 0 dưới BB" poison, leads per WIP same-zone serialize).
- Class3 lane: ready[] vs backlog[] — chose backlog[]+ba (needs exchange ref-price SOURCE contract, larger than a writer tweak; serialize behind stranded-rows in apps/mcp-server zone).
- Dedup class3 vs existing FIX-OHLCV-SCALE-X1000-AUTO-REPAIR + FIX-OHLCV-CORP-ACTION-CONTINUITY — distinct (prevClose=0 cold-start no-op, not write-path normalize nor corp-action boundary).
**why-decision:** Both INDEPENDENT of the ~08:00 writer behavioral-gate proof (residue + distinct cold-start gap); WIP=0 active coding so both valid now; stranded-rows leads (live poison source).
**why-change:** no change from router triage brief; signal rows TRIAGED not RESOLVED (done_verified gated on RAW live-repair verify, router holds the 08:00 probe).

### STEP po-S7 · po · 2026-06-16T09:57:26Z
**task-id:** po-triage-2026-06-16T0948Z
**what-done:** Drained 10 signals, reconciled 5 W2-FE closed-epic orphans ready[]->done_verified[], folded 4 over-cap notebooks into janitor row; verdict NOTHING.
**what-considered:**
- Re-mint ci_red task — REJECTED: origin red = tracked standing baseline FIX-CI-RED-STANDING-1837A-1352A.
- Mint gateway-outage FIX from market-watcher/news-scout escalations — REJECTED: RAW-probed gateway LIVE (false infra), durable fix already in ready[].
- Mint new dated context-bloat task — REJECTED: folded into existing CLEAN row (SSOT-dup guard); excluded ba.md (197<cap, false breach).
- Dispatch any new coding lane — REJECTED: WIP=0 but no new work warranted; ready[] backlog is router's to dispatch.
**why-decision:** Every signal resolved to informational / already-tracked / false-positive; the only real defect was board drift (closed-epic orphans + false T4 lane) which is reconcile-not-new-work.
**why-change:** Router pre-gather mislabeled market-watcher/news-scout as telemetry and ARCH-CRON as unconfirmed-stale; RAW-verified both before acting (gateway live; ARCH-CRON is held QA-observe umbrella, not phantom).

## STEP — ARCH-BCTC-PIPELINE-DURABILITY dispatch + 7-task backlog hold (2026-06-16T10:32:32Z)
[task_id: ARCH-BCTC-PIPELINE-DURABILITY]
- considered: (a) dispatch 1-2 BCTC FIX coding lanes now; (b) dispatch the 3 cowork double-fire FIXes; (c) dispatch the architect brief; (d) NOTHING.
- chose: (c) — dispatch ARCH-BCTC-PIPELINE-DURABILITY → architect (SPIKE, 0 coding-WIP). Single move unblocks 5 children.
- why: its children[] explicitly gate FIX-HNX-SESSION-COOKIE / SSC-C111 / ZERO-URL-ALERT / FRESHNESS-GATE; brief must define the durable zero-result/freshness/enrich contracts FIRST. Dispatching those 4 as code now = "fix residue not contract" anti-pattern (recurring-bug-escalation: 2nd recurrence BCTC-VPS-PIPELINE-STALE). ENRICH-SILENT-0ROWS (5th child) already in review.
- rejected (a/b): all 8 ready rows are thin stubs (no root_cause/fix_spec/files). 3 cowork FIXes (Root A/B/C) label ONE phenomenon w/ shared dedup root — need a single design/BA pass, not 3 independent dispatches. Handing half-specced FIXes to dev violates no-thin-stubs.
- WIP: coding lanes stay 0 (ARCH-CRON in_progress is held QA-umbrella, also 0 coding-WIP). Did NOT promote a 2nd lane — nothing dispatch-ready.
- board: po-s86 atomic (ready 8→7, in_prog 1→2, total 256 conserved); 7 held rows carry explicit per-task hold_reason. PUSH held.

### STEP po-S90 · po · 2026-06-16T16:25:09Z
**task-id:** INFOCARD-EXPAND-FETCH (epic: po-s90)
**what-done:** Recon'd the "Tác động Macro — FPT" cascade card + data source first-hand, minted 3 backlog FIX tasks (idempotent po-s90 jq), committed orch-state+script.
**what-considered:**
- one-off FPT/macro fix vs generic ALL-info-card dropdown → chose generic (/goal#2 user said "ALL info display must be dropdown")
- frontend-only vs +backend: DATA-GAP confirmed (endpoint flattens finding_data→one detail string) → backend subtask REQUIRED + made blocking for dropdown
**why-decision:** dropdown's REAL detail (/goal#1) is impossible without exposing finding_data; Invalid Date split out (fast-track, FE-only) since it's a parse bug independent of the fetch gap.
**why-change:** no change from plan.

### STEP po-S91 · po · 2026-06-16T21:36:12Z
**task-id:** DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER / AF-1 / FIX-BCTC-BANK-SCALAR-MAPPING
**what-done:** Triaged 5 drained signals; folded 3 Root A/B/C ready stubs → done[] SUPERSEDED, minted AF-1 (ready, agent-father), DMS-1+DMS-2 (backlog HELD), FIX-BCTC-BANK-SCALAR-MAPPING (backlog); ACK'd TNB c97; head→AF-1.
**what-considered:**
- Dispatch DMS-1/DMS-2 to ready now — REJECTED: apps/mcp-server/ collides with active ARCH-CRON-SCHEDULER-RELIABILITY; WIP headroom (in_progress=1) is for a NON-colliding lane only.
- Mark 3 stubs done_verified — REJECTED: they are folded into the umbrella's brief children, not independently verified; done[] SUPERSEDED + done_verified:false is honest.
- Promote chef double-post fix this tick — DEFERRED: ARCH-HEADLESS-GATEWAY-COWORK-NOPOST already on board (agents zone, AC-FAILCLOSED spec po-s90); agents-architect→agent-father lane, flagged for c98.
**why-decision:** AF-1 is the only immediately-dispatchable non-colliding lane (maintenance/agent-father, no coding WIP slot); zone-collision constraint forces DMS to sequence behind cron work; TNB HIGH finding had no board task so it had to be minted.
**why-change:** no change from plan — followed brief routing + TNB handler + zone-collision constraint verbatim.

### STEP po-S92 · po · 2026-06-16T22:30:27Z
**task-id:** CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614
**what-done:** Folded the agent-father.md 219L>200 context_bloat_breach signal into the EXISTING open CLEAN task in-place (po-s92 script): RAW-scanned 6 live over-cap notebooks, set .targets (was null) + refreshed title count 4→6, no lane move. ARCH-CRON-SCHEDULER assessed NOT stalled.
**what-considered:**
- Dispatch claude-manager-helper for the prune — REJECTED: existing open CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614 (owner=code-janitor, TODO) already tracks the class; per-notebook dispatch = dup work + maintenance-mutex churn.
- Mint a new agent-father-specific prune task — REJECTED: dedup guard (triage-signals pattern) — fold into existing umbrella, never mint a dup.
- Flag ARCH-CRON-SCHEDULER-RELIABILITY (updated_at:null) as stalled → re-dispatch — REJECTED: brief FINAL (2026-06-14, 29KB), pm sub-tasks 1A/1B/1C/2 all SUPERSEDED, IMPL-GATE FIX-MCP-CRASH-LOOP-WRITEWAL done_verified; it's a deliberate zone-lock held open for a market-day live re-verify gate, not churn. DMS stays HELD.
**why-decision:** the breach is an INSTANCE of an already-tracked CLEAN task, not new work; folding the live target set is the lowest-debt move (signal not lost, janitor gets ground-truth, zero lane churn, conservation 562 held).
**why-change:** no change from plan — applied the existing-entry dedup discipline.
