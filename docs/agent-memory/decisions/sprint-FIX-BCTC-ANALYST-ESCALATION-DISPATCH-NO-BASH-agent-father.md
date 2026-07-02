# Decision Journal — Sprint FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH · agent-father

**Sprint goal:** Fix bctc-analyst ESC-3/ESC-4 escalation dispatch — flow mandated `jq | bash
scripts/orch-apply.sh` but the analyst's tool package carries NO Bash (Read/Write/Edit/call_tool
only), so escalations silently failed (HVN ESC-4, FPT E3-cache; signal 8195 / msg 3116).
**Agent:** agent-father
**Started:** 2026-07-02T00:52:25Z

---

### STEP agent-father-S1 · agent-father · 2026-07-02T00:52:25Z
**task-id:** FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH
**what-done:** Rewired all 3 orch-state.json direct-write points in bctc-analyst's escalation
path (main.md ESC dispatch, esc-coverage-guard.md ops signal, deep-dive-opus.md output signal)
to `Write(docs/signals/bctc-analyst-{ts}.json)` instead of `jq|bash orch-apply.sh`; added
dashboard|file source branch to dev-team's drain-esc-dispatch.md + `source="file"` tag in
drain-signals.md §0a-1.
**what-considered:**
- Option A (chosen) — file-based signal via Write tool, reusing the Cross-Team Signal Directory
  pattern already codified in agent-chaining-protocol.md and already used by bctc-analyst for
  routine bctc_signal_*.json files.
- Option B — grant Bash to bctc-analyst's tool package. Rejected: heavier surface change, and
  found live evidence (docs/signals/processed/bctc-analyst-20260630T151500Z.json GVR ESC-4,
  bctc-analyst-20260701T151800Z.json HPG data-coverage-gap) that field agents ALREADY improvised
  Option A successfully and it drained/routed-to-po fine — proves the file path works end-to-end.
**why-decision:** PO triage preferred A; found direct production proof the pattern already
works (dual schemas parsed fine by drain-signals.js fallbacks); zero application-code touch;
matches CLAUDE.md/agent-chaining-protocol.md SSOT (cowork agents use docs/signals/, never
orch-state.json directly).
**why-change:** drain-esc-dispatch.md's step 6 "mark row RESOLVED" and step 2's "mark row READ"
assumed a live orch-state.json row (0a-D only) — file-sourced rows (0a-1) have no such row (the
canonical script already archives to processed/). Added row.source branch so file-origin rows
are not force-marked against a non-existent queue row.
