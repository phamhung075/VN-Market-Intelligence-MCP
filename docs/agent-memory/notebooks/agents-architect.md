# agents-architect — Notebook

## 2026-06-01T08:34:55Z

**Brief:** `docs/architecture-briefs/2026-06-01-context-resume-economy.md`

Fleet-wide context-resume wastes ~410k tokens/day: DASHBOARD.md (153 KB, 63 dead non-NEW rows, unbounded `_Updated:` header) is read in full every cron tick by 10+ agents; pipeline-state.json resume fields are freeform prose; the existing handoff-delta-read skill is not wired into DASHBOARD. Designed three-phase fix: (1) signal-dashboard SKILL upgraded to mtime/linecount Phase-1 skip + section-only Phase-2 read + mandatory PRUNE enforced in drain-signals.md; (2) pipeline-state.json v2 schema with machine-readable `head` block for routing and capped `narrative`; (3) optional cowork equivalents audit. Target: ~38k→~0–400 tokens/DASHBOARD read, ~1750→~150 tokens/pipeline-state routing read, ~95% fleet resume token reduction.

**Signal dropped:** `docs/signals/context-resume-economy-20260601T083455Z.json` → agent-father

---

## 2026-06-01T09:21:33Z

**Brief:** `docs/architecture-briefs/2026-06-01-signal-dashboard-cap-extract.md`

RE-CAP-1 hygiene fix: `.claude/skills/signal-dashboard/SKILL.md` is 192L (overage 72 vs 120L skill-file cap). The §WRITE/§READ/§PRUNE protocol bodies added in b38ac812 are load-bearing (fleet resume-economy contract); designed lazy-load extraction — move those three section bodies verbatim to a new sibling `dashboard-protocol.md` child, condensing each to a ~3-line summary + pointer in the parent, projecting parent to ~118L. All callers (drain-signals.md 0a-D-PRUNE) remain resolvable; §PRUNE section header + mandatory-call statement stay in SKILL.md.

**Signal dropped:** `docs/signals/signal-dashboard-cap-extract-20260601T092133Z.json` → agent-father

---

## 2026-06-01T20:19:21Z

**Brief:** `docs/architecture-briefs/2026-06-01-detector-plan-only-safety.md`

AUD-ND-1 (CRITICAL): system-auditor had no explicit prohibition on destructive ops; LLM inference path caused `docker stop mcp-server` on false-positive CRITICAL signals twice — second incident during VN trading hours permanently destroyed Monday intraday price data. Fix: insert explicit PLAN-ONLY INVARIANT block in flow/main.md + init.md; replace unconstrained Bash grant in tools/package with read-only allowlist (docker ps/inspect/stats/logs/exec-sqlite3, curl, df, free); forbidden list is explicit. Scope: system-auditor only (3 files). QA proof: AUD-ND-1-PROVEN-RED synthetic false-positive must produce signal/DASHBOARD/BUG with zero infra mutation, verified by docker ps mcp-server start-timestamp unchanged.

**Signal dropped:** `docs/signals/detector-plan-only-safety-20260601T201921Z.json` → agent-father

---

## 2026-06-01T21:12:21Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md` (v2 — operator refinement)

Operator strengthened the direction: TASKS.md + DASHBOARD.md fully deleted (not generated views); ONE single JSON file (`docs/data/orch/orch-state.json`). Full reader inventory completed — 40+ reader sites in code + agent flows identified with file:line citations, all have clean migration paths, no blocker found. Concurrency re-analysis: WIP<=2 + commit-mutex + dashboard-row lock means real concurrent writers = 1 at a time; single-file is safe with atomic temp-rename write protocol. Schema v3 merges all four sections (head/task_board/signal_queue/narrative) into one file. One greenlight question surfaced for operator: D4-R4 concurrent-commit alarm threshold (default: keep 30s window, accept slightly more noise on unified file).

**Signal dropped:** (brief is the handoff — no separate signal file; router routes OSC-1/2/3/4 to agent-father + dev-mcp-server + ops)

---

## 2026-06-01T20:58:53Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md`

Operator-directed JSON-first SSOT design: 3 files under `docs/data/orch/` (pipeline-state.json moved, task-board.json new, signal-queue.json new); markdown views become generated-only output. Highest-risk item is the `pipeline-state.json` path rename — 14 reader sites across code and agent files must land in ONE atomic commit to prevent test breakage; OSC-5 (flip readers off Markdown) is deferred to a PO-gated hardening period.

**Signal dropped:** (no separate signal file — brief is the handoff; router to route OSC-1/2/3/4 to agent-father + dev-mcp-server + ops per §5 task batch)

---

## 2026-06-01T20:58:24Z

**Brief:** `docs/architecture-briefs/2026-06-01-orch-state-consolidation.md`

Operator pushback on prior brief's 5-surface model (3 existing + 2 proposed twins) resolved. Two proposed twins (`tasks-state.json`, `signals-state.json`) rejected; replaced by ONE `docs/data/orch-state.json` projection. Critical latent bug discovered: 1837a schema test expects v1 root fields (`activeTaskId`, `status`) but live pipeline-state.json is v2 (`head.active_task_id`) — test silently fails, janitorJob reads wrong field path, alert-commander reads `.currentSprint` which is absent in v2. Phase 0 schema fix unblocked and mandatory regardless of option chosen (B=recommended one-projection / C=pipeline-only minimal). Option B: 3 canonical files + 1 machine projection, 6-phase plan, 10–14 tasks, awaiting operator greenlight.

**Signal dropped:** `docs/signals/orch-state-consolidation-20260601T205824Z.json` → agent-father

---

## 2026-06-01T21:06:42Z

**Brief:** `docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md`

Added a new decentralized DETECT source to the SELF-IMPROVE-GATE pipeline: an end-of-cycle self-critique step (sibling of doc-self-heal) that fires only on 5 machine-anchored triggers (T1 tool failure, T2 capability gap, T3 low-confidence result, T4 recurring notebook workaround, T5 budget overrun), writes a DRAFT IMP-*.md proposal, and feeds the existing agents-architect → PO → agent-father pipeline unchanged. Design requires 3 file edits (cowork-end-cycle SKILL +1L, dev-team post-cycle +1L, new self-critique SKILL ~90L) plus a 14-day shadow pilot on news-scout and dev-team before fleet-wide.

**Signal dropped:** `docs/signals/agent-self-critique-detect-20260601.json` → agent-father (BLOCKED on PO approval)

---

## 2026-06-02T01:21:01Z

**Brief:** `docs/architecture-briefs/2026-06-02-esc-opus-dispatch-seam.md`

10-cycle silent ESC failure: bctc-analyst (Sonnet) prose-invokes deep-dive-opus.md (model:claude-opus-4) but no runtime boundary enforces a model switch mid-flow — zero Opus analysis ever ran. Fix: replace inline invocation with a task_claim idempotency guard + esc-deep-dive-request signal to dev-team; drain-signals.md gains ESC-DISPATCH handler that spawns bctc-analyst with model=opus override; deep-dive-opus.md gains § Output Signal to close the loop to PO. Three-file edit for agent-father; drain-signals.md will exceed 120L cap and must extract ESC-DISPATCH to a child file. FU-BCTC-TOOL-PARAMS (get_cash_flow quarters-param ignored; get_bctc_full takes code not ticker) is a parallel dependency for full analytical value.

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row (to:po, type:brief_complete)

---

## 2026-06-02T04:09:04Z

**Brief:** `docs/architecture-briefs/2026-06-02-fb-jargon-gate.md`

fb-market-poster STEP 4 check 3 is pure model self-attestation — false-greened 3× in one session (thanh khoảy ×6, (FII) ×2, full hexagram paragraph), all caught only by router raw grep. Designed a deterministic gate: SHARED executable (`scripts/fb-jargon-gate.sh` + `.claude/skills/fb-jargon-gate/SKILL.md`) called from a new hard-fail STEP 4a in the flow; forbidden token SSOT lives exclusively in the script (32 English-jargon + 8 notation + anchored hexagram `vị thế <name>` + VN typos + calendar weekday check); 10 false-positive traps documented with safe anchored patterns; 3 smoke tests specified (Test A fires on `sentiment`, Test B passes clean, Test C proves `không` never triggers hexagram check).

**Signal dropped:** `docs/data/orch/orch-state.json` signal_queue row `architects-fb-gate-brief-20260602T0409Z` → agent-father

---

## 2026-06-02T11:04:55Z

**Brief:** `docs/architecture-briefs/2026-06-02-bctc-analytics-layer-bal1.md`

4 BCTC analytics/serving defect clusters root-caused (BAL-1 SPIKE): (a) ratio columns (roe/roa/eps/net_debt_to_ebitda) are orphaned after refine — `finalizeBctcRefineTool` updates base scalars but never re-derives ratios; (b) SHB/EIB bank serving blocked by PUB-3 bank-path query mismatch (two candidates: isBankFormFromDb wrong classification vs is_summary_row=1 for all rows); (c) Q4 FY-cumulative vs Q1 standalone comparison produces false YoY — no `period_basis` column, no basis-mismatch guard; (d) HPG parent-only filing (rev=0, conf=44%) served as headline — no `report_scope` column, no confidence threshold in checkPublishability. BAL-0 publish-gate spec (PUB-5..8 inline in `bctcFullTools.ts`) is URGENT/PROTECTIVE — live publish risk until deployed.

**Signal dropped:** `docs/signals/bctc-analytics-layer-bal1-20260602T110455Z.json` → agent-father

## 2026-06-03T05:21:48Z

**Brief:** `docs/architecture-briefs/2026-06-03-lf-tier0-fingerprint-rethink.md`

LF-RETHINK SPIKE (120min timebox): Tier-0 `build_document_map()` recurring defect class root-caused to the money-group-density-only `page_type` discriminator (introduced in commit 08644675) falsely classifying balance-unit START pages (FPT Q1 p3) as `prose` when a section header occupies the page top. Structural fix: add two AC-0-compliant OR signals — Signal B (account-code count ≥ 3 via `_CODE_LIKE_RE`) + Signal C (date-header count ≥ 1 via `_DATE_HEADER_RE`) — to the classifier; secondary fix: relax `page_type` continuity guard (prose-in-table-unit tolerance when gutter geometry is continuous). LF-DEPLOY-IMPL task spec ready for PO → dev-pdf-extractor.

**Signal dropped:** `docs/signals/lf-rethink-brief-20260603T052148Z.json` → po

---

## Carry-over

- market-watcher/cycle.md Step 5 append/overwrite drift: confirm agent-father applies fix in same pass as frontmatter edit (§12c market-watcher row).
- OQ-1 through OQ-4 from §10 of 1951b brief remain open for agent-father to resolve before Phase 3 QA.
- L-1 alert-commander: verify whether 1963-MW-IDENTITY fix (agent-father 2026-05-21) already promoted mcp-tools.md to always_load — if yes, L-1 for alert-commander is a no-op.

---

## 2026-06-02T18:18:56Z

**Brief:** `docs/architecture-briefs/2026-05-21-cowork-coverage-sweep.md`

Designed deterministic LRC (Least-Recently-Covered) rotation for news-scout + market-watcher: coverage-state.json SSOT tracks per-ticker last-covered timestamps; each agent prepends a Step 0-sweep that appends ≤3 stale tickers (>48h uncovered) to the normal event-driven pass — guaranteeing full watchlist coverage within 48h without suppressing any high-signal events.

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row `aac-coverage-sweep-20260602T181856Z` → agent-father

---

## 2026-06-02T18:18:56Z

**Brief:** `docs/architecture-briefs/2026-06-02-commit-boundary-discipline.md`

Recurring commit-boundary violations by maintenance-lane agents (pm 26-file sweep 3rd recurrence, agents-architect mutex-less commits, agent-father orch-state staging) root-caused to two structural gaps: no explicit-stage discipline in any maintenance-agent flow, and commit-mutex unreachable by agents-architect+agent-father (no gateway binding). Fix: new `.claude/skills/commit-boundary/SKILL.md` (3 rules + per-agent zone table) wired into init.md always_load for all three agents + pm mutex-claim pre-commit step. Supersedes FU-ARCHITECT-MUTEX-BINDING + FU-AGENT-FATHER-ORCH-SCOPE.

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row `aac-commit-boundary-20260602T181856Z` → agent-father

---

## 2026-06-02T14:14:14Z

**Brief:** `docs/architecture-briefs/2026-06-02-bctc-analytics-layer-bal1.md` (addendum § BAL-1a-BACKFILL Decision)

BAL-1a-BACKFILL recurring-bug-escalation (4th touch): DECIDED Option R (recompute-on-read) over Option B (one-shot backfill). Key insight: PUB-6 bounds check does not catch near-zero stale values (VNM roe=2.75e-10 passes the |roe|>300 guard), so only computing from correct base scalars on every read eliminates the defect class. Implementation: in `bctcFullTools.ts` get_bctc_full handler, inline-recompute 5 ratios from persisted base scalars immediately after DB read, mutate latestRow in place before checkPublishability call; persisted ratio columns become deprecated-cache (never read in serve path). PUB-6 stays as backstop for bad-scalar edge cases.

**Signal dropped:** none (addendum to existing brief — dev-mcp-server already signaled via BAL-0-DEV task)

---

## 2026-06-02T21:11:11Z

**Brief:** `docs/architecture-briefs/2026-06-02-frontend-operator-ux.md`

Two operator dashboard UX requests: (REQ1) SSOT `<QueName>` factory component with hover tooltip — seam A1 (static map codegen from QUE_DATA, `scripts/gen-que-descriptions.ts` → committed generated file, zero mcp rebuild); 4 render sites enumerated in dashboard.analysis.tsx (L673, L796-797, L1066, L1393-1396), all must use the factory. (REQ2) Service Health 2-axis model {container: deployed|not_deployed} × {capability-via-mcp: live|data_limited|dark} + capability_manifest anchored in system-map.json; probe runs in api-gateway /health enrichment (bounded max 7 probes, TTL 60s), never fanned out from browser; anti-false-green: deployed service going DOWN always RED.

**Signal dropped:** orch-state FOU-1-DESIGN → DONE; FOU-2-REQ1 (dev-frontend), FOU-3-REQ2 (pm splits: FOU-3-GW dev-api-gateway + FOU-3-FE dev-frontend + FOU-3-QA qa) → pm next.

---

## 2026-06-02T03:16:33Z

**Brief:** `docs/architecture-briefs/2026-06-02-notebook-write-prune-contract.md`

4th notebook cap breach in 3 days root-caused to 4 distinct failure modes: (F-1) unified-agent `## Prior cycles` is a permanent accumulator section whose `###` sub-blocks are structurally invisible to block-level AC-2 prune; (F-2) bctc-analyst has a dead "Overwrite" instruction overridden by `cowork-end-cycle` → append path producing 6 live sections; (F-3) AC-5 write-time guard never reaches effective write path in any of the 3 breaching agents (all inline their writes before chaining cowork-end-cycle); (F-4) market-watcher OVERWRITE template itself exceeds the ≤80L cap it targets. DECIDED: two-class contract (OVERWRITE: po/market-watcher ≤50-80L; APPEND: CHEF/news-scout/bctc-analyst/agents-architect ≤200L with AC-2b intra-section prune for permanent accumulator headings); L95 TODO resolved. 5 flow/skill edits scoped for agent-father (S-1 chef.md Step 8, S-2 bctc-analyst stage-log-notify, S-3 news-scout stage-log-notify, S-4 market-watcher cycle.md Step 5, S-5 notebook-write SKILL).

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row (from:agents-architect, to:po, type:brief_complete)

---

## 2026-06-03T10:19:25Z

**Brief:** `docs/architecture-briefs/2026-06-03-lf-group-stage-rethink.md`

LF-GROUP-RETHINK SPIKE: unit-grouping globally inert (46 singleton units) despite LF-IMPL-1/2 live. Root cause: `_is_title_band` (D-5 guard) fires on EVERY financial statement page text (any non-numeric 2+-word line in first 8 lines) → `_fingerprints_continuous` returns False for ALL consecutive page pairs → build_document_map creates one unit per page. Fix: remove D-5 call from `_fingerprints_continuous` (Option A — 3-line removal); LF-IMPL-1 page_type equality check is the correct structural boundary gate. Test gap: tests used empty stored_texts, D-5 never fires in test suite. Owner: dev-pdf-extractor (LF-GRP-1 code + LF-GRP-2 test fix) + qa (LF-GRP-3 re-extract verify).

**Signal dropped:** `docs/data/orch/orch-state.json` `.signal_queue` row `lf-group-rethink-brief-20260603T101925Z` → agent-father

---

## 2026-06-03T20:35:08Z

**Brief:** `docs/architecture-briefs/2026-06-03-cowork-heartbeat-schema.md`

FU-COWORK-HEARTBEAT-SCHEMA: cowork-team main.md LLM runtime drifts from its own Step 6 spec — 37+ on-disk files use flat {classification,reason,tick_nominal,...} with no envelope. autosilent.sh and Step 6 spec are both enveloped {from,to,type,payload,createdAt} — already correct. Canonical = enveloped (drain-signals.md Step 0a-1 fingerprints on from+type+payload+createdAt). Fix = INVARIANT guard block inserted at Step 6 header + flat-unique telemetry fields (classification/reason/leader_lock/dev_head/devq/signal_backlog/note) added inside payload. agent-father to edit main.md only; autosilent.sh untouched.

**Signal dropped:** `docs/signals/cowork-heartbeat-schema-20260603T203508Z.json` → agent-father
