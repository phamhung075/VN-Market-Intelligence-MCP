# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** no active sprint goal matched this task; resolved per skill mechanical rule (latest active sprint_goal.entries row) — this task is an unrelated cross-service P1 FIX, ambient to this sprint slot.
**Agent:** developer
**Started:** 2026-07-23T10:03:26Z

---

### STEP developer-S1 · developer · 2026-07-23T10:03:26Z
**task-id:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY
**what-done:** Extracted drain-signals.js's inline "SKIP non-signal shape" check into a shared `isDrainableShape()` + read-only `--count-drainable` subcommand; both the drain-signals.md MANDATORY PERSIST GUARD and dev-team-tick-preflight.sh Step 5 idle-check now call it instead of a raw `ls docs/signals/*.json | wc -l`.
**what-considered:**
- Reimplement the from/type check in bash/jq inside the preflight script — rejected, task explicitly forbids forking a second predicate definition.
- Only fix drain-signals.md's own guard, leave preflight's idle-check raw-counting — rejected, preflight's own header comment says it mirrors the SAME guard fields, so leaving it raw would keep forcing Step 0a on litter-only ticks (the exact starvation symptom).
- Add `DRAIN_SIGNALS_DIR_OVERRIDE` env seam (mirrors existing `ORCH_APPLY_LIVE_FILE_OVERRIDE` convention) so the preflight's isolated test fixtures reach the shared script without touching live docs/signals/.
**why-decision:** Single source of truth for "is this a routable signal" — script is already the canonical drain implementation per drain-signals.md's own CANON-SCRIPT note; sharing it (not forking) is the only option consistent with that existing precedent and the task's explicit instruction.
**why-change:** Mid-implementation caught a real bug during verification: my first `sed -n 's/.../\+.../p'` extraction used GNU-only `\+` (BRE), which BSD/macOS `sed` silently fails to match — count came back empty on this host, masking the whole fix (idle-check always read 0, always "idle"). Replaced with portable bash parameter-expansion prefix-strip; caught only because I live-verified the guard decision on both fixtures per the task's hard gate, not by trusting green tests alone (the tests I'd hand-written matched the same buggy assumption until re-run against the real macOS sed).
