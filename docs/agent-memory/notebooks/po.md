# PO Notebook

_Last: 2026-07-16T20:03Z (dev-team tick 19:54Z — ci_red CI-RED-b51fbe13 verified REAL, not flaky; 1 FIX minted)_

## Tick 2026-07-16T19:54Z — 1 actionable signal (ci_red, from ci-health-probe)
Board pre: backlog 402, review 29 (stranded legacy lane, untouched), ready/inprog/qa 0, WIP 0, head idle. One atomic orch-apply (Zod Stage0+1 PASS; conservation 541→542, +1 mint; backlog 402→403). `.head` untouched, no lane-move, no WIP raise. Live peer CHEF files NOT touched/committed. No push (main RED).

### CI-RED-b51fbe13 — REAL regression, router's "flaky" attribution was WRONG
- VERIFIED not trusted: `gh run view --job 87724682260 --log-failed` → sole FAILED FILE `apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts` (1 fail / 14452 pass). Local repro = DETERMINISTIC (throws on BSR.md). NOT the named flaky class, NOT in b51fbe130's changed files.
- ROOT CAUSE: BSD3 guard forbids `**Sector**:` in docs/analysis-briefs/*.md (sector SSOT = WATCHLIST_SEED domain). 3 briefs added by report-analyzer in ebbfda6a5 (BSR/VIX/DBC) each carry a legacy `**Sector**:` line; all other briefs + the canonical template comply. NO code generator emits it → line-removal is DEFINITIVE; the guard test is the structural recurrence-prevention.
- MINT `CI-RED-b51fbe13-FIX` (FIX, cross-service/, BACKLOG, verification_gate=ci_green_on_subsequent_push, fingerprint 8a0a0237… in status_note). Two-layer dedup PASS (the 2 REVIEW CI-RED rows are unrelated). NOT flaky-dismissed (deterministic + product-adjacent, unlike CI-RED-571818c2).

## Carry-over
- **RETURN: BATCH([CI-RED-b51fbe13-FIX]) — 1 FIX; dispatcher Step 2 FIX→Step 3 direct execution.** Fix = delete the `**Sector**:` line from BSR.md, VIX.md, DBC.md; verify `cd apps/mcp-server && bun test BSD3-brief-sector-drift.test.ts` 4/4 green, then full suite, then push. Close MUST record fingerprint 8a0a0237… else signal re-drains.
- Carryover debt candidates = NO mint (both already backlogged): cowork-team-*.json telemetry (45 files) → CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR; price_anomaly envelope → FIX-PRICE-ANOMALY-DISH-SIGNAL-ENVELOPE.
- Telegram/list_unresolved (118, all normal-pri analysis-agent BCTC OCR/reconcile flood) STILL a known unsurfaced cluster — ops/analysis dedicated pass, not dev-team triage. Not this tick.
- Signal file docs/signals/ci-red-b51fbe13-*.json left in inbox for the drain to move; two-layer dedup catches any re-drain (open FIX now has check_id in title).
