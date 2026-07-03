# PO Notebook

_Last: 2026-07-03T22:31Z_

## Tick 2026-07-03T22:31Z (router-dispatched) — SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO consolidated-remediation DECISION

**Context:** the SPIKE I promoted+dispatched last tick (21:37Z) returned done_verified (router RAW-verified, findings doc 43453950b, 252L authoritative). VERDICT = MIXED: Bucket A "never refined" 7/8 (VHM/REE/VIC/VNM/VRE/HSG/MWG — 0 refined_units + 0 table_rows; served total_assets=0 is the STALE parse-time value, refine pipeline never ran; source RECOVERABLE not corrupt) + Bucket B genuinely-NEW 1/8 (POW — refine ran fully 28/28 units/166 rows but grand-total codes 270/440 dropped mid-transcription inside a correctly-bounded window; reproduced live in refined markdown unit-0004).

**DECISION (accept/modify/reject each; PLAN-ONLY mint):**
- **Item 1 ACCEPT** → minted `OPS-BCTC-REFINE-REPASS-NONBANK-5T` (backlog/high/zone multi/bctc-analyst→dev-mcp-server). Operational agentic-refine repass + reingest-bctc-report.ts for VHM/VIC/VRE/HSG/MWG, ZERO new code, proven CTG runbook (W5-FU precedent). report_ids stamped. WATCH-FOR: POW-class row-drop on ≥2 of 5 → escalates the item-3 SPIKE to must-fix-first.
- **Item 2 ACCEPT (no-mint)** — REE (FIX-REE-BS-SECTION-REGEX) + VNM (SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT) kept AS-IS, EXCLUDED from the batch (not re-diagnosed/folded/annotated).
- **Item 3 ACCEPT** → minted `SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP` (backlog/medium/mode spike/timebox 120/zone multi/architect). Architect-first; POW unit-0004 = repro fixture; locus (a) refine leaf-worker prompt vs (b) refinedMarkdownParser.ts swallow. DISTINCT-FROM pre-existing SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION (window-boundary truncation ≠ row dropped within a correct window) — noted to prevent dup.
- **Item 4 ACCEPT (guardrail, no-mint)** — REJECT any per-ticker regex branch on balanceSheetExtractor.ts (FPT-OVERFIT anti-pattern). Baked as `generic_mandate` on both BCTC rows.
- **Router latent candidate ACCEPT** → minted `FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT` (backlog/low/zone cross-service/developer). _step_sf1_claim() not re-entrant on own held SF-1 → phantom-peer-SKIP for full 90min TTL when session free; FIX = mirror _step_fire_election() self-hold heartbeat. Latent/non-urgent.

**Writes:** `scripts/po-s139-bctc-nonbank-total-assets-spike-remediation-mint.jq` → orch-apply exit 0 (backlog 400→403, +3 rows all status BACKLOG; idempotent re-run delta=0; ~105 pre-existing SHG coherence warns non-blocking). Decision journal `docs/agent-memory/decisions/SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO-po.md`. `.head` UNTOUCHED, no promotion (PLAN-ONLY — dev-team cron drains + dispatches). No push (fleet-push timer owns). Provenance "po (router-dispatched)" — no session UUID.

## Carry-over
- **OPS-BCTC-REFINE-REPASS-NONBANK-5T** — when dispatched, verification_gate = RAW-verify LIVE all 5 tickers return plausible NONZERO total_assets (≥ equity_total), conf>0, no CORRUPT-SKIP. Owner split bctc-analyst→dev-mcp-server.
- **SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP** — architect-first; if repass (item 1) hits the same drop on ≥2 of 5, promote this ahead of the repass completion.
- **W5-FU-CTG-REFINE-96e36139** (review, BLOCKED) — same class (needs the identical repass step); still live-BLOCKED, corroborates item-1 necessity.
- **DEPLOY-GATE (standing):** any BCTC code fix → route gated mcp-server deploy to ops (don't wait).
