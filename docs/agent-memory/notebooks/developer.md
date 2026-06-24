# Developer — Notebook

**Last updated:** 2026-06-24 | **Cycle:** FIX-FB-GATE-HARDENING-BUNDLE

## Session 2026-06-24 — FIX-FB-GATE-HARDENING-BUNDLE (3 tasks batched)

**Task:** FIX-FB-JARGON-WEEKDAY-ORDINAL-COLLISION + FIX-FB-GATE-TEMPLATE-STRUCTURE-VALIDATOR + FIX-FB-GATE-CURRENCY-UNIT-GUARD
**Zone:** scripts/ (cross-service) → developer handles directly.

**TASK 1 — weekday/ordinal fix (fb-jargon-gate.sh Group E):**
Vietnamese weekday names when used as DAY NAMES are always capitalised ("Thứ Hai", "Thứ Ba"). Ordinal enumerators ("Thứ nhất/hai/ba" = firstly/secondly/thirdly) use lowercase. Removing the `-i` flag from `grep -ni` in the weekday check makes it case-sensitive — correctly blocking "Thứ Hai" declared for a non-Monday date, and NOT blocking "Thứ hai" ordinal in body prose.
Result: fb-post-2026-06-14.md (Chủ nhật post with "Thứ nhất/hai/ba" ordinals) → PASS; real wrong-weekday synthetic → FAIL. Zero regression on 06-23 (Thứ Ba) / 06-24 (Thứ Tư).

**TASK 2 — structural template validator (Check-G, fb-data-integrity-gate.sh):**
5 sub-checks: G1 canonical header / G2 verbatim disclaimer + fence / G3 hashtag block (mandatory 5 tags, no diacritics) / G4 no raw markdown (##, **bold**, | table |) / G5 word ceiling ≤1300.
Also fixed a pre-existing `set -euo pipefail` silent-abort: `grep -vE` on the POST_TICKERS extraction pipeline exits 1 when 0 tickers pass the filter (all excluded) — now guarded with `(set +o pipefail; ...)`. This was the actual root of the `feedback_fb_poster_gate_false_green` pattern (gate aborted silently at Step 1, no violations counted, but exit was caught by a calling pipeline as exit 1 then lost).

**TASK 3 — currency-unit guard (Check-F, fb-data-integrity-gate.sh):**
Line-level co-occurrence: VN-ticker + `$NNN`/`USD NNN` (range 5-9999) on same line → BLOCK. False-positive guards: commodity lines (thùng/oz/barrel skip), FX-pair lines (USD/VND skip), macro-aggregate lines (tỷ USD skip), NON_TICKERS exclusion set, range filter. All guards verified against real posts and synthetic fixtures.

## Session 2026-06-18 — TASK-AUTO-PUSH-A fleet-worktree-push.sh (ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP)

**Task:** Create `scripts/fleet-worktree-push.sh` — worktree-isolated push backstop.
**Zone:** scripts/ (cross-service, no dev-* specialist match) → developer handles directly.

**Problem context:** Cowork churn keeps main working tree perpetually dirty; `git pull --rebase` in commit-mutex retry path fails → push lag accumulates (103 unpushed 2026-06-17, 149 unpushed 2026-06-15). Need a backstop that pushes from a clean worktree without touching the dirty main tree.

**What was built:**
- `scripts/fleet-worktree-push.sh` — 185L bash, set -euo pipefail, proven recipe from po-s84/po-s98.
- PUSH_THRESHOLD=20 tunable header constant; no-op when ahead <= threshold.
- Cleanup trap on EXIT/INT/TERM → always removes worktree + `git worktree prune`.
- Divergence-reconcile: classifies behind-set via `git log HEAD..origin/main --pretty=format:"%s"` → aborts on non-chore commits (sends BUG telegram), merges chore-only.
- orch-state.json merge conflict → `--ours` (HEAD authoritative; cloud chore = additive _updated_at only).
- node_modules symlink so pre-push hook resolves deps without copy.
- `pnpm --filter vn-market check` tsc gate → abort if red (never push around red tree).
- Telegram notifications via curl to TELEGRAM_INFO_WORK_CHANNEL_ID (success) / TELEGRAM_REPORT_BUG_CHANNEL_ID (abort).
- `--dry-run` flag: prints all actions, never pushes, prints telegram calls to stderr.

**DoD evidence:**
- shellcheck: exit 0 clean; SC1091+SC2329 suppressed with inline directives (documented).
- No-op path: `bash scripts/fleet-worktree-push.sh` with ahead=9 <= 20 → exits 0 "nothing to do", no worktree created.
- Abort path: `PUSH_THRESHOLD=0 bash scripts/fleet-worktree-push.sh --dry-run` → detected 2 non-chore commits in behind-set, correctly aborted, worktree cleanup confirmed.

**Docs updated:** `docs/policies/dev-standards.md` § Script Persistence — CANONICAL pointer added.

## Session 2026-06-17 — FIX-FB-POST-DATA-INTEGRITY-GATE (cross-service scripts task)

**Task:** Build reusable plausibility gate at `scripts/fb-data-integrity-gate.sh`.
**Zone:** cross-service (scripts/) — no dev-* specialist match → developer handles directly.

**Root cause context:** `fb-jargon-gate.sh` checks jargon tokens only; it passed both fabricated FB drafts (VRE −9.4%, VHM −8.5%) on 2026-06-17. These values exceed the HOSE ±7% daily price limit — physically impossible. Root: no numeric sanity check existed.

**What was built:**
- `scripts/fb-data-integrity-gate.sh` — 175L bash gate, 4 check groups (A=HOSE-limit, B=live-delta, C=selloff-contradiction, D=VN-Index), exits non-zero on BLOCK.
- Live data from `http://localhost:3000/mcp/api/prices/batch?tickers=VNINDEX,...` — established REST endpoint used by the frontend watchlist, no new transport.
- Optional `$3` pre-fetched snapshot JSON for headless/offline contexts.

**Key design choices:**
- Check-C (selloff narrative) uses negation filtering to avoid false-positive on "không phải bán tháo" denial phrases.
- Soft-skip if API unavailable (curl 8s timeout) — gate degrades gracefully, does not block on infra error.
- Exit discipline: `exit 0` ONLY when `$VIOLATIONS -eq 0`; `exit 1` on block (avoids the fb-jargon-gate-false-green trap).

**Self-verify:**
- Clean post `fb-post-2026-06-17.md` → `[PASS]` exit 0.
- VRE −9.4% injected → `[BLOCK] Check-A HOSE-price-limit + Check-B live-delta` exit 1.

**Docs updated:** `docs/policies/dev-standards.md` § Script Persistence — CANONICAL pointer added.

## Session 2026-06-02 — SIG-FOLLOWUP-DRYRUN X-1 (sprint SELF-IMPROVE-GATE)

**Task:** X-1 — Prove D-IMPROVE lane-B emit seam end-to-end (synthetic dry-run).

**Finding:** Default emit path (Step 12 `else` branch) had a wiring gap — `appendDashboardRow` called without `orchStatePath` injectable, so all tests injecting `writeProposalFn` skipped this path entirely. The real `writeImprovementProposal` + `appendDashboardRow` code path was never exercised in tests.

**Fix:** Added `orchStatePath?: string` to `SelfImproveOrchestratorDeps`; threaded through `appendDashboardRow` call (+9 lines). Minimal change, no behavior change in production (undefined = real path preserved).

**Test added:** `apps/mcp-server/src/__tests__/X1-dryrun-emit-seam.test.ts` — 3 tests, all NO `writeProposalFn` injected (forces default path):
1. Main X-1: synthetic DEGRADED → doc written + signal_queue row appended (both sinked to temp)
2. Cooldown idempotency: second run blocked by cooldown guard
3. PERSISTENTLY_LOW variant: also emits LANE-B on default path

**Verdict:** PROVEN-WORKING (3/3 pass, 65 prior tests pass, bun tsc clean). Commit: 6a8c87ac.
**No rebuild needed:** flow/test/script-only change (no mcp-server runtime code changed, only injectable dep threaded).

## Session c212 — Dev-Team Orchestration (JUMP-TO: drain-signals → PO triage → dispatch)

**Preflight:** NO HEAD.lock. Worktree prune: clean. PASS.

**Gate assessment (20:59Z):**
- OBSERVE-1951b: CLOSED (gate was 20:34Z, 25 min past). AC-6 PASS → 1951d UNBLOCKED.
- 1948 gate: 2026-05-20T07:22Z — future, still blocked.
- OBSERVE-1953g: 2026-05-21T02:30Z — future, observing.

**Drain signals (12):** All stale/resolved — moved to processed/. No new PO triage needed (already planned via po-1955-sprint-plan.json signal).

**TASKS.md updates:** OBSERVE-1951b→Done, Sprint-1956→Done (11/11), 1954a AC-3 PASS, stale Backlog entries removed, TASKS.md=80 lines.

**Dispatch:** dev-mcp-server→1955a (HIGH FIX dailyDashboardJob path) + ops→1951d (cutover 12 RemoteTriggers). WIP=2/2.

## Session c178 — Task 1952f (chef-intraday trigger_prompt MCP URL)

**Task:** 1952f — Append MCP URL to `chef-intraday` trigger_prompt in `docs/data/cowork-schedule.json`.

**Root cause confirmed:** cowork-team/main.md Step 5 spawns unified-agent using `trigger_prompt` verbatim. The field lacked `\nMCP: https://zenmidi.com/vn-market/mcp`. Unified-agent exited without tools.

**Narrowest-fix analysis:**
- `news-scout-market`, `market-watcher-market`, `alert-commander-market` → `trigger_error: "API_MIN_INTERVAL"`, no `trigger_id`, produce results via master dispatcher already. NOT modified.
- Only `chef-intraday` has the failure. One field change.

**Files changed:**
- `docs/data/cowork-schedule.json` — `chef-intraday.trigger_prompt` appended `\nMCP: https://zenmidi.com/vn-market/mcp`
- `docs/TASKS.md` — 1952f added to Done
- `docs/agent-memory/notebooks/developer.md` — this update

**Pipeline state:** c178 DONE. Commit on main.

## Session 2026-05-31 — NB-PRUNE-1 (sprint NB-PRUNE-FIX)

**Task:** NB-PRUNE-1 — fix notebook-write prune anchor mismatch (skill-only change, .claude/skills/).
**Zone:** .claude/skills/ + agent flows — disjoint from apps/mcp-server/ peer work.

**What was done:**
- Replaced `^## c[0-9]` anchor with `^## ` in notebook-write/SKILL.md.
- New algorithm: detect all level-2 headings via `grep -c "^## "`, preserve pre-first-## preamble,
  retain last 3 sections regardless of heading format (c-format, ISO-timestamp, Session:).
- AC-5 hard guard (≤200L) loop iterates on oldest-section prune until compliant.
- Added TODO comment for po/developer invocation-note contradiction (deferred, scope-risk).
- Skill file: 104L (cap 120L). No flow files changed.
- Commit: 7166db01

**Repro proof (fixtures at /tmp — originals NOT mutated):**
- agents-architect.md (## ISO-ts format): 316L → 27L, 3 sections, preamble intact.
- ops.md (## Session: format): 5871L → 344L (prune pass) → 117L (guard loop), newest session retained.
- Both: wc -l ≤ 200. Last-3 retained verified via grep "^## ".

**Contradiction note:** po/main.md L126 "OVERWRITE ≤50L" vs developer/flow/main.md L125 "append c<NNN>".
  Left as TODO in skill. QA should flag if po notebooks exceed 200L in future.

**NEXT:** QA — NB-PRUNE-1 ready for deliberate-violation verification.

## Session 2026-06-14 — FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY (doc-only)

**Task:** Codify `docker builder prune -f` as unconditional final step in `docs/agents/ops/flow/docker.md`.

**Root cause:** 3rd recurrence (2026-05-27, 2026-06-07, 2026-06-14) of host disk-full from Docker build-cache accumulation. A ≥2/day rule existed in memory but was never in the flow. Third occurrence ENOSPC-blocked a QA agent at 97% / 6.7 Gi free; recovery reclaimed 18.62 GB.

**Fix — 4 locations in docs/agents/ops/flow/docker.md:**
1. FORBIDDEN § "Rebuild after code change" one-liner: appended `&& docker builder prune -f`.
2. Docker Commands § REBUILD mcp-server comment: appended `&& docker builder prune -f` after `sleep 5`.
3. New § WHY: Builder Prune Is Mandatory After Every Rebuild: 3 recurrences, safety properties, generic_mandate (host-wide, never scope to mcp-server only).
4. Post-Rebuild Health Verification § Final step: prune block AFTER health checks pass, BEFORE notebook write; abolished ≥2/day heuristic.

**Pattern:** Undocumented recurring-cost rules must be codified as mandatory unconditional steps — memory-reliant heuristics always recur.

## Session 2026-06-07 — FIX-CI-LINT-STACK (cross-service CI fix)

**Task:** Bump golangci-lint-action v6.1.1 -> v7.0.0 at 6 sites; delete kinh-dich-ts-lint job.

**Learning:** golangci-lint-action v7 supports v2 schema only and requires explicit `version: v2.0` input (shown in action README). v6 installed v1 binary which rejected v2 config with exit-3. The stale TS lint job (kinh-dich rebooted TS->Go 2026-05-24) had no eslint.config so would never pass — dead CI debt.

**Pattern:** CI schema version mismatch (linter binary vs config version) always shows as exit-3 with "you are using a configuration file for version X with version Y". Verify action major version tracks linter major version.

## Session 2026-06-21 — FIX-FB-GATE-SECTOR-NAME-VALIDATOR (AUDIT-FB-GATE-PROSE-HARDENING)

**Task:** Add Check-E (sector/company-name validator) to `scripts/fb-data-integrity-gate.sh` + fix line-344 `[[: 0\n0: syntax error`.
**Zone:** scripts/ (cross-service gate) → developer handles directly.

**Bug found (line-344):** `grep -c` exits 1 on 0 matches → `|| echo "0"` fires alongside grep's stdout "0" → `floor_zero="0\n0"` → `[[ "$floor_zero" -gt 0 ]]` syntax error. Fix: `|| true` + `grep -m1 '^[0-9]' || echo "0"` to normalise to scalar. Both occurrences (lines 343+353) fixed.

**Check-E design:** SSOT-driven (reads docs/data/system-map.json .project.watchlist). Two sub-checks:
- E1 parenthesised-label contradiction: regex `TICKER (label)` / `(label) TICKER` within 60-char parens; maps SSOT English sector strings to canonical families; derives Vietnamese sector keywords per family; guards against own-sector-keyword false-positives (VRE "Retail REIT" correctly NOT flagged for "retail" kw).
- E2 company-alias mismatch: curated known-fabrication aliases (VNM→Nestlé, SAB→Heineken).

**Learning:** Proximity-window sector matching (120 chars) is too aggressive for Vietnamese financial prose where multiple sectors are discussed in the same paragraph. Tight parenthesised-label matching (pattern `TICKER (...)`) targets the fabrication signal without false-positives.

**Commit:** eceee94a
