<!-- PM Decomposition — UC-ASL-P2 -->

# PM Decomposition — UC-ASL-P2

**Sprint:** ULTRACODE-AUDIT-FIXALL  
**PM Session:** 2026-07-16T04:50:00Z  
**Authoritative:** BA spec (`docs/handoffs/UC-ASL-P2-BA-spec.md`) + Architect design (`docs/handoffs/UC-ASL-P2-BA-spec.md § [Architect] Brownfield Findings`)  
**Board state:** `docs/data/orch/orch-state.json` (commit c7031431b, UC-ASL-P2 `.children[]` populated)

---

## Decomposition Summary

UC-ASL-P2 decomposes into **4 atomic developer tasks**, all in the same zone (`scripts/ + docs/agents/system-auditor/ + docs/references/`) routed to the **generic `developer` specialist** (not service-specific).

**Dependency chain (DAG, acyclic):**
```
DEV-1 (script + ledger) 
  ↓
DEV-2 (main.md sites 1-4) + DEV-3 (tier1-probe.md sites 5-6) — parallel after DEV-1
  ↓
DEV-4 (cleanup) — waits for both DEV-2 and DEV-3
```

---

## Task Breakdown

### UC-ASL-P2-DEV-1: Author scripts/emit-audit-signal.sh

**Type:** Core infrastructure  
**Size:** M  
**Depends on:** None  

**Scope:**
- New script `scripts/emit-audit-signal.sh` (bash 3.2-safe, ~400–500 lines estimated)
- New ledger `docs/data/auditor-dedup-ledger.json` (script-managed, JSON sidecar)
- DDD layer split:
  - **Interface:** named-arg parser (`--check-id`, `--category-type`, `--severity`, `--summary`, `--detail-json`, `--from-agent` [default `system-auditor`], `--to-agent` [default `po`], `--e3-only`, `--no-telegram`)
  - **Application:** E-1 (`post_agent_signal` via mcp-call.sh, fail-loud), dedup-check logic, E-2 (`send_telegram` 7-day window, severity-rank bypass on escalation: CRITICAL→3 / HIGH→2 / WARN→2 / MED→1 / INFO→1), CAS-retry loop (up to 3×, rc=2 retries; rc=1|3 aborts)
  - **Infrastructure:** ledger read/write (`{dedup_key: {ts, sev}}` flat map, tmp+mv atomic), E-3 signal-row append via `orch-apply.sh` + POST-WRITE read-back anti-false-green check
- Test harness (`scripts/emit-audit-signal.test.sh` or inline mock-function test) covering fresh-key OK, same-key-in-window SKIP-dedup, escalation bypass, `--e3-only` skip, E-1 failure abort, E-3 read-back failure + non-dedup BUG telegram, CAS-retry on 3rd attempt, CAS-exhausted distinct marker

**Acceptance Criteria (from BA AC-1 through AC-6):**
- AC-1: script exists, executable, sources `mcp-call.sh` (not reimplemented), exits non-zero with `[emit-signal] ABORT ...` on E-1 transport failure (never silently skips E-1)
- AC-2: first call with fresh key sends Telegram + writes ledger; second call with same key in 7d emits `[emit-signal] SKIP-dedup` + no `send_telegram` call; third call after ledger entry aged past 7d sends Telegram again
- AC-3: every call (dedup-skipped or not) still appends a signal-queue row and passes POST-WRITE read-back; row `id` present in `.signal_queue.rows[]` after each call
- AC-6: live audit cycle (or dry-run) produces grep-able `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT` marker line (new marker added by architect's ARCH-RATIFY-2 resolution)

**Hard Constraints (inherited from BA § Hard Constraints):**
1. Reuse `scripts/agents-flow/mcp-call.sh` — do not reinvent curl/SSE parser
2. All `docs/data/orch/orch-state.json` writes go through `scripts/orch-apply.sh` only
3. `docs/data/auditor-dedup-ledger.json` is a separate sidecar file, NOT part of orch-state.json, uses tmp+mv atomic write (NOT routed through orch-apply.sh)
4. Fail-loud on E-1/E-3 failure (never silently continue)
5. Dedup gates Telegram (E-2) only — never E-1 or E-3
6. No hardcoded structural data (check_id, dedup_key, thresholds passed as args)
7. Injection-safety: all MCP/orch-apply.sh JSON bodies built via `jq -n --arg`/`--argjson` bound params only (matches `auditor-notebook-commit.sh` discipline)

---

### UC-ASL-P2-DEV-2: Replace 4 EMIT SEQUENCE sites in docs/agents/system-auditor/flow/main.md

**Type:** Flow-doc replacement  
**Size:** M  
**Depends on:** UC-ASL-P2-DEV-1  

**Scope:**
- Site 1 (main.md:292–328): Tier-2 `data_stale` → replace with full E-1+E-2+E-3 script call (no `--e3-only`, no `--no-telegram`)
- Site 2 (main.md:592–628): Tier-3 `db_integrity_breach` → replace with full E-1+E-2+E-3 script call
- Site 3 (main.md:412–416): D-IMPROVE `improvement_proposal` → replace with `--e3-only` script call (E-3 only, no E-1/E-2, no Telegram)
- Site 4 (main.md:344): D-BCTC-EVAL → replace with `--e3-only` script call; **DO NOT touch** the distinct unconditional WORK-channel post at lines 336–340 (that is separate, not part of the EMIT SEQUENCE replacement)

**Process constraint:**
- Use **Write tool** (not Edit) to replace each multi-line block — avoids the known Edit-tool multiline-strip harness bug (`feedback_edit_tool_hook_silently_strips_multiline`)
- After replacement, verify with `git diff` — examine diff output for stray artifacts or missing newlines

**Acceptance Criteria (from BA AC-4):**
- All 4 flow-file sites replaced with script call + verdict-branch prose (kept — LLM still decides whether to emit)
- `git diff` shows no stray multiline-strip artifacts
- Script call correctly passes the existing check_id, signal_type (as `--category-type` arg), severity (if present), and summary

---

### UC-ASL-P2-DEV-3: Replace 2 EMIT SEQUENCE sites in docs/agents/system-auditor/flow/tier1-probe.md

**Type:** Flow-doc replacement  
**Size:** S  
**Depends on:** UC-ASL-P2-DEV-1  

**Scope:**
- Site 5 (tier1-probe.md:139–171): general A-xx `signal_feedback` → replace with full E-1+E-2+E-3 script call
- Site 6 (tier1-probe.md:86–108): A-20 event-loop stall `signal_feedback` → replace with script call (E-2 dedup was folded into the general routing line at :157 in current code, script call will unify this)

**Process constraint:**
- Use **Write tool** (not Edit)
- Verify with `git diff` for multiline-strip artifacts

**Acceptance Criteria (from BA AC-4):**
- Both sites replaced with script call + verdict-branch prose
- `git diff` clean (no artifacts)

---

### UC-ASL-P2-DEV-4: Dead-reference cleanup

**Type:** Infrastructure cleanup  
**Size:** S  
**Depends on:** UC-ASL-P2-DEV-2, UC-ASL-P2-DEV-3  

**Scope:**
1. **Delete** `docs/data/system-auditor-known-issues.json` (223 lines, stale since 2026-05-01, zero flow files read it — confirmed by grep)
2. **Delete** `scripts/agents-flow/context-bloat-backstop.sh:185–203` (the dead known-issues.json fingerprint-suppression gate, ARCH-RATIFY-1 confirmed) + the header comment referencing the file at line 24 (note: the script's OTHER dedup mechanism `EXISTING_SIGNAL` check at :175–183 is NOT touched)
3. **Update** `docs/references/tree-map.md:252/:407` to describe `docs/data/auditor-dedup-ledger.json` instead of the deleted known-issues.json
4. **Update** `docs/references/bundles/bundle-architect.md:74/:94` similarly
5. **Verify:** run `grep -r system-auditor-known-issues.json docs/ scripts/` — should return zero hits (excluding this spec file's own historical mention, and any audit-brief mention; the live tree must be clean)

**Acceptance Criteria (from BA AC-5):**
- `docs/data/system-auditor-known-issues.json` deleted
- `scripts/agents-flow/context-bloat-backstop.sh` dead gate removed, header comment removed
- `tree-map.md` and `bundle-architect.md` pointers repointed to the new ledger
- No remaining references to the deleted file in the live tree

---

## Handoff Notes

**BA Spec & Architecture (authoritative, read before implementation):**
- `docs/handoffs/UC-ASL-P2-BA-spec.md` (full spec + 8 FRs + edge cases)
- `docs/handoffs/UC-ASL-P2-BA-spec.md § [Architect] Brownfield Findings` (technical design + ARCH-RATIFY resolutions)

**Key References:**
- `scripts/agents-flow/mcp-call.sh` (reuse; `mcp_call()` function, exit-code contract: 0=success, non-zero=error)
- `scripts/auditor-notebook-commit.sh` (structural precedent: named-args, bash 3.2-safe, `[marker]` one-line output, trap-based cleanup)
- `scripts/agents-flow/context-bloat-backstop.sh` (example of the script being modified for dead-gate deletion; see :175–183 EXISTING_SIGNAL check that STAYS)
- `.claude/skills/signal-dashboard/SKILL.md § WF-2` (concurrent-writer CAS-retry note; confirm 3-retry loop mirrors TS path)
- `docs/standards/gateway-call-contract.md` (send_telegram contract: lowercase `channel`, `message` field)

**Zone & Dispatch:**
- Zone: `scripts/ (root + agents-flow/) + docs/agents/system-auditor/ + docs/references/` (NOT `apps/<service>/`, generic developer specialist)
- Next agent: **developer** (generic, per zone-detect Tier-2 rule for `scripts/` + docs non-app)

**BOUNDED-1 WIP note:**
- UC-ASL-P2 itself (PM task) remains IN_PROGRESS — PM decomposition is complete
- Children (DEV-1 through DEV-4) are TODO — developer will pick them up in dependency order
- No BOUNDED-1 WIP breach (1 task in_progress, never multiple; children do not count toward WIP until claimed by developer)

---

## Session & Coordination

**PM session:** https://claude.ai/code/session_69b0312e-df43-43a9-9e0b-bddf66d374e3  
**Dispatcher session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (passed to dev-team relay, same session for continuity)  
**Commit:** c7031431b (board state update with 4 children tasks)

---

## What Developer Does Next

1. Pick **UC-ASL-P2-DEV-1** from the TODO children (BOUNDED-1 will auto-promote it once UC-ASL-P2 parent is marked DONE_VERIFIED, or developer can claim it manually)
2. Implement the script, ledger, and test harness per BA FRs + Architect design
3. Once DEV-1 is DONE_VERIFIED, DEV-2 and DEV-3 become unblocked and can be claimed in parallel
4. Once both DEV-2 and DEV-3 are DONE_VERIFIED, DEV-4 becomes unblocked
5. After all 4 children are DONE_VERIFIED, mark UC-ASL-P2 parent as DONE_VERIFIED and the task is complete

---

**Prepared by:** pm (UC-ASL-P2)  
**Date:** 2026-07-16T04:50:00Z  
**Status:** READY FOR DEVELOPER

