# Decision Journal — SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO (consolidated remediation)

**task_id:** SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO
**date:** 2026-07-03
**agent:** po (router-dispatched)
**mode:** SPIKE remediation triage (accept/modify/reject + mint PLAN-ONLY backlog)
**inputs:** docs/spikes/SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO.md (done_verified, findings doc 43453950b, 252L authoritative)

## Verdict read
MIXED root cause: Bucket A "never refined" (7/8: VHM, REE, VIC, VNM, VRE, HSG, MWG — 0 refined_units + 0 table_rows; served total_assets=0 is the stale parse-time value, refine pipeline never ran; source data confirmed RECOVERABLE not corrupt) + Bucket B genuinely-NEW residual (1/8: POW — refine ran fully 28/28 units/166 rows but grand-total codes 270/440 dropped mid-transcription inside a correctly-bounded window, reproduced live in refined markdown unit-0004).

## Decisions (SPIKE proposed; PO decides)
- **Item 1 — ACCEPT.** Operational agentic-refine-repass + reingest for VHM/VIC/VRE/HSG/MWG (5 tickers), ZERO new code, proven CTG runbook. → minted `OPS-BCTC-REFINE-REPASS-NONBANK-5T` (backlog, high, zone multi, next_agent bctc-analyst→dev-mcp-server per W5-FU-CTG precedent). report_ids stamped on row.
- **Item 2 — ACCEPT (no-mint).** No action on REE / VNM. Their dedicated tickets stay AS-IS: FIX-REE-BS-SECTION-REGEX (backlog TODO), SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT (backlog P2). Deliberately EXCLUDED from item-1 batch — not re-diagnosed, not folded, not annotated (per router directive).
- **Item 3 — ACCEPT.** New architect-first timeboxed SPIKE for the POW-class completeness gap. → minted `SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP` (backlog, medium, mode spike, timebox 120, zone multi, next_agent architect). POW unit-0004 = reproduction fixture; architect determines locus (a) refine leaf-worker prompt vs (b) refinedMarkdownParser.ts swallow, then splits zone. DISTINCT-FROM the pre-existing SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION (window-boundary truncation ≠ row dropped within a correct window) — noted on row to prevent dup.
- **Item 4 — ACCEPT (standing guardrail, no-mint).** REJECT any per-ticker regex-branch patch to balanceSheetExtractor.ts — exact anti-pattern already rejected in FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT. Baked as `generic_mandate` on both minted BCTC rows rather than a standalone row.
- **Router latent candidate — ACCEPT.** → minted `FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT` (backlog, low, zone cross-service, next_agent developer). _step_sf1_claim() not re-entrant on own held SF-1 (reads only .claimed) → phantom-peer-SKIP for full 90min TTL when session is free; FIX = mirror _step_fire_election() self-hold heartbeat. Latent/non-urgent.

## what-considered
- Mint 8 per-ticker FIX rows (REJECTED — the exact fan-out anti-pattern; one operational repass batch recovers 5 with zero code).
- Fold REE/VNM into the repass batch (REJECTED — correctly-scoped dedicated roots already exist; folding balloons scope, risks re-diagnosis — item-2 no-mint).
- Mint a FIX directly for POW instead of a SPIKE (REJECTED — drop locus unknown [prompt vs parser, possibly non-mcp-server zone]; architect-first SPIKE prevents a mis-zoned/overfit patch).
- Standalone "no-per-ticker-regex" governance row (REJECTED — a guardrail, not work; encoded as generic_mandate on the two BCTC rows where it bites).
- Promote any row to ready[] / set head (REJECTED — router directive PLAN-ONLY; dev-team cron loop drains + dispatches).

## why-decision
The already-built agentic-refine + LABEL-CANONICAL aggregator is the correct GENERALIZED fix path for Bucket A — it just needs to be RUN, not re-invented at the parse-time regex layer (the FPT-OVERFIT lesson). POW is a distinct completeness gap warranting its own recon before any code. Latent SF-1 re-entrancy is real but non-urgent (SKIP is correct while a tick is genuinely in-flight).

## why-change
No change from the SPIKE proposal — all 4 items accepted as proposed + the router's latent SF-1 candidate. Only refinement: item-4 realized as a generic_mandate field (not a row) and the POW SPIKE carries an explicit DISTINCT-FROM vs SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION.

## Disposition (po-s139 script, atomic via orch-apply.sh)
- Minted 3 PLAN-ONLY backlog rows (status BACKLOG): OPS-BCTC-REFINE-REPASS-NONBANK-5T (high) · SPIKE-BCTC-REFINE-TOTAL-ROW-TRANSCRIPTION-DROP (medium) · FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT (low). backlog 400→403.
- No promotion, head untouched. Reusable script: scripts/po-s139-bctc-nonbank-total-assets-spike-remediation-mint.jq (idempotent, id-guarded; re-run mints 0).
- REE/VNM tickets + SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION left untouched.
