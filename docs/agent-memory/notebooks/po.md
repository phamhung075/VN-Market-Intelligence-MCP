# PO Notebook

_Last: 2026-07-03T23:00Z_

## Tick 2026-07-03T23:00Z (router-dispatched) — B-05 sau-20260703T223423Z DECISION + DEDUP (2 linked items)

**Context:** Tier-2 auditor B-05 (4th emission today, CRITICAL + Telegram BUG each fire) "bctc-push stale 432h in earnings window". Router RAW-corroborated benign at 22:41Z (get_sla_status bctc age 33min/SLA 850min OK; get_vps_service_health vn-bctc-fetch HEALTHY; trigger_bctc_vps_fetch dry_run pending 0; only stale metric = get_vps_proxy_health raw last-push 06-16/0-in-24h, benign for event-driven quarterly). Signal already triaged READ by router (backlog_task_id=BCTC-HNX-SSL-HARDEN).

**Ask 1 — BCTC-HNX-SSL-HARDEN (review, was next_agent=dev-vps-crawls):** DECISION = neither "deployed" nor "self-resolved" is confirmed FOR THIS TASK. The analysis-layer recovery (queue 38→0, SLA fresh, VPS healthy) came from the B-05-FU-SSC-503-RETRY enricher chain (done_verified), DECOUPLED from this HNX SSL security-debt task; recon already falsified any SSL outage (curl -k kept fetching; leaf valid 2027-01-03). Repo scope complete (073fa27f+638fba89, router openssl rc=0/no-k) but VPS deploy unconfirmed + 0 fetch/24h ⇒ hardened path never exercised. Does NOT move to resolution. **OPS VERIFICATION NEEDED = YES** (routed next_agent→ops): confirm scripts/deploy-vinahost.sh shipped CA bundle + hardened fetch-bctc.sh to VPS /root/, then a live HNX fetch with --cacert (verification ON, no -k) returns rc=0 + fetch succeeds. Per OVERRIDE 07-03 (delegate gated deploys to ops, don't wait). Task STAYS in review[] until ops confirms.

**Ask 2 — recurring B-05 raw-push FP:** DEDUP FIRST → no existing row covers it. EXCLUDE-TERMINAL = SLA-metric semantics (apps/mcp-server); B-11 = the NEWS sibling; L2-DATAASOF = frontend fields. MINTED ONE → `FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT` (backlog, BACKLOG/P2/zone docs/agents/system-auditor/, next_agent=ba, sibling_of B-11). Fix = B-05 reads the analysis-layer SLA gate (get_sla_status) as primary authority + exempts raw-push staleness when pending==0 AND vn-bctc-fetch HEALTHY (event-driven quarterly). co_fix_note: groom with B-11 as ONE auditor main.md two-layer-freshness pass to stop both phantom CRITICALs + Telegram BUG spam.

**Writes:** `scripts/po-s140-b05-bctc-freshness-layer-split-mint-hnx-ssl-ops-verify.jq` → orch-apply exit 0 (backlog 403→404 +1 mint; review length byte-stable, M2 in-place; ~105 pre-existing SHG coherence warns non-blocking). Decision journal STEP po-S7. Signal UNTOUCHED (router owns it, READ). No promotion past BACKLOG (PLAN-ONLY); .head untouched. No push (fleet-push timer owns). Provenance "po (router-dispatched)" — 0 session UUID in any tracked file.

## Carry-over
- **FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT** — co-fix with B-11 (same file docs/agents/system-auditor/flow/main.md, same predicate-drift class). DoD: replay 22:41Z state → NO CRITICAL/BUG; a real stuck queue (pending>0 + stale SLA) MUST still fire.
- **BCTC-HNX-SSL-HARDEN** — ops must deploy + live HNX fetch-with-verification-ON probe; then flip review→done_verified. Its recovery is NOT tied to the analysis-layer drain.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix → route gated deploy/verify to ops (don't wait on user).
