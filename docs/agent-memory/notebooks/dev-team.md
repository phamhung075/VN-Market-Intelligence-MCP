# dev-team notebook

## Current state (c134 close — 2026-05-16T02:30Z)
- Pipeline: idle. No new signals, no in-progress tasks. PO returned NOTHING (2nd consecutive idle cycle).
- HEAD.lock #42 cured at PREFLIGHT (age=2505s, size=0B, no live pid).
- MCP gateway still down (1913 BLOCKING-F1, cycle 10).

## c134 cycle log
- PREFLIGHT: HEAD.lock #42 cured (age=2505s ~42min, size=0B, no pid). Signals inbox empty.
- Drain-signals: skipped (inbox empty).
- PO triage: NOTHING — same as c133. TNB handoff unchanged. No new BA specs or sprint reports.

## Current state (c133 close — 2026-05-16T01:30Z)
- Pipeline: idle. Sprint 1920 fully closed (9/9 tasks QA-approved). 13 stale 1912-program signals drained. No codeable work.
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock #41 cured at PREFLIGHT (age=1282s, size=0B, no live git pid).
- MCP gateway (1913 BLOCKING-F1) still down — 9th cycle of evidence.
- Open items: all user-action gated (1913/1897b/1907a/1862c-E) or observational (1909c/fa-shape-guard/alert-precision).

## c133 cycle log
- PREFLIGHT: HEAD.lock #41 cured (age=1282s ~21min, size=0B, no pid). lsof captured to `docs/agent-memory/sessions/preflight-lsof-20260516T012451Z.log`. worktree prune clean (no output). No worktree locks.
- Drain-signals: 13 signals processed (10 new, 3 dupes). All stale 1912-program completion signals + TNB audit handoff (c132 ACK still current) + unified-agent HEAD.lock bug-escalation (RESOLVED c132). No new actionable signals.
- PO triage: NOTHING — no codeable work. TNB Step 0-TNB: no new file, c132 ACK current. Channel audit skipped (1913 MCP gateway 404). Notebook committed `0ae8c2c6`.
- Telegram idle signal: skipped (1913 MCP gateway unavailable, same root cause).

## Current state (c83 close — 2026-05-13T21:35Z)
- Pipeline: idle. Main HEAD `1e7c44a0` (qa c83 gate). After dev-team close commit will advance.
- WIP: 0/2. Branches: main only. Worktrees: main only (auto-cleaned).
- HEAD.lock cures lifetime: **40/40** (#40 fired at PREFLIGHT, age=1506s, size=0B, no live git pid, auto-cured).

## c83 cycle log
- PREFLIGHT: HEAD.lock #40 cured (age=1506s ~25min, size=0B, no pid). lsof captured to `docs/agent-memory/sessions/preflight-lsof-20260513T212845Z.log`. worktree prune empty. signals/ empty.
- PO triage: BATCH(2) — 1881a (SPRINT-S BA spec round, methodology Layer 9) + 1888-CDG bundle (FIX, developer doc-only).
- Tier execution (parallel via isolation:worktree):
  - **Track A** (ba): worktree `agent-a9f49f2192c52cc99`. REQ_1881a.md authored, **16 tools enumerated** (1 more than estimated). Commits `0189381c` (feat) + `e36242f1` (notebook). **4 spec-time discoveries flagged**: (1) SBV is tier-2 (SBV portal down, reads Vietcombank XML); (2) HOSE/HNX prices tier-2 (VnDirect aggregator, no direct exchange API); (3) BLK-1 — 4 plain-text tools need architect decision before impl (`get_macro_snapshot`, `get_market_snapshot`, `get_sentiment_trend`, `get_policy_signals`); (4) dev-macro-indicators has zero scope (all 16 files in apps/mcp-server). 12 of 16 unblocked for impl.
  - **Track B** (developer): worktree `agent-af8639544f229ada6`. Doc-only bundle 5 files. Commits `76829836` (fix) + `69521f26` (notebook). toolCount=125 (sum of categories[].count; gateway live=137 — categories list stale, c84 candidate). cronJobCount=62 (with `_definition` key added). **Sub-task G correction**: PO directed dev-team/main.md L91-96 but actual inline size rules lived at po/main.md L26. Developer verified via grep and edited correct file. **Pattern**: agents grep before blind-edit when PO ref looks wrong.
- Merge gate: **SMOOTH** — both worktree harnesses auto-merged linearly to main; no manual cherry-pick required (different behavior than c80–c82). 4 commits landed in order: feat A → nb A → fix B → nb B.
- QA gate (`1e7c44a0`): Both tracks **APPROVED**.
  - Track A: structure ✓, backward-compat AC ✓ (NFR-1 + AC-2), multi-source fallback ✓ (FR-3 + AC-5 for get_macro_snapshot + get_foreign_flow), 3 tier spot-checks all CORRECT (imf=1, investment_clock=2, insider_transactions=1).
  - Track B: JSON validates, toolCount=125 consistent, cronJobCount=62, pointer line present in po/main.md, inline rule removed (count=0), tree-map ok.
- pm c83 (`801afd6f` + `9a4d46ad`): TASKS.md 69L, totalTasksDone 557→559. Backlog revised: 1881a → 1881a-impl (awaits PO review + architect BLK-1).

## Lessons / patterns
- **Worktree harness auto-merge worked this cycle**: c80/c81/c82 needed manual cherry-pick, c83 didn't. Hypothesis: only 2 disjoint doc-only tracks → no conflicts → harness merged transparently. Pattern is environment-dependent; cannot rely on, so cherry-pick fallback must remain in skill.
- **Agents should verify PO file/line refs before blind-edit**: c83 Track B developer found PO's `dev-team/main.md L91-96` was wrong (size rules actually at `po/main.md L26`). Agent greped + corrected. This is the right behavior — encode in developer skill that PO refs are advisory, source-of-truth is grep.
- **BA spec discoveries can downgrade priorities**: 1881a was HIGH METHODOLOGY but spec-time discoveries (SBV tier-2, HOSE/HNX tier-2) reveal the methodology Layer 9 claim weaker than expected for VN macro. Impl cycle still valuable but ranking less authoritative. PO will need to weigh this in c84.
- **BLK-1 pattern**: BA spec correctly flagged a scope decision needing architect (4 plain-text tools schema choice: JSON wrapper breaks consumers vs header-line convention). Spec did NOT pre-resolve — left for architect handoff. Right call; encodes that spec doesn't usurp architecture.
- **toolCount has THREE sources of truth** discovered c83: (a) `tool-registry.json#toolCount` field, (b) sum of `categories[].count`, (c) live gateway `server.tool()` registrations. Currently (a)=(b)=125, (c)=137. Future SSOT cleanup: pick canonical, sync the other two automatically.
- **HEAD.lock cure 40 lifetime, 1 in c83**: Pattern stable. ~25min stale lock cleared cleanly. Skill enhancement still pending: auto-cure-without-escalation for >60s + no live pid.

## Carry-over to c84
- **1881a-impl** (HIGH, after PO reviews REQ_1881a.md + architect resolves BLK-1 for 4 plain-text tools).
- **1888l** (HIGH agent-father SSOT) — agents-architect Error Boundary missing. Different zone, can run disjoint.
- **1890a** (MEDIUM METHODOLOGY-TOOLPKG) — financial-analyst tool-package gaps.
- **1899a-bloomberg-test-split** (LOW REFACTOR).
- **1900c-health-probe-refine** (LOW OPS).
- **JANITOR-011/014/020** (MEDIUM DRY) — code-janitor cron pickup.
- **TASK-BCTC-3** (MEDIUM FEATURE) — dev-vps-crawls.
- **Investigation backlog**: (1) categories list stale +12 tools — needs sync pass; (2) tree-map.md doesn't list task-size-rules.md as named node — low priority addendum.
- **Skill enhancement candidates**: (1) auto-cure HEAD.lock for Spotlight/com.apple PID + age>60s (40 cures lifetime); (2) encode "grep before blind-edit when PO ref looks wrong" in developer flow.
- **Skipped (blocked)**: 1862c-E-dashboard, 1862c-F (container-rebuild), 1897b-carry (USER-action).
