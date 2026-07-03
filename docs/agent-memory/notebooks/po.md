# PO Notebook

_Last: 2026-07-04T00:00Z_

## Tick 2026-07-04 (router-dispatched) — GVR ESC-4 deep_dive_result triage: whitelist-ACCEPTED, DEDUP linked (no mint)

**Signal:** `docs/signals/processed/bctc-analyst-20260703T215200Z.json` (bca-ddres-20260703T215200Z, bctc-analyst→po, deep_dive_result, GVR Q1-2026 ESC-4). Opus deep-dive verdict: legitimate non-operating income, NOT an extraction artifact (conf 0.9). Recommends whitelist GVR Q1-2026 ESC-4 by content-hash + durable GVR-class heuristic downgrade. 4th byte-identical emission (06-30..07-03); 24h idempotency guard expires each cycle → re-fires.

**Verdict = ACCEPT.** Math RAW-verified to the dong: PBT 2960.9 bridges op 1923.3→net 2513.4; other-income pre-tax 1037.6 (=35.0% of PBT; the ESC-4 0.2348 value = net/after-tax mixed basis, exactly what the existing row's AC-1 flags); eff-tax 15.1% (rubber agri incentive); B/S 87178.9=64984.7+22194.2. Caveat: thu-nhap-khac footnote composition unavailable (prose empty) = the 0.1 conf gap; structured cascade + B/S integrity are decisive.

**Mechanism finding:** NO content-hash whitelist mechanism exists in this system — searched apps/, docs/data/, scripts/: no ESC whitelist config file; ESC-4 is NOT computed in mcp-server code, it's applied by the bctc-analyst FLOW (main.md §ESC-4 L60-62 + §Escalation Decision). The only dedup today = TTL task-locks (esc-deepdive 24h idempotency guard + esc-datacov 8d coverage guard) which EXPIRE → cause the re-fire. Canonical mechanism = bctc-analyst ESC-4 heuristic downgrade via a PLAN-ONLY backlog FIX → agent-father edits the flow/heuristic doc.

**DEDUP = HIT → linked, NOT minted.** Existing HIGH-priority BACKLOG row `ESC4-HEURISTIC-FIX-TAXBASIS-SOE` (owner agent-father, created 07-02 from prior 55%-conf GVR ESC-4 deep-dive) already covers it: AC-2 = SOE-conglomerate exception (GVR/PHR/DPR/TRC/HRC) auto-tag downgrading ESC-4 HIGH→INFO — a durable SUPERSET of the requested one-quarter content-hash whitelist (fixes ALL future GVR quarters, not just Q1). AC-1 = pre-tax basis formula fix (this deep-dive's figures corroborate). Minting a new row would duplicate. ACTION: appended the 4th-emission Opus corroboration (conf 55%→90%, decisive evidence, escalation-ceiling note) to that row's status_note.

**Writes:** `scripts/orch-link-deepdive-to-backlog-row.jq` (new reusable helper) → orch-apply rc=0 (backlog 404→404, NO mint; status stays BACKLOG PLAN-ONLY; ~105 pre-existing SHG coherence warns non-blocking). No promotion, .head untouched. Signal already drained to processed/ by dev-team (READ-only for me). No push (fleet-push timer owns). Provenance "(po router-dispatched)" — 0 session UUID in any tracked file.

## Tick 2026-07-03T23:00Z (router-dispatched) — B-05 sau-20260703T223423Z DECISION + DEDUP (2 linked items)

**Context:** Tier-2 auditor B-05 (4th emission today, CRITICAL + Telegram BUG each fire) "bctc-push stale 432h in earnings window". Router RAW-corroborated benign at 22:41Z (get_sla_status bctc age 33min/SLA 850min OK; get_vps_service_health vn-bctc-fetch HEALTHY; trigger_bctc_vps_fetch dry_run pending 0; only stale metric = get_vps_proxy_health raw last-push 06-16/0-in-24h, benign for event-driven quarterly). Signal already triaged READ by router (backlog_task_id=BCTC-HNX-SSL-HARDEN).

**Ask 1 — BCTC-HNX-SSL-HARDEN (review, was next_agent=dev-vps-crawls):** DECISION = neither "deployed" nor "self-resolved" is confirmed FOR THIS TASK. The analysis-layer recovery (queue 38→0, SLA fresh, VPS healthy) came from the B-05-FU-SSC-503-RETRY enricher chain (done_verified), DECOUPLED from this HNX SSL security-debt task; recon already falsified any SSL outage (curl -k kept fetching; leaf valid 2027-01-03). Repo scope complete (073fa27f+638fba89, router openssl rc=0/no-k) but VPS deploy unconfirmed + 0 fetch/24h ⇒ hardened path never exercised. Does NOT move to resolution. **OPS VERIFICATION NEEDED = YES** (routed next_agent→ops): confirm scripts/deploy-vinahost.sh shipped CA bundle + hardened fetch-bctc.sh to VPS /root/, then a live HNX fetch with --cacert (verification ON, no -k) returns rc=0 + fetch succeeds. Per OVERRIDE 07-03 (delegate gated deploys to ops, don't wait). Task STAYS in review[] until ops confirms.

**Ask 2 — recurring B-05 raw-push FP:** DEDUP FIRST → no existing row covers it. EXCLUDE-TERMINAL = SLA-metric semantics (apps/mcp-server); B-11 = the NEWS sibling; L2-DATAASOF = frontend fields. MINTED ONE → `FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT` (backlog, BACKLOG/P2/zone docs/agents/system-auditor/, next_agent=ba, sibling_of B-11). Fix = B-05 reads the analysis-layer SLA gate (get_sla_status) as primary authority + exempts raw-push staleness when pending==0 AND vn-bctc-fetch HEALTHY (event-driven quarterly). co_fix_note: groom with B-11 as ONE auditor main.md two-layer-freshness pass to stop both phantom CRITICALs + Telegram BUG spam.

**Writes:** `scripts/po-s140-b05-bctc-freshness-layer-split-mint-hnx-ssl-ops-verify.jq` → orch-apply exit 0 (backlog 403→404 +1 mint; review length byte-stable, M2 in-place; ~105 pre-existing SHG coherence warns non-blocking). Decision journal STEP po-S7. Signal UNTOUCHED (router owns it, READ). No promotion past BACKLOG (PLAN-ONLY); .head untouched. No push (fleet-push timer owns). Provenance "po (router-dispatched)" — 0 session UUID in any tracked file.

## Tick 2026-07-03T23:57Z (router-dispatched) — dev-team Step 1 triage, FREE CAPACITY (WIP=0)

**Inputs:** pendingSignals empty; telegram new x6 (4 BCTC low-conf VCI/DHG/HSG/VHM = expected conviction-skips on corrupted-OCR; HSG financial=1.00 but composite=0.19 = composite-masks-good-financial, no dedicated row — BCTC data-quality domain, not a new sprint; B-05 id3490 CRITICAL already declared FALSE-POSITIVE by router id3492 + tracked by FIX-AUDITOR-B05 row). Backlog 404, review 3 (all stuck).

**PROMOTE (1):** `ESC4-HEURISTIC-FIX-TAXBASIS-SOE` backlog→ready, next_agent=agent-father. Recurring ESC-4 at escalation ceiling (fired 4x on byte-identical GVR 06-30..07-03); Opus deep-dive bca-ddres-20260703T215200Z (conf 0.9) confirmed spec (other-income pre-tax 1037.6 = 35.0% PBT vs 23.5% mixed AC-1 flags). Highest priority class (recurring bug). Agent-heuristic-doc change → agent-father, NOT prod code.

**UNBLOCK (1 batch clears 2 review):** TASK-W5-…-VALIDATION-REINGEST + W5-FU-CTG-REFINE-96e36139 both blocked on ONE ops deploy-gate (FIX-BCTC-BANK-BS-COLUMN-ORDER done_verified → deploy + CTG 96e36139 re-ingest → RAW-probe total_assets!=0). Set next_agent=ops on both (kept BLOCKED in review). Delegate gated deploy to ops per OVERRIDE 07-03.

**NOT promoted — STALE-DONE finding:** router's flagged "top P0" `FACTORY-INTERFACE-confidence-score-50-mask` + `FACTORY-INFRA-agentsignal-confidence-50-default` are ALREADY FIXED by FIX-SIGNAL-CONFIDENCE-DEFAULT-50 (stockSignalsHandler.ts:224 `?? null`; agentSignalStore.ts:343 destructuring default = null). Board rows never closed → recommend qa/router reconcile to done_verified. Do NOT redo. ARCH-SHIP-WAVE-REAUDIT left DEFERRED (park condition unmet).

**Writes:** po-triage-20260704.jq → orch-apply rc=0 (backlog 404→403, ready 0→1; ~105 pre-existing SHG warns non-blocking). Commit 0f139914 (orch-state only, explicit path, under commit-mutex; UUID-scan clean). No push (fleet-push owns). Provenance "(po router-dispatched)".

## Carry-over
- **STALE-DONE reconcile** — FACTORY-INTERFACE-confidence-score-50-mask + FACTORY-INFRA-agentsignal-confidence-50-default already fixed by FIX-SIGNAL-CONFIDENCE-DEFAULT-50; close on board (qa/router). Likely more FACTORY-confidence rows same-state — spot-check the epic before promoting any.
- **FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT** — co-fix with B-11 (same file docs/agents/system-auditor/flow/main.md, same predicate-drift class). DoD: replay 22:41Z state → NO CRITICAL/BUG; a real stuck queue (pending>0 + stale SLA) MUST still fire.
- **BCTC-HNX-SSL-HARDEN** — ops must deploy + live HNX fetch-with-verification-ON probe; then flip review→done_verified. Its recovery is NOT tied to the analysis-layer drain.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix → route gated deploy/verify to ops (don't wait on user).
