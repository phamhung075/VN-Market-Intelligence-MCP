# Decision Journal — Sprint FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION · developer

**Sprint goal:** Stop matcher diagnostics from polluting the preflight JSON parse so cadence-skip ticks route through the cheap SILENT/WORK path instead of falling back to full cowork flow.
**Agent:** developer
**Started:** 2026-07-03T05:30:00Z

---

### STEP developer-S1 · developer · 2026-07-03T05:45:00Z
**task-id:** FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION
**what-done:** Moved cowork-match-slots.js L203/L228 diagnostics from console.log to console.error; confirmed no other stray stdout writes exist besides the one intended process.stdout.write JSON emit (console.warn at L156 already goes to stderr by Node default).
**what-considered:**
- only path: root-cause was two console.log calls sharing the stdout fd with the JSON contract — moving both to console.error is the minimal, correct fix (no new deps, no behavior change to the JSON contract).
**why-decision:** console.error routes to fd 2, leaving fd 1 exclusively for the JSON contract — matches the script's documented contract (header comment: "Output: JSON object").
**why-change:** no change from plan.

---

### STEP developer-S2 · developer · 2026-07-03T05:55:00Z
**task-id:** FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION
**what-done:** Fixed cowork-tick-preflight.sh Step 6 to capture matcher stdout/stderr separately (`slot_err=$(mktemp)`; `2>"$slot_err"` instead of `2>&1`), including stderr contents in the ERROR verdict detail only on slot_rc!=0, per task's suggested shape.
**what-considered:**
- Suggested shape from task brief (chosen): mktemp temp file for stderr, cat into detail on failure, rm always.
- Alternative (process substitution `2> >(...)`) — rejected: bash-only, less portable, no benefit over mktemp for this small one-shot capture.
**why-decision:** mktemp+cat is simplest, matches script's existing bash-only style (set -u, no new deps), and keeps the exit!=0 detail-surfacing behavior byte-for-byte equivalent (just reading from file instead of merged buffer).
**why-change:** no change from plan.

---

### STEP developer-S3 · developer · 2026-07-03T06:05:00Z
**task-id:** FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION
**what-done:** Verified fix via existing suites (16/16 cowork-match-slots.test.js, 20/20 cowork-tick-preflight.test.sh incl. T3c error-path) plus two scratchpad harnesses: (a) direct matchSlots() invocation forcing cadence-skip + cadence-suppress branches — stdout stayed pure JSON, diagnostics landed on stderr; (b) Step-6 block extracted verbatim with stub SLOT_MATCHER_CMD (ok-with-noise / exit-1-with-stderr) — confirmed WORK verdict parses slots cleanly and ERROR verdict surfaces stub's stderr in detail.
**what-considered:**
- only path: live preflight run against real MCP was explicitly disallowed (claims real election locks) — harness + suite verification was the only available option.
**why-decision:** Suite + harness evidence covers both the JS diagnostic-relocation and the bash capture-split independently, satisfying all 3 acceptance criteria without touching live locks.
**why-change:** no change from plan.
