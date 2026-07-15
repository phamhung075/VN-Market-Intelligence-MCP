# Decision Journal — Sprint FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP · developer

**Sprint goal:** Stop cowork-tick-preflight.sh Step 2 from heartbeating session-presence without a prior claim, which false-ERRORs every fresh session's tick-1 into the expensive LLM fallback.
**Agent:** developer
**Started:** 2026-07-15T20:10:00Z

---

### STEP developer-S1 · developer · 2026-07-15T20:20:00Z
**task-id:** FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP
**what-done:** Rewrote Step 2 of scripts/agents-flow/cowork-tick-preflight.sh to claim-first (task_claim on `session-presence:<session>`, `task_kind:"session-presence"`), heartbeat only on re-entry by the same session, and proceed unconditionally — removed both prior ERROR branches (transport error, ok=false). Updated header comment (L13 block) to describe the new claim-first/never-gates contract.
**what-considered:**
- only path: mirror `docs/agents/cowork-team/flow/main.md` Step 0b.1 verbatim (claim → heartbeat-on-re-entry-by-self → always proceed) since that pattern is already the project's canonical, already-correct contract; no alternative shape considered.
**why-decision:** Matching the already-proven main.md pattern keeps the two presence implementations in sync and directly removes the root cause (heartbeat-without-claim on a lock that doesn't exist yet for fresh sessions) rather than patching a symptom (e.g. softening the ok=false branch into a WORK/SILENT verdict instead of removing the gate).
**why-change:** no change from plan.

---

### STEP developer-S2 · developer · 2026-07-15T20:35:00Z
**task-id:** FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP
**what-done:** Rewrote test T3 (old: "ERROR verdict (presence transport failure)") into the new non-gating contract, and added 3 new cases: fresh-session claim (T3-presence-fresh), re-entrant same-session claim+heartbeat-renewal (T3-presence-reentrant), and peer-held claim (T3-presence-peer) — all assert verdict SILENT (never ERROR). Extended the stub's `mcp_call`/call-log to tag each logged call with `task_kind`/`task_id` (was tool-name-only) so tests can assert the presence claim is tagged `task_kind:"session-presence"` and never leaks into a `cowork-slot`-kind claim (exactly 1 `task_claim|cowork-slot` line per run — the election only).
**what-considered:**
- Only path for lock-leak assertion: since this is a stubbed unit suite (no live server), assert via call-log tagging rather than a real `task_list_held` round-trip; supplemented with a live smoke run (disposable dummy session, twice) confirming real verdict=SILENT and a real `task_list_held(task_kind="cowork-slot")` query showing no orphaned row from the smoke sessions.
**why-decision:** Call-log tagging directly proves the presence claim never carries `task_kind:"cowork-slot"` (the exact copy-paste risk that would cause a leak), which is the root-cause-level assertion; the live smoke run is corroborating evidence, not a substitute (avoids flaky non-deterministic live-state assertions in the deterministic suite).
**why-change:** no change from plan. Full suite green 27/27 (was 20/20 baseline; net +7 checks: -3 old T3 assertions +10 new across 3 new cases).
