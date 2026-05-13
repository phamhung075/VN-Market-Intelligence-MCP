# PO Notebook

## Last updated: 2026-05-13T23:14:12Z (c86 TNB triage — BATCH(2): AUTOCURE-C86-MW-DEDUP + SPIKE_C86_MCP_REG)

---

## Cycle 86 triage (TNB audit-handoff drain)

### Trigger
TNB audit cycle 47 drained (signal fingerprint `2ec368436e4eb302`, file moved to `docs/signals/processed/`). Overall NEEDS_ATTENTION; direction STABLE-IMPROVING. WIP 0/2 — full headroom.

### Step 0-TNB — ACK appended
TNB c47 handoff ACK appended to `docs/handoffs/tnb-audit-latest.md` with per-rec disposition. 10 findings + 6 recs triaged.

### TNB recommendation disposition

| Rec | Disposition | Where it goes |
|---|---|---|
| #1 — Confirm 1903a deploy (`get_macro_snapshot` + `write_alert_verdict`) | Code SHIPPED c77/c82 (`d5251193`). Only `[UNVERIFIED]` label in tool package stale. | **NEW 1903a-labels** → Todo (MEDIUM CHORE, dev) |
| #2 — Add `get_cash_flow` to fin-analyst pkg (4-cycle Layer 7 skip) | Overlaps 1890a methodology-toolpkg umbrella. | **FOLDED into 1890a** + bumped MEDIUM→HIGH, scope expanded 3→4 tools |
| #3 — alert-commander stage-bootstrap.md note (c46 carry) | `.claude/` write-protected in cowork; dev-team applies. | **NEW 1903b-doc-self-heal** → Todo (MEDIUM CHORE, dev) |
| #4 — MCP gateway session registration (c47 had no handle) | High-leverage diagnostic — recurring blocker for live audits. | **SPIKE_C86_MCP_REG → BATCHED this cycle** (timebox 120m, ops zone) |
| #5 — US10Y 4.49% (0.01% from threshold) | Threshold-cross logic exists in alert-commander/news-scout. | Notebook watchlist carry, no task |
| #6 — BCTC banking cohort 02:00 UTC 2026-05-15 | Cron wired; observational. | Notebook reminder, no task |

### Pre-staged auto-cure
TNB applied `.claude/flows/market-watcher/cycle.md` Step 4 off-hours duplicate guard (UNCOMMITTED). 3-cycle threshold met c47 (GAS/VRE 15:40/19:41/21:38 UTC unchanged-close re-emits). Wrapped as **AUTOCURE-C86-MW-DEDUP** in BATCH for developer commit+push.

### Decision: BATCH(2)
**Priority applied:** auto-cure ship > SPIKE (recurring blocker) > new Todos for next cycle.

1. **CHORE/AUTOCURE — AUTOCURE-C86-MW-DEDUP** (zone: `.claude/` cross-service). Single uncommitted file. Developer commits + pushes. baseline_pass: tree-verify (doc change only, no test impact).

2. **SPIKE — SPIKE_C86_MCP_REG** (zone: `apps/mcp-server/` + cowork-desktop config). Timebox 120m. ops investigates whether c47 MCP no-registration is config gap or sporadic. Output: `docs/spikes/SPIKE_C86_MCP_REG.md`.

Disjoint owners (developer vs ops), disjoint zones — both parallel-eligible. WIP 0→2.

### Items declined / deferred to c87+
- **1890a (HIGH now)** — needs ba spec first; queue when WIP frees. Heightened priority due to 4-cycle Layer 7 carry.
- **1903a-labels, 1903b-doc-self-heal** — sit in Todo (MEDIUM), dispatch c87+ when WIP capacity available; both `.claude/` zone dev chores.
- **JANITOR-020/014/011** — code-janitor cron picks up.
- **TASK-BCTC-3** — dev-vps-crawls parallel stream.
- **1900c, 1899a-bloomberg-test-split** — LOW, non-blocking.
- **1862c-E/F, 1897b-carry** — user/architect blocked.

### Carry-forward watchlist to c87+
- **US10Y 4.49%** — 0.01% from Layer 1.2 threshold (4.50%). Any agent seeing breach must explicit cross-flag. Confirm logic still works in flows.
- **BCTC banking cohort 2026-05-15** — ACB/BID/CTG/EIB/MBB/VCB/VPB. Verify financial-analyst + report-analyzer cycles fire at 02:00 UTC.
- **Silent agents (TNB UNAUDITABLE)** — financial-analyst (no 2026-05-13 cycle), digest-predict (last 2026-05-11), report-analyzer (last 2026-05-12 02:02 UTC 0-earnings exit). Re-audit c87+; if still silent → ops cron-cadence task.
- **HEAD.lock pressure** — 6/6 lock-free or 1-retry PREFLIGHTs since c69; trend confirmed subsiding.
- **AUTOCURE-C86-MW-DEDUP result** — confirm market-watcher next off-hours cycle shows SUPPRESSED log for unchanged-price re-scans (validates guard).
- **SPIKE_C86_MCP_REG result** — if config gap, immediate fix task. If sporadic, ops monitors with reproduction harness.

### Hard-constraint compliance
- WIP ≤ 2: PASS (0 → 2).
- Disjoint zones: PASS (`.claude/` doc vs `apps/mcp-server/` infra).
- Disjoint owners: PASS (developer vs ops).
- Zone tag on every row: PASS.
- Recurring-bug rule: SPIKE_C86_MCP_REG is escalation, not duplicate fix — c47 MCP-not-registered is distinct from c46 connection-refused.

### Sign-off
c86 BATCH(2) emitted. PO sub-flow EXITs to main terminal Step 3 (direct dispatch — AUTOCURE is CHORE, SPIKE goes direct to ops; no architect/BA gate needed). Notebook OVERWRITE complete.
