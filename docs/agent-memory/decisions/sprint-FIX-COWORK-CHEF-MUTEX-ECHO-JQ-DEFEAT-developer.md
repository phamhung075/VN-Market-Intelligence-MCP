# Decision Journal — Sprint FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT · developer

**Sprint goal:** Close the 2nd-occurrence CHEF same-tick mutex defeat (pressure-cadence.md Step 4.5c `echo "$VAR" | jq` corrupted by zsh's escape-interpreting `echo`), durably — as tested code, not prose.
**Agent:** developer
**Started:** 2026-07-28T14:20:00Z

---

### STEP developer-S1 · developer · 2026-07-28T14:35:00Z
**task-id:** FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT
**what-done:** Reproduced the defect live (`zsh -c 'echo "$SCHEDULE" | jq ...'` on the real cowork-schedule.json → the exact "control characters ... must be escaped" parse error), then extracted the Step 4.5c mutex into `scripts/agents-flow/cowork-chef-mutex.js` (pure `applyChefMutex` + CLI reading MATCHES via stdin, schedule file-direct) with a companion test harness proving both the fix and a regression guard that reproduces the old echo-corruption on the real chef-intraday `trigger_prompt` fixture. Rewired pressure-cadence.md Step 4.5c to call the script via `printf '%s' | node ...` + `jq -n --argjson` (never `echo`).
**what-considered:**
- Minimal doc-only patch (swap `echo` for `printf`/`jq -n --argjson` inline) — rejected as insufficient given this is the 2nd regression of a prose-only fix; row explicitly prefers extraction.
- Extract to tested `scripts/agents-flow/` helper (chosen) — matches CLAUDE.md script-persistence + sibling pattern (`cowork-write-last-fired.js`, `cowork-match-slots.js`).
**why-decision:** Only the extracted, tested form is falsifiable by CI/re-run; a doc-only fix is exactly the shape that regressed once already (lesson `feedback_cowork_chef_mutex_echo_jq_mangles_escaped_newline`).
**why-change:** No change from plan — row's prescribed direction was followed as given.
