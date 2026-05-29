# Architecture Brief — BCTC Analyst Merge
**Date:** 2026-05-29  
**Author:** agents-architect  
**PO Decision:** MERGE (2026-05-29)  
**Status:** MERGE-OK — no blocking concerns  
**Target:** agent-father for implementation  
**Signal:** `docs/signals/bctc-analyst-merge-20260529T042613Z.json`

---

## Problem Statement

Two agents (`financial-analyst`, `report-analyzer`) share identical infrastructure, permissions, tool packages, knowledge loads, and signal shape (business-context fields: product/customer/ops/mgmt). Their only behavioral difference is **trigger cadence**: `financial-analyst` runs twice-daily on a cron; `report-analyzer` is event-driven (earnings release). This split forces two agent definition files, two cron entries, two tool packages, two notebooks, and a signal type divergence (`bctc_signal` vs `fundamental`) that chef (`unified-agent`) must dual-accept as a reader. Merging eliminates duplicated maintenance surface and simplifies the chef reader contract.

---

## (a) Signal-Type Unification

**Recommendation: single canonical `bctc_signal` with discriminator field — DROP `fundamental` type.**

Rationale:
- Both agents post to alert-commander as `fundamental_validation`. That contract is already unified.
- The only divergence is the file-materialized signal in `docs/signals/`: `bctc_signal_*.json` (financial-analyst) vs `fundamental_*.json` (report-analyzer).
- Chef reads these signals as Layer 4 (4-pillar valuation) context. It does not branch on signal type — it reads the business-context fields (product/customer/ops/mgmt) which are identical in both schemas.
- Adding a `mode` discriminator field to the canonical `bctc_signal` shape gives chef a forward-compatible routing hint without requiring separate parser branches.

**Canonical shape for `bctc_signal`:**
```json
{
  "ticker": "FPT",
  "signal_type": "bctc_signal",
  "quarter": "Q1-2026",
  "mode": "routine | release",
  "beat_miss": "beat | miss | in-line | null",
  "net_profit_delta_pct": 18.2,
  "product": "...",
  "customer": "...",
  "ops": "...",
  "mgmt": "..."
}
```

- `mode=routine` → twice-daily analysis cycle (former financial-analyst path)
- `mode=release` → earnings release detected (former report-analyzer path)
- `beat_miss` is required when `mode=release`; `null` when `mode=routine`
- `net_profit_delta_pct` is required when `mode=release`; omit when `mode=routine`

**File naming:** `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json`
- Former `fundamental_*.json` naming is DEPRECATED upon migration completion.

**Chef transition:** Keep dual-accept (`bctc_signal` OR `fundamental` signal_type) ONLY during the migration window (Step H-1 through H-3 below). After H-3 archive, chef drops the `fundamental` fallback branch.

---

## (b) Mode-Switch Logic in `cycle.md`

The merged agent's single `cycle.md` must execute a **calendar gate at cycle start** before any analysis:

```
Step 0b — Mode Selection (MANDATORY, runs every invocation)
  call get_earnings_calendar()
  IF new ĐÃ NỘP releases today for watchlist tickers:
    MODE = release
    TICKERS = [list of newly-filed tickers only]
  ELSE:
    MODE = routine
    TICKERS = get_watchlist() [full watchlist]
  
  Set signal.mode = MODE for all signals this cycle.
```

Sequencing rule: Mode selection runs AFTER bootstrap (Step 0 regime extraction) and BEFORE BCTC fetch. A single cycle may detect BOTH new releases AND run routine analysis — in that case, process release tickers first (they are time-sensitive), then routine remainder. Each ticker's signal carries its own `mode` field.

---

## (c) Ledger Ownership

**Release-mode ONLY writes `docs/analysis-briefs/{TICKER}.md`.**

Routine-mode does NOT write ledger entries. This preserves the existing constraint from report-analyzer: ledger entries are append-only on confirmed earnings events, not on every twice-daily cycle pass.

Rule to encode in merged cycle.md:
```
IF mode == release:
  → Append docs/analysis-briefs/{TICKER}.md per analysis-ledger-template.md
  → Include QoQ/YoY comparison table + verdict sentence
ELSE (mode == routine):
  → No ledger write. Signal bus only.
```

Ledger integrity invariant: every ledger entry MUST carry the eval pill (`BCTC-EVAL: ... = 🟢/🟡/🔴/⬜`) on the same entry line, per existing BCTC Citation Trust Protocol.

---

## (d) Cron Consolidation

**Single cron entry: `0 0,12 * * *`**

The existing financial-analyst schedule (`0 0,12 * * *`) is retained as the merged agent's base schedule. Report-analyzer's event-driven trigger is absorbed by the calendar gate in Step 0b — no separate cron entry is needed because the merged agent already runs at 00:00 UTC and 12:00 UTC and detects earnings at each run.

Cron entry (in `cowork-schedule.json` or equivalent):
```json
{
  "agent": "bctc-analyst",
  "cron": "0 0,12 * * *",
  "description": "BCTC analysis — routine + earnings-release detection"
}
```

`earnings_release_detected` branch is IN-CYCLE (mode gate, Step 0b), NOT a separate cron slot. The former report-analyzer had a separate trigger; it is absorbed. No new RemoteTrigger needed.

---

## (e) Chef Reader Contract

**No rename required. Dual-accept during transition; single-accept after archive.**

Current state: chef reads `bctc_signal_*.json` files from docs/signals/ for Layer 4 business context. Chef does NOT read `fundamental_*.json` by name pattern — it reads via `get_agent_signals(type="fundamental")` or equivalent MCP call. To unify without breaking chef mid-migration:

**Transition contract (Steps H-1 through H-3):**
- Chef accepts `signal_type == "bctc_signal" OR signal_type == "fundamental"` in its signal reader
- This is a 1-line OR condition in chef.md's GATHER step — low risk

**Post-archive contract (after Step H-3):**
- Chef drops the `fundamental` fallback. Only `bctc_signal` accepted.
- No `signal_type` rename — `bctc_signal` is the final canonical name.

Agent-father action: add the dual-accept OR clause to chef.md GATHER step before deploying the merged bctc-analyst, then remove it after archive.

---

## (f) Notebook Consolidation

**New notebook: `docs/agent-memory/notebooks/bctc-analyst.md`**

- Created fresh at migration time (agent-father writes an empty file with `# BCTC Analyst — Notebook`).
- Prior notebooks archived in-place as `docs/agent-memory/notebooks/financial-analyst.md` (last cycle preserved, header updated to `ARCHIVED 2026-05-29`) and `docs/agent-memory/notebooks/report-analyzer.md` (same treatment).
- No content migration needed — both old notebooks contain stale carry-overs the merged agent will regenerate organically.
- Financial-analyst's last meaningful cycle (2026-05-29 00:00 UTC) is preserved in the archive file. Report-analyzer's last meaningful cycle was 2026-05-15 — trivially stale.

Notebook invariant (merged agent): overwrite-at-cycle-end with full cycle entry including `mode` field. Format:
```
### Analysis Cycle (HH:MM–HH:MM UTC) — mode: routine | release
- Mode: routine | release | mixed (N routine + M release)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
- [if release] Earnings: K tickers processed | Beat: X | Miss: Y | In-line: Z
```

---

## (g) Model Selection

**Recommendation: pin `sonnet` as the single model for the merged agent.**

Rationale:
- Report-analyzer was already on `sonnet` (its `.claude/agents/report-analyzer.md` `model: sonnet`) — correctly so: earnings parsing requires structured extraction of PDF tables, beat/miss classification, and ledger writes where haiku produces more errors.
- Financial-analyst was on `haiku`. Its routine cycles (broad watchlist scan, EY spread computation, signal emission) are achievable on haiku, but the merged agent must ALSO handle release mode — and switching models mid-cycle based on mode is not supported by the Claude Code agent SDK.
- The cost delta of haiku vs sonnet for two cycles/day is negligible vs the complexity of a mode-gated model fork.
- Pinning sonnet ensures full quality on the critical release path without a conditional model-select hack.

`model: sonnet` in merged `.claude/agents/bctc-analyst.md`.

---

## (h) Migration Order

**Strict sequence — do not reorder:**

| Step | Action | Owner |
|---|---|---|
| H-1 | Create `.claude/agents/bctc-analyst.md` (new agent definition, sonnet, tools: Read/Write/Edit/mcp__claude_ai_gateway__call_tool) | agent-father |
| H-2 | Create `docs/agents/bctc-analyst/init.md` — merged identity from both init.md files; signal_output_spec includes `mode` + `beat_miss` fields | agent-father |
| H-3 | Create `docs/agents/bctc-analyst/flow/main.md` — thin dispatcher | agent-father |
| H-4 | Create `docs/agents/bctc-analyst/flow/cycle.md` — mode gate (Step 0b) + merged analysis pipeline | agent-father |
| H-5 | Create `docs/agents/bctc-analyst/flow/stage-bootstrap.md` — copy from financial-analyst (unchanged) | agent-father |
| H-6 | Create `docs/agents/bctc-analyst/flow/stage-analyze.md` — copy from financial-analyst + add release-mode comparison table from report-analyzer cycle.md Steps 2–4 | agent-father |
| H-7 | Create `docs/agents/bctc-analyst/flow/stage-log-notify.md` — merged log (notebook format + mode field) + dual WORK message format | agent-father |
| H-8 | Create `docs/agents/tools/package/bctc-analyst.md` — union of financial-analyst + report-analyzer tool packages | agent-father |
| H-9 | Create `docs/agent-memory/notebooks/bctc-analyst.md` — empty bootstrap | agent-father |
| H-10 | Add dual-accept OR clause to `chef.md` GATHER step (transition window begins) | agent-father |
| H-11 | Update `cowork-schedule.json`: add `bctc-analyst` at `0 0,12 * * *`, KEEP old financial-analyst and report-analyzer entries for 24h parallel run | agent-father |
| H-12 | **Flip cron**: remove old financial-analyst + report-analyzer entries from cowork-schedule.json | agent-father (after 24h parallel soak) |
| H-13 | Archive old notebooks: add `ARCHIVED 2026-05-29` header to financial-analyst.md + report-analyzer.md | agent-father |
| H-14 | Remove dual-accept from chef.md (single `bctc_signal` only) | agent-father |
| H-15 | Delete `.claude/agents/financial-analyst.md` + `.claude/agents/report-analyzer.md` | agent-father |
| H-16 | Delete `docs/agents/financial-analyst/` + `docs/agents/report-analyzer/` dirs | agent-father |
| H-17 | Delete `docs/agents/tools/package/financial-analyst.md` + `docs/agents/tools/package/report-analyzer.md` | agent-father |

**Rollback gate:** Between H-11 and H-12 (24h parallel run), if bctc-analyst emits 0 valid signals on either routine or release path → STOP, revert H-10/H-11, escalate to PO. Do NOT proceed to H-12.

---

## Files to Create

| File | Action | Notes |
|---|---|---|
| `.claude/agents/bctc-analyst.md` | CREATE | Merged agent definition, `model: sonnet` |
| `docs/agents/bctc-analyst/init.md` | CREATE | Merged identity + signal_output_spec with `mode` discriminator |
| `docs/agents/bctc-analyst/flow/main.md` | CREATE | Thin dispatcher |
| `docs/agents/bctc-analyst/flow/cycle.md` | CREATE | Mode gate + merged pipeline |
| `docs/agents/bctc-analyst/flow/stage-bootstrap.md` | CREATE | Copy from financial-analyst |
| `docs/agents/bctc-analyst/flow/stage-analyze.md` | CREATE | financial-analyst stage + report-analyzer Steps 2–4 (release mode) |
| `docs/agents/bctc-analyst/flow/stage-log-notify.md` | CREATE | Merged log format |
| `docs/agents/tools/package/bctc-analyst.md` | CREATE | Union of both tool packages |
| `docs/agent-memory/notebooks/bctc-analyst.md` | CREATE | Empty bootstrap |

## Files to Modify

| File | Action | Notes |
|---|---|---|
| `docs/agents/chef.md` or relevant unified-agent chef flow | MODIFY | Add dual-accept OR clause (transition); remove after archive |
| `docs/data/cowork-schedule.json` | MODIFY | Add bctc-analyst entry; remove old entries post-soak |

## Files to Delete (post-soak, Step H-13 through H-17)

| File | Action |
|---|---|
| `.claude/agents/financial-analyst.md` | DELETE |
| `.claude/agents/report-analyzer.md` | DELETE |
| `docs/agents/financial-analyst/` (full dir) | DELETE |
| `docs/agents/report-analyzer/` (full dir) | DELETE |
| `docs/agents/tools/package/financial-analyst.md` | DELETE |
| `docs/agents/tools/package/report-analyzer.md` | DELETE |

## Files to Archive (modify, not delete)

| File | Action |
|---|---|
| `docs/agent-memory/notebooks/financial-analyst.md` | Add `ARCHIVED 2026-05-29` header, preserve last cycle |
| `docs/agent-memory/notebooks/report-analyzer.md` | Add `ARCHIVED 2026-05-29` header, preserve last cycle |

---

## Open Questions for Agent-Father

**OQ-1:** Does `docs/agents/chef.md` exist at that path, or does the unified-agent chef flow live at another path? Verify before H-10. (Likely `docs/agents/unified-agent/flow/chef.md` or similar — agent-father should find the GATHER step that reads `docs/signals/bctc_signal_*.json`.)

**OQ-2:** Does `docs/data/cowork-schedule.json` contain a `report-analyzer` entry (it was event-driven, possibly absent from the schedule file)? If absent, H-11/H-12 only touches the `financial-analyst` row.

**OQ-3:** The BCTC Citation Trust Protocol currently lives in `financial-analyst/flow/main.md`. It must be carried into `bctc-analyst/flow/main.md` verbatim (including the Portuguese→Vietnamese note) and the follow-up brief correction flagged in the existing notebook entry should be resolved: replace the Portuguese terms in the 2026-05-28 BCTC-EVAL brief §9 with Vietnamese equivalents.

---

## Sign-off

**MERGE-OK.**

No blocking architectural concerns. The merge is a straightforward consolidation — both agents share identical infrastructure and the behavioral difference (trigger cadence) is fully expressible as an in-cycle mode gate. The canonical `bctc_signal` shape with `mode` discriminator is cleaner than the current dual-type system and eliminates the chef dual-reader burden post-migration. Sonnet pinning is the correct model choice for a merged agent that must handle release-mode PDF parsing at any cycle. The 24h parallel-run gate (H-11→H-12) is the critical safety window; do not compress it.

**Authored by:** agents-architect  
**Timestamp:** 2026-05-29T04:26:13Z  
**Handoff to:** agent-father (implement) via signal `bctc-analyst-merge-20260529T042613Z.json`
