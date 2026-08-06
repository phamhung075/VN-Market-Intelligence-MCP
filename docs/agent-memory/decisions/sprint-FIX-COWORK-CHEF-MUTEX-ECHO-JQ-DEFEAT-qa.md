# Decision Journal — Sprint FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT · qa

**Sprint goal:** Close the 2nd-occurrence CHEF same-tick mutex defeat, durably — as tested code, not prose.
**Agent:** qa
**Started:** 2026-08-06T00:00:00Z

---

### STEP qa-S1 · qa · 2026-08-06T00:00:00Z
**task-id:** FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT
**what-done:** Direct-commit verify of `120e5d42b`. Confirmed real+on-main-ancestry, touches all 3 claimed files. Independently re-ran `node scripts/agents-flow/cowork-chef-mutex.test.js` myself: 25/25 PASS (not trusted from review_note prose). `mock-guard.sh --files` PASS on the new production script. `bun tsc --noEmit` (apps/mcp-server) 0 errors — commit touches zero TS/apps files so this is a no-regression baseline, not a targeted check.
**what-considered:**
- Trust review_note's 25/25 + AC-proof claims as-is — rejected, house rule requires raw re-verification, not badges.
- Re-run the test file directly + independently reproduce the AC scenario live against the real unmodified `docs/data/cowork-schedule.json` — chosen.
**why-decision:** Live-reproduced BOTH failure modes myself under the real interpreter (zsh) against the real (unmodified) schedule file: (a) the OLD `echo "$SCHEDULE" | jq` pattern still throws the exact historical "Invalid string: control characters" parse error on today's live data — proves the defect is real, not just a synthetic-fixture artifact; (b) the NEW documented Step 4.5c invocation (`printf '%s' | node cowork-chef-mutex.js` → `jq -n --argjson`) run against MATCHES=[chef-morning, chef-intraday] on the same real file yields `chef_mutex_applied:true`, exactly one surviving CHEF dish (`chef-morning`), `dropped:["chef-intraday"]` — AC satisfied end-to-end, not just unit-asserted.
**why-change:** No change from plan — verdict APPROVED/DONE_VERIFIED.
