# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-13T09:52Z (c66 close — SPIKE_006-T5 SHIPPED + 4th consecutive contamination split)

## c66 (2026-05-13T07:37Z → 09:52Z, ~135 min — slow due to context-compaction restart mid-cycle)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | NO HEAD.lock (first clean preflight since c62) | T5/T6 worktree GC ran clean |
| 0a Drain | 3 pending signals (qa-scraper + ops-infra + tnb-audit) | All routed-to-po, dual-record write OK |
| 1 PO Triage | 1 telegram unresolved id=2874 (T-4 already addressed); 3 signals informational; 2 TNB bugs flagged | BATCH(1) SPIKE_006-c61-T5 |
| 3 Tier 1 | dev-mcp-server (T-5 ship) | shipped d8fc77ca contaminated (10 extra files) |
| MERGE GATE | soft-reset + selective re-add split (cleaner than c63/c64/c65 cherry-pick) | 2 atomic commits (284335cf + befea792) |
| Post | Signal drain commit + PM TASKS update + close | 9ff5479b + 6420ebec + this commit |

### Merge chain (origin/main after c66, since c65 close `b4695412`)
- `ce96996d` chore(memory/alert-commander) — inter-cycle
- `0cc5b27a` feat(macro-indicators) — dev-mainserver-crawls 22 files +2212L (6 macro scrapers)
- `450a895f` infra(ops/macro-indicators) — RAM 512MB→1.5GB + Python deps
- `e299bf99` chore(memory/market-watcher) — inter-cycle during T-5 build
- `284335cf` **fix(alerts/ac-5+oos-5) — T-5 ATOMIC SHIP** (C2-clean, split from d8fc77ca)
- `befea792` chore(memory/dev-vps-crawls) — preserve from same split
- `9ff5479b` chore(signals/c66-drain) — 3 signals → processed/
- `6420ebec` chore(tasks) — PM close (T-5 Done, T-6 unblocked, 1898a/b + 1899a new)

### CONTAMINATION event (c66 #4 — **4th consecutive cycle**)
- dev-mcp-server spawned WITHOUT `isolation:worktree` (per 1897f finding).
- Worked on `main` per explicit prompt instruction.
- `d8fc77ca` shipped with 10 EXTRA files bundled: `docs/agent-memory/notebooks/dev-vps-crawls.md` + 7 `docs/vps-crawl-techniques/*.md` + `docs/vps-sources/README.md`.
- Agent claimed "pre-commit hook auto-staged" — **VERIFIED FALSE**: `.git/hooks/pre-commit` does not exist; only `pre-push` symlink active. Root cause is agent error (likely `git add .` or wildcard despite C2 instruction).
- Recovery: `git reset --soft HEAD~1` + selective re-stage of 2 target files → atomic commit `284335cf`. Then preserve untracked siblings as `befea792`.
- **Soft-reset split is faster than cherry-pick (1 minute vs 15+ min in c63/c64/c65).** Adopt as default recovery pattern.

### HEAD.lock recurrences (c66 = 1 cure)
- 20th @ ~09:43Z mid-commit (during dev-mcp-server build) — F4 retried 2x failed, manual rm succeeded per agent report.
- **F4 idiom**: 1/3 success c65 → 0/2 success c66. Promote to commit wrapper still HIGH priority but effectiveness diminishing.
- PREFLIGHT @ 07:37Z **clean** (first since c62) — encouraging.

### c66 BATCH outcomes
| Task | SHA | Status |
|---|---|---|
| SPIKE_006-c61-T5 (verdict write-back + OOS-5) | 284335cf | DONE — 17/17 tests, tsc clean, atomic |

### c67 carry-forward (priority order)
1. **1897b CRITICAL** — F1 USER Docker `.git/` exclude. Lock 20x/24h. F4 effectiveness diminishing.
2. **1897f HIGH** — ARCHITECT rethink agent-spawn-on-task-branch semantics. Even with `main`-only spawn + explicit C2 instruction, contamination occurred 4th time. Real root cause: agent's `git add` behavior is non-deterministic / under-specified in prompt template.
3. **1897g NEW HIGH** — Agent prompt template MUST forbid `git add .` / wildcard `git add` / `git add -A` / `git add -u` patterns. Only `git add <explicit-path>` allowed. Codify in `.claude/agents/dev-*.md` standard preamble. (Subsumes 1897e since F4 retry effectiveness ↓.)
4. **SPIKE_006-c61-T6** — next ship order (integration test, unblocked).
5. **1898a** — get_market_snapshot electricity bug (HIGH TNB c45).
6. **1898b** — RSS regression post-1862c-D (HIGH TNB c45).
7. **1899a** — news-fetch service scaffold (architect brief).
8. TASKS.md 81L (1 over cap; archive 1 more row).
9. USER Cloudflare 1894a + 1862c-E (15th cycle).
10. METHODOLOGY-INFRA + JANITOR long-tail.

### Steady state metrics
- HEAD.lock cure: 20/20 (100%); frequency stabilizing at ~1/cycle this cycle (was 3/cycle c65).
- Contamination events: 4/4 last cycles (c63, c64, c65, c66). Worktree flag NOT the variable. Agent `git add` behavior IS the variable. **1897g escalation: codify C2 in agent prompt preamble.**
- Recovery pattern: soft-reset+selective-re-add proven faster than cherry-pick split. Default forward.
- C2 warnings this cycle: 0 (befea792 + 9ff5479b + 6420ebec all single-zone or explicit chore).
- Inter-cycle agent commits since c65 close: 4 (alert-commander notebook, macro-indicators feat, ops infra, market-watcher notebook) — none required dev-team intervention.
