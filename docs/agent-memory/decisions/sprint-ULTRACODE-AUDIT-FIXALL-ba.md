# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · ba

**Sprint goal:** Drain CONFIRMED/RESCOPE findings from the 2026-07-12 ultracode workflow audit.
**Agent:** ba
**Started:** 2026-07-16T04:29:00Z

---

### STEP ba-S1 · ba · 2026-07-16T04:29:00Z
**task-id:** UC-ASL-P2
**what-done:** Verified all 6 EMIT SEQUENCE copy sites line-exact at HEAD, confirmed sites 3/4 (D-IMPROVE/D-BCTC-EVAL) never had E-1/E-2 (asymmetry the script must preserve), wrote FR spec with DDD mapping + durable-ledger persistence shape, zero PO blockers.
**what-considered:**
- Fold I3's signal_type-mismatch fix into this task (script auto-corrects `signal_feedback`→`microservice_degraded`) → rejected: separate confirmed issue (I3), different task, scope creep the brief itself never asked for.
- Repoint context-bloat-backstop.sh's dead known-issues.json gate at the new ledger vs delete it → recommended delete: fingerprint namespaces (`context_bloat:<path>` vs `<type>:<id>:<check_id>`) are semantically unrelated; repoint would silently change suppression behavior, not a like-for-like swap.
**why-decision:** Preserve exact current behavior for sites 3/4 and the dead gate — the CONFIRMED brief's own verifier evidence (0 matching fingerprints ever) supports deletion as the behavior-neutral choice; only flag genuinely open design calls (severity-escalation bypass, zone label) to architect, not PO.
**why-change:** No change from the brief's plan — added 3 ARCH-RATIFY items (not PO blockers) since these are technical, not business/priority, decisions; recommended narrowing the dispatched `cross-service/` zone since no touched file is `apps/<service>/`.
