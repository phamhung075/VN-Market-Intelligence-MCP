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

### STEP ba-S2 · ba · 2026-07-16T15:35:18Z
**task-id:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT
**what-done:** Determined canonical gateway prefix empirically + via git archaeology (`.mcp.json` only registers `"gateway"`; commit 775e2d8ee 2026-06-16 is an explicit fleet-wide rename `claude_ai_gateway`→`gateway`, 13 agents+CLAUDE.md; contract doc (ad96bd166, 06-14) predates rename and was out of its scope). Wrote fix table (6 live files) + exclusion list (~40 historical files, do not edit). Zero PO blockers.
**what-considered:**
- Trust router's "likely correct, verify independently" framing at face value vs re-derive from scratch — re-derived: found the actual rename commit, which upgrades "likely" to "certain" and gives architect exact line numbers with dated proof, not just a probe result.
- Fold I11 (task-lock SKILL.md:169) + I14 (tran-ngoc-bau bootstrap.md:30) into this fix batch vs leave separate — left as architect's call: both already change-specified in the same audit brief, neither has a board row yet, no PO-level decision needed either way.
**why-decision:** Git-log proof (dated rename commit + pre/post ordering vs contract-doc creation date) is stronger and cheaper for architect to verify than repeated live probing; closes the question definitively instead of leaving "likely".
**why-change:** No change from plan — router asked for empirical+registry confirmation, delivered plus the causal history explaining WHY the drift exists (missed-scope rename), which the router's task note didn't have.
