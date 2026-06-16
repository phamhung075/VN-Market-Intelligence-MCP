## Task Report FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK

changed: [docs/agents/system-auditor/flow/main.md, docs/agents/system-auditor/flow/tier1-probe.md] (at commit 220b48c5 — not QA's write)
tests: VERIFICATION-ONLY (no bun test / tsc scope — doc-only fix; emit schema is validated live) | schema: PASS | emit-probe: PASS | blocks-migrated: PASS
verdict: APPROVED (PASS → done_verified)

### Live Schema Verified

Live schema from `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` L39-51 (SignalTypeSchema):
```
z.enum(["urgent_news","price_anomaly","cross_validate","suppress","chain_catalyst",
        "fundamental_validation","price_confirmation","verified_chain",
        "signal_feedback","legal_risk","verified_decision"])
```
Required top-level args: `from_agent` (string), `to_agent` (string), `signal_type` (enum above), `payload` (object).
`signal_feedback` IS in the enum. Old auditor types (microservice_degraded, data_stale, db_integrity_breach, system_health_report) are NOT — confirmed rejected by live Zod validation.

### Emit Probe Result (raw)

Bun exec inside `vn-market-intelligence-mcp-mcp-server-1` (Up 2h, healthy):
```
SCHEMA_VALID: signal_type=signal_feedback
OLD_SCHEMA_REJECTED: GOOD - microservice_degraded not in enum ([{"received":"microservice_degraded","code":"invalid_enum_value",...)
DB_WRITE_SUCCESS: signal_id=6342
```
Read-back from live named-volume DB:
```json
{
  "id": 6342,
  "from_agent": "system-auditor",
  "to_agent": "po",
  "signal_type": "signal_feedback",
  "status": "pending",
  "created_at": "2026-06-16T15:51:25.045Z",
  "payload": "{\"title\":\"QA live emit probe: FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK\",...}"
}
```
No MCP -32602. Signal reached coordination bus.

### All Blocks Migrated (grep)

`grep -rn "post_agent_signal" docs/agents/system-auditor/` — 5 actual `call_tool` invocation blocks:
- `tier1-probe.md:75` — A-20 emit, uses `signal_type: "signal_feedback"` NEW
- `tier1-probe.md:127` — Tier-1 general emit per failure, uses `signal_type: "signal_feedback"` NEW
- `main.md:195` — Tier-2 E-1 data_stale emit, uses `signal_type: "signal_feedback"` NEW
- `main.md:488` — Tier-3 E-1 db_integrity_breach emit, uses `signal_type: "signal_feedback"` NEW
- `main.md:516` — Tier-3 Roll-Up signal, uses `signal_type: "signal_feedback"` NEW

Old stale top-level `"type"` field: absent from all 5 blocks (confirmed by `git show 220b48c5` diff).
Prose references (main.md L335 doc-audit-git-err, L454 null-guard): correctly say `signal_type: signal_feedback`.
orch-state signal_queue rows (main.md L218, L510): retain `"type": "data_stale"/"db_integrity_breach"` — these are queue routing fields, not `post_agent_signal` args (intentionally left intact per 220b48c5 commit message).

### Orch-State Flip

review → done_verified | atomic temp→rename | conservation: review 7→6, done 154→155 | commit: fc7ff7b7
