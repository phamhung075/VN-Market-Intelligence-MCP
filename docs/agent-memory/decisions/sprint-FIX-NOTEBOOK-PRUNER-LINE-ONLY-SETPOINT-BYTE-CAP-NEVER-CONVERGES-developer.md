# Decision Journal — Sprint FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES · developer

**Sprint goal:** notebook-auto-prune.sh actuator/detector axis mismatch — line cap has an actuator, byte cap (TE-T24, 12000B) has only a detector; pruner never fires on the byte axis.
**Agent:** developer
**Started:** 2026-07-28T12:12Z

---

### STEP developer-S1 · developer · 2026-07-28T12:15Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** Zone check: `scripts/` → specialist `developer` (system-map.json), handled directly, no dispatch. Re-read the row note in full — premise correction confirmed (byte cap already exists via context-bloat-backstop.sh:119-123, do NOT re-derive it).
**what-considered:**
- only path: the row is unusually complete and explicit about scope (notebook-auto-prune.sh :135/:174 only); no design ambiguity to weigh.
**why-decision:** re-dispatch note explicitly warns against re-deriving an already-correct byte cap — confirmed via direct read of context-bloat-backstop.sh before touching anything.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-28T12:25Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** Derived BYTE_CAP in notebook-auto-prune.sh as `LINE_CAP * 60` where LINE_CAP is read at runtime from `docs/data/file-size-caps.json` (the SAME SSOT context-bloat-backstop.sh reads), not a second hardcoded 12000 literal.
**what-considered:**
- hardcode `BYTE_CAP=12000` directly in notebook-auto-prune.sh (matches backstop's numeric result but duplicates the literal a second time)
- read LINE_CAP from the JSON SSOT row (`pattern=="docs/agent-memory/notebooks/*.md"`) and compute BYTE_CAP=LINE_CAP*60 (single source of truth for the cap value; multiplier duplicated across 2 independent hook scripts is acceptable, the CAP NUMBER is not)
**why-decision:** row explicitly cites the USD/VND three-SSOT incident as the failure class to avoid; reading the cap value from one JSON row keeps both hooks in lockstep if the cap is ever retuned, with a `200` literal fallback only if the SSOT is unreadable/malformed (defensive, not a duplicate source of truth).
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-28T12:32Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** Changed early-exit (:135, was `[ "$LINE_COUNT" -le 200 ] && exit 0`) and loop-break (:174, was `[ "$LINE_COUNT" -le 200 ] && break`) to recount BOTH lines and bytes and require BOTH `<=` cap before stopping. Loop recount switched from `echo` to `printf '%s\n'` piping so the byte count measured matches exactly what the final atomic write (`printf '%s\n' "$FILE_CONTENT" > "$TEMP"`) produces.
**what-considered:**
- only path: dropping a section reduces lines AND bytes together (confirmed by row note and by tracing the drop-oldest logic) — the fix is purely the stopping-condition conjunction, no change to which section gets dropped or how.
**why-decision:** minimal, mechanical change matching the row's stated remedy exactly; no new failure modes introduced (both counts already computed from the same FILE_CONTENT variable each iteration).
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-28T12:40Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** OPEN QUESTION DECISION — chose option [a]: kept the existing single-section safe-fail behaviour unchanged (emit `notebook_single_section_overage_breach`, do NOT truncate), now reachable via the byte axis too. Added `byte_count`/`byte_cap` fields to both safe-fail signal payloads (unparseable + single-section) for audit parity with context-bloat-backstop.sh's payload shape.
**what-considered:**
- [a] keep safe-fail as-is — honest signal, no data loss, smallest change, consistent with current contract
- [b] additionally enforce ~60L-per-section rule on the byte axis — rejected: not requested by the row, adds a new enforcement dimension (per-section byte budget) with no existing detector/actuator pairing to model it on, and risks exactly the "truncate mid-section" outcome explicitly forbidden
**why-decision:** row states [a] is default "unless you find concrete evidence against it" — found none; [b] would be net-new scope requiring its own design, not a lockstep fix.
**why-change:** no change from plan.

### STEP developer-S5 · developer · 2026-07-28T12:50Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** Built `scripts/agents-flow/notebook-auto-prune.test.sh` (4 cases: T1 byte-axis regression 142L/30403B→49L/10166B 2 sections remain no safe-fail; T2 line-axis guard 250L/3920B→167L no safe-fail; T3 within-both-caps 130L/2014B untouched hash-identical; T4 single-section byte-only breach 67L/18145B → hash-identical, safe-fail signal emitted with byte_cap=12000). All 4 PASS. Re-ran existing `test-notebook-auto-prune.sh` (5/5 PASS, timestamp-ordering + duplicate-heading tests unaffected) and `context-bloat-backstop.test.sh` (4/4 PASS, unrelated script untouched) as regression guards.
**what-considered:**
- extend context-bloat-backstop.test.sh vs new sibling notebook-auto-prune.test.sh (row offered either) — chose sibling: keeps backstop's own test file scoped to the detector-only script it tests, avoids conflating two different scripts' fixtures/signal-dir assumptions in one file.
**why-decision:** sibling file mirrors the established `<script>.test.sh` naming convention (12 other examples in scripts/agents-flow/) and keeps signal-dir cleanup/assertions unambiguous per script under test.
**why-change:** no change from plan.

### STEP developer-S6 · developer · 2026-07-28T13:05Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** CI baseline established fresh (not trusted from the 3-day-old row note): `cd apps/mcp-server && bun test` → 14824 pass / 40 skip / **53 fail** / 47043 expect() calls across 1231 files (591s). This is far more red than the "ONE pre-existing failure" noted 2026-07-25 — baseline moved as the row itself warned it might. Confirmed `1408-tool-diacritics.test.ts:113` (the originally-cited failure, owned by FIX-BDI-SHIPPING-STALE-404-GUARD) is still failing, unchanged, among the 53. This change touches ZERO files under `apps/mcp-server/` (scope is `scripts/agents-flow/*.sh` only) — zero net new failures is structural, not measured-and-hoped.
**what-considered:**
- only path: run the full suite myself per explicit instruction rather than trust the stale count.
**why-decision:** the row explicitly predicted the baseline may have moved; it had. Reporting the real number (53) rather than the stale one (1) is the honest-report obligation.
**why-change:** none — this is a finding, not a plan change (no TS code touched, so no fix-baseline work is in scope here).

### STEP developer-S7 · developer · 2026-07-28T13:10Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** FOLLOW-UP FINDING (not fixed, out of scope): `scripts/agents-flow/notebook-linecap-sweep.sh` (the 6h cron backstop for writes that bypass the PostToolUse hook, TE-T17) has its OWN independent line-only pre-filter (`[ "$line_count" -le 200 ] && continue`) BEFORE it ever delegates to notebook-auto-prune.sh. A notebook that is byte-over/line-under and written via a non-hook path (Bash heredoc/append) will never reach the now-fixed pruning logic via this cron path — only the PostToolUse hook's direct-call path is fixed. Flagging for the dispatcher/PO to decide whether a follow-up task is warranted; NOT fixed here (outside this row's explicitly enumerated scope: notebook-auto-prune.sh :135/:174 only).
**what-considered:**
- fix it inline as a "cheap rider" (row explicitly allowed this ONLY for notebook-write/SKILL.md AC-5, not for notebook-linecap-sweep.sh) — rejected: not enumerated in scope, not a 1-line change (its own pre-filter would need the same LINE_CAP/BYTE_CAP derivation), and "NEVER touch files outside assigned task scope" is a standing boundary rule.
**why-decision:** report honestly rather than silently expand scope or silently leave an undocumented gap.
**why-change:** none.
