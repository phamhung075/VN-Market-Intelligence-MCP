# Decision Journal — Sprint FIX-BCTC-ENRICHER-STUCK-BACKLOG · qa

**Sprint goal:** Fix enricher terminalizing statements never setting last_attempt (Arm-2 grace retry
structurally dead) causing 23 HOSE rows false-terminal; unpark + verify LIVE against running mcp-server.
**Agent:** qa
**Started:** 2026-07-03T05:54:00Z

---

### STEP qa-S1 · qa · 2026-07-03T05:57:00Z
**task-id:** FIX-BCTC-ENRICHER-STUCK-BACKLOG
**what-done:** Final behavioral DoD gate — RAW re-verified deploy + live DB state + idempotency, did not take dev-mcp-server's review_note on faith.
**what-considered:**
- Trust review_note claims as-is → rejected, task explicitly says "do NOT take on faith — re-verify"
- Query bctc_vps_queue live via bun:sqlite inside the running container (no sqlite3 CLI present) → chosen, only path that reaches actual serving state
- mcp gateway tool call → not attempted first-hand (per instructions INV-GATEWAY-1 empirically common in qa sub-sessions); direct docker exec + bun:sqlite achieves the same RAW-verify goal with less risk
**why-decision:** Independent re-derivation of every claim (image sha/health/mem, git ancestor, row 255868 attempts/last_attempt, idempotency predicate, 8/8 test, tsc clean) — all matched or exceeded (found a 2nd proof row HVN, higher drain count 18/21 vs claimed 4/21, and a non-blocking CTG anomaly out of scope) → PASS.
**why-change:** No change from plan; router's gate contract fully satisfied by live evidence.
