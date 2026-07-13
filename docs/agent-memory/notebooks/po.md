# PO Notebook

_Last: 2026-07-13T19:31Z (ultracode "fix all" audit mint — 49 backlog rows + 8 annotations; coordination_session 9e3b36cc)_

## Tick 2026-07-13T19:31Z — ultracode audit "fix all" TRIAGE+MINT (router-delegated, gateway-blind)
User "fix all" on docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md (FINAL: 17 CONFIRMED / 23 RESCOPE / 8 REJECTED / 58 UNVERIFIED). ONE atomic orch-apply write (Zod PASS, conservation 511→560 +49, CAS clean). PO mints only — NO code, NO spawn.
- **49 rows → backlog** under sprint ULTRACODE-AUDIT-FIXALL (all BACKLOG, dev-team drains): 16 CONFIRMED (`UC-<DOM>-Pn`; **UC-RDL-P1 lock-prefix-align = P0 sequence lead**, S-effort/critical), 22 RESCOPE (note = verifier Rescope-note summary + detail_ref, NOT original proposal), 8 per-domain UNVERIFIED PLAN-ONLY umbrellas (`UC-<DOM>-UNVERIFIED-BATCH`), 3 critic PLAN-ONLY (UC-CRITIC-HOOKS-ENFORCEMENT + UC-CRITIC-GATEWAY-CONTRACT-DRIFT high-risk + UC-CRITIC-UNAUDITED-LANES-BATCH).
- **8 existing rows annotated (audit_ref), NOT double-minted:** router-P3→FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (folds AC1+AC3, AC2 residual, do NOT close); dev-team-loop-P3→FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (ship vehicle); TE-T05 (P6-Piece2+MDH-P2), TE-T11 (P1-rider), TE-T33 (P4-coord); FIX-AUDITOR-C11+C06 (P3 repoint); SYSREMAKE-P2 (git-P2/P8 RC-GITSTATE).
- **REJECTED = 0 rows.** D4-janitor-FP (auditor-P4) verified already-landed (e109f49f8, 3 markers live in tasksMdJanitorJob.ts, zero FP since 07-08); no open tracking row → no close-out.
- **GATEWAY BLIND (deviation, task-authorized):** PRE-CLAIM impossible — BOTH `mcp__gateway__` and `mcp__claude_ai_gateway__` prefixes = "no such tool available" (server down). Proceeded (mint idempotent-by-id); no lock to release. This IS live proof for critic-gap (b).
- Reusable: `scripts/po-s143-ultracode-audit-fixall-mint.jq` (registered in po/flow/scripts-registry.md).

## Standing method (survives rotation)
- **Verified-audit mint discipline (★07-13):** CONFIRMED→fix rows S-effort/critical-first; RESCOPE→scope per the VERIFIER Rescope note not the proposal text; UNVERIFIED→per-domain PLAN-ONLY umbrellas w/ pick-time-pre-verify mandatory; REJECTED→0 rows; critic-gaps→investigation rows. DEDUP board-wide FIRST; a proposal that FOLDS into a filed row = annotate/link, never double-mint.
- **Gateway-blind fallback (★07-13):** if the delegated PRE-CLAIM tool is unregistered (both prefixes error), the write path (orch-apply.sh, a LOCAL script) still works — proceed with an idempotent-by-id mint; note the deviation; never fabricate a lock/telegram (send_telegram is itself a gateway call and fails identically).
- **Read own po.md tail BEFORE re-diagnosing a relayed cluster (★07-12).** **Dedup grep covers BOTH terminology AND storage location (★07-12).** **Verify against the EXECUTABLE, not the flow-doc (★07-12).** **RAW-verify SERVING value before disposition (★07-13).** **queued-fix ≠ failed-fix (★07-12).** **Gate the CLASS in one groom, not one row/tick (★07-13); do NOT mass-mutate on a first-pick tick.**
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh` (never raw mv/cp/>); top-level `.head` authoritative; status-flip=lane-move; dedup board-wide before minting; PO returns/mints, dispatcher dispatches; never touch `.head`/in_progress owned by a LIVE worker; NO Agent tool → never spawn.

## Carry-over
- ULTRACODE-AUDIT-FIXALL sprint now draining via dev-team BOUNDED-1. Sequence: UC-RDL-P1 (P0 lock-prefix) first; then P1 CONFIRMED/critic-high-risk. Pick-time pre-verify MANDATORY on every UC-* row (esp. the 8 PLAN-ONLY umbrellas + critic batch — 58 unverified proposals below verify-cap).
- UC-CRITIC-GATEWAY-CONTRACT-DRIFT needs a HEALTHY-gateway session to determine the live tool-binding prefix empirically before reconciling CLAUDE.md ↔ gateway-call-contract.md.
- Cohort batch-reclassify recommendation still open (17 CLUSTER-G `*-FIX` rows) — dispatcher/next-PO to act if churn >2 ticks.
- FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT deploy-gated + architect design touch (async-vs-sync), then ops rebuild + reset queue row 223.