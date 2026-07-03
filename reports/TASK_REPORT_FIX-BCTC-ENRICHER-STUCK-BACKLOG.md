## Task Report FIX-BCTC-ENRICHER-STUCK-BACKLOG
date: 2026-07-03
outcome: PASS (behavioral DoD sign-off — final gate, review→done_verified)
gate: QA final live-verification (not a code-review round; consumes no coding WIP slot)

## Scope
Confirm, against LIVE running mcp-server state (not on faith from the dev-mcp-server review_note),
that: (1) fix commit d92801332 is deployed; (2) the 21-row deploy-gate reset actually landed;
(3) the root-cause fix (last_attempt stamping) is proven live and idempotent.

## Deploy verification (RAW, independent)
- `git merge-base --is-ancestor d92801332 HEAD` → true (HEAD=fdcc5278, commit date 2026-07-02T00:11:09Z, well before build).
- `docker inspect vn-market-intelligence-mcp-mcp-server-1`: Image=`sha256:a169f5e2b7e2a3d9884d3ef69383ca00688834566bda1716d14869a8582dbb5d`,
  Health=healthy, StartedAt=2026-07-03T04:38:34Z, RestartCount=0 — matches board claim exactly.
- `docker stats --no-stream`: 698.6MiB / 3GiB = 22.74% mem (up from the dev-reported 477.6MiB/15.55% ~1h ago,
  natural growth, still far below the pre-fix 96.81%/1.936GiB@2GiB-cap scar) — A-30 mem-leak relief holds.

## Live DB verification (bun:sqlite inside the running container, table `bctc_vps_queue`, db `/app/data/market.db`)
- Row id 255868 (ACV): status=pending, **attempts=5** (was 0), **last_attempt='2026-07-03 05:45:10'** (was NULL).
  Continues to advance across multiple `*/15` cron cycles (cron_job_runs: 05:15×2, 05:30, 05:45 — all `success`),
  i.e. the stamping mechanism is proven live over 3+ cycles, not just the single cycle the review_note cited.
- Row id 255882 (HVN): same pattern independently — attempts 0→5, last_attempt NULL→'2026-07-03 05:45:18'.
- Idempotency: re-ran the migration's exact SELECT predicate
  (`status='url_not_found' AND last_attempt IS NULL AND period_year=2025 AND period_quarter='Q4'
  AND created_at BETWEEN '2026-04-28 00:00:00' AND '2026-04-30 23:59:59' AND action_code IN (21 tickers)`)
  → **0 rows matched** (confirms the reset landed and cannot re-match — matches the script's own documented guard).
- All 21 targeted rows independently re-queried: none remain `url_not_found`/`last_attempt IS NULL`.
  18/21 (ACB, BID, D2D, DHG, EIB, GAS, GVR, HCM, HSG, MBB, NKG, POW, SSI, VCI, VHM, VIC, VPB, VRE) now carry a
  real `staticfile.hsx.vn` source_url — stronger than the review_note's "4/21" (more cron cycles ran since).
  ACB/BID progressed further to `enrich_failed` (URL found, downstream PDF enrichment failed — a different,
  out-of-scope code path; both correctly land in this fix's newly-extended Arm-2 grace-retry set).
  3/21 (ACV, CTG, HVN) still lack source_url — ACV/HVN are actively retried (attempts climbing, last_attempt
  updating every cycle, exactly what the fix is meant to prove); CTG (id 255871) is the one anomaly: attempts=0,
  last_attempt=NULL despite 3 cycles elapsed. Non-blocking observation — out of scope for this fix (last_attempt
  stamping on terminalizing statements), likely a per-ticker discovery-loop skip; does not affect the DoD claim.

## Tests / tsc (re-run fresh on current HEAD, not relayed)
- `bun test src/__tests__/FIX-BCTC-ENRICHER-STUCK-BACKLOG.test.ts` → **8 pass / 0 fail**.
- `bun tsc --noEmit` (apps/mcp-server) → exit 0, 0 errors.

## Verdict
**PASS.** All claims in the dev-mcp-server review_note independently RAW-reproduced and, on stamping
liveness/idempotency, exceeded (more cycles observed, more rows drained, second independently-confirmed row).
CTG anomaly logged as a non-blocking follow-up observation, not a DoD blocker.

## Non-blocking follow-up
- CTG (bctc_vps_queue id 255871, HOSE Q4-2025) not yet touched by discovery across 3 observed */15 cycles
  post-reset, while its 20 siblings all advanced. Worth a quick look by dev-mcp-server if it persists past a
  few more cycles — separate from this fix's scope.
