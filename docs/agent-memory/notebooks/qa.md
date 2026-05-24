# QA — Notebook

## c282 cycle-76 · 2026-05-24 · alert-engine P2-L — G10 bug injection (pre-inject tag + sealed spec) — DONE

**Task:** P2-L — Create alert-engine-pre-inject tag + inject G10 bug | **Verdict:** DONE — all 4 ACs PASS

```
date: 2026-05-24T10:16:00Z
outcome: DONE — 4/4 ACs PASS; G10 setup complete
type: pilot-task-qa (tag creation + deliberate bug injection + sealed spec)
signal: docs/signals/qa-ae-P2-L-injection-done-20260524T101600Z.json
sealed_spec: docs/handoffs/TASK_P2-L-ae-injection-spec.md
pre_inject_tag: alert-engine-pre-inject → commit 3326e7dd
injection_commit: da6c71d3
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (CONFIRMED)
fixer_blindness_enforced: true (file/line/literal in sealed spec only, NOT in signal/SSOT/P2-M handoff)
sandbox_result: total=11 pass=7 fail=4 status=FAIL exit 1
ssot_not_mutated: goalsEarned=0, decisionMatrix all TBD, no goal flips
g10_goal_status: EARNED-PENDING (PO flips at Phase-3 12/12 terminal)
```

| AC | Verdict | Key Evidence |
|----|---------|-------------|
| AC-1 (pre-inject tag before injection) | PASS | alert-engine-pre-inject → 3326e7dd; injection commit da6c71d3 on top |
| AC-2 (sandbox FAIL after injection) | PASS | exit 1; 4 FAILs: dedup-key-builder-{edge,failure,golden}.json + alert-pipeline-golden.json |
| AC-3 (dashboard RED) | PASS | dedup-key-builder card RED, alert-pipeline card RED; cooldown-gate+signal-classifier GREEN |
| AC-4 (injection commit + sealed spec) | PASS | commit subject does not reveal primitive/literal; full spec in SEALED TASK_P2-L-ae-injection-spec.md |

**P2-L verdict: DONE — G10 setup complete. Fixer-blindness enforced.**
**NEXT:** pm — assemble P2-M handoff with symptom-level instructions only (sealed spec NOT included in P2-M dispatch).

---

## c282 cycle-75 · 2026-05-24 · kinh-dich-service Phase-1 Close-Gate — CONDITIONAL-GO

**Task:** Phase-1 close-gate (Go reboot) — G1/G2/G3/G6/G7/G8/G9/G12 evidence | **Verdict:** CONDITIONAL-GO

```
date: 2026-05-24
outcome: CONDITIONAL-GO
type: pilot-phase-gate (kinh-dich-service Phase-1 Go reboot terminal gate)
go_build: CGO_ENABLED=0 go build ./... EXIT:0
go_vet: EXIT:0
go_test: 39/39 PASS EXIT:0 (5 primitive packages + 1 module package)
sandbox_primitive: 15/15 PASS EXIT:0
sandbox_module: 2/2 PASS EXIT:0
sandbox_combined: 17/17 PASS EXIT:0 CGO_ENABLED=0
env_audit: EMPTY — zero forbidden keys (DB_/API_KEY/SECRET/TOKEN/PASSWORD)
g8_honest_red: CONFIRMED — hexagram-resolver-golden corrupted (expected 1->99) → EXIT:1, 14/15 RED; revert → 17/17 GREEN EXIT:0; zero residue in git status
scenario_correction: LEGITIMATE — (11,55,19) → (30,28,56) is mathematically correct for input [0.8,-0.3,0.6,0.1,-0.7,0.4] with THIEU_DUONG_THRESHOLD=0.10; TS src confirms 0.10; traced manually
stale_labels: TWO CSS/JS comments contain 'language=ts, runtime=bun' (lines 13, 1578) — inside code comments only, NOT rendered content; service card body correctly says 'Go 1.22 (CGO_ENABLED=0)' — non-blocking
dash_check: WARN (cold-start honest NOT-RUN: 17 pending, 0 green, 0 red, 0 jsErrors)
git_status: only render-check.png untracked — no uncommitted Go substance
commit_race: Go files on main via races 2ac5e096/fec4a0e0 (wrong commit subject) — files correct, cosmetic, non-blocking per standing policy
ssot_not_mutated: all 12 goals TBD (G9 IN-PROGRESS from hold), goalsEarned=0, status=ACTIVE — PO flips at close
ddd_fence_A: pkg/primitive/ has ZERO infrastructure/application/interface/module/domain code imports; nuclear_hexagram imports sister primitives (hao_encoder, hexagram_resolver) — Fence-A exempt per OQ-6, documented in source
ddd_fence_B: grep pkg/infrastructure in pkg/module/reading_composer/ = 0 (comments only) — PASS
g3_main_go: 46 lines (≤80 gate PASS); domain-op grep = 0; PORT from os.Getenv("PORT") default "5005"
api_openapi_yaml: PRESENT at api/openapi.yaml
g12_gate_baked: CONFIRMED in .claude/flows/dev-kinh-dich/main.md (explicit "Do not mark task DONE until sandbox dashboard shows all kinh-dich scenarios GREEN")
goals_with_complete_phase1_evidence: G1(5 prims/15 scenarios/5 failure), G2(module/Fence-B), G3(scaffold/main.go/openapi), G6(3-panel dashboard), G7(env-audit), G8(honest-red proven), G12(gate baked)
goals_needing_phase2: G4(depguard fence), G5(TS deletion+HTTP rewire), G9(re-confirm on Go dashboard — path B PO Playwright), G10(AI-fix bug injection), G11(regression alarm)
```

| Check | Command | Result |
|-------|---------|--------|
| go build CGO=0 | `CGO_ENABLED=0 go build ./...` | EXIT:0 PASS |
| go vet | `go vet ./...` | EXIT:0 PASS |
| go test | `go test ./...` | 39/39 PASS EXIT:0 |
| sandbox primitive | `go run ./cmd/sandbox -tier=primitive -scenario=all` | 15/15 GREEN EXIT:0 |
| sandbox module | `go run ./cmd/sandbox -tier=module -scenario=all` | 2/2 GREEN EXIT:0 |
| env audit | `env \| grep -E 'DB_\|...'` | EMPTY PASS |
| G8 corrupt | flip expected hexagram 1→99 → sandbox | EXIT:1 RED 14/15 PASS |
| G8 revert | restore → sandbox | EXIT:0 15/15 GREEN PASS |
| git residue | `git status --short docs/scenarios/kinh-dich/` | CLEAN PASS |
| Fence-A | grep pkg/infra/app/interface/module in pkg/primitive/ | 0 matches (comments only) PASS |
| Fence-B | grep pkg/infrastructure in pkg/module/ | 0 matches (comments only) PASS |
| G3 line count | wc -l cmd/server/main.go | 46 lines PASS |
| G3 domain-op grep | grep domain ops in main.go | 0 PASS |
| G6 dash-check | node dashboard/dash-check.mjs | WARN/HONEST — 0 jsErrors, 17 pending PASS |
| SSOT | pilot-status-kinh-dich.json goals | all TBD/IN-PROGRESS, goalsEarned=0 PASS |

**Phase-1 close-gate: CONDITIONAL-GO**
**NEXT:** po — Phase-1 close authorization (flip goals to YES/EARNED-PENDING as appropriate) + Phase-2 plan kickoff (G4 depguard fence, G5 TS deletion, G9 Go dashboard re-confirm, G10/G11 AI-fixability)

---

## c282 cycle-74 · 2026-05-24 · rag-service Phase 1 Gate — G12 streak verification — PASS

**Task:** Phase 1 gate verification (P1-B + P1-C + P1-E G12 streak) | **Verdict:** PASS

```
date: 2026-05-24
outcome: PASS — Phase 1 gate APPROVED. G12 streak 3/3 independently verified.
type: pilot-phase-gate (rag-service Phase 1 terminal gate)
evidence: docs/handoffs/TASK_P1-E-rag-service-dashboard.md §[QA] Review Record
pytest: 51/51 PASS exit 0
sandbox_primitive: 4/4 PASS exit 0, byte-identical x2 (determinism CONFIRMED)
sandbox_module: 1/1 PASS exit 0, byte-identical x2 (determinism CONFIRMED)
dash_check: 17/17 PASS exit 0 (4 NOT-RUN honest, microservice NOT-RUN, zero external URLs)
env_audit: EMPTY — zero forbidden keys
ddd_fence: CLEAN — zero code imports of infra/model/db in primitive+module+sandbox layers
g12_gate_baked: CONFIRMED in .claude/flows/dev-rag-service/main.md
g12_streak_verified: P1-B (notebook evidence) + P1-C (TASK_P1-C-retrieval-module-stub.md) + P1-E (handoff)
concurrent_commit: cfd38a3b attribution gap noted, non-blocking, files correct on main
p1_b_handoff_gap: no standalone handoff file for P1-B — evidence in dev-rag-service notebook only (non-blocking)
ssot_not_mutated: pilot-status-rag-service.json not touched (PO-only atomic close)
goal_flips: NONE (Charter §4.5 honored — G12 EARNED-PENDING candidacy noted, PO flips at 12/12)
```

| Check | Command | Result |
|-------|---------|--------|
| ZERO model/DB | grep sentence_transformers\|lancedb\|torch\|transformers in sandbox/+primitive/+module/ | EXIT:1, PASS |
| Sandbox primitive | `python3 -m sandbox --tier=primitive --scenario=all` | 4/4 PASS, exit 0 |
| Sandbox module | `python3 -m sandbox --tier=module --scenario=all` | 1/1 PASS, exit 0 |
| Determinism | diff run1 vs run2 (both tiers) | BYTE-IDENTICAL, PASS |
| Env audit | `env \| grep -E 'DB_\|...\|OPENAI'` | EMPTY, PASS |
| Dashboard | `python3 dash-check.py` | 17/17 PASS |
| pytest | `python3 -m pytest -q` | 51/51, 6.51s |
| Fence-A/B | grep infra/app/interface imports in domain layers | Comments only, PASS |

**Phase 1 gate: PASS**
**NEXT:** pm — execute Phase 1 gate in pilot-status-rag-service.json (phase1.status=APPROVED, phase=2, G12=EARNED-PENDING), open Phase 2.

---

## c282 cycle-73 · 2026-05-24 · alert-engine P2-J — G8 honest-red deliberate-break proof — PASS

**Task:** P2-J — G8 honest-red deliberate-break proof | **Verdict:** PASS

```
date: 2026-05-24T08:00:02Z
outcome: PASS — 5/5 ACs PASS; G8 honest-red contract proven across 3 primitives
type: pilot-task-qa (deliberate-break proof — corrupt+revert+revert discipline, no code committed)
evidence: docs/handoffs/TASK_P2-J-ae-g8-evidence.md
signal: docs/signals/qa-ae-P2-J-g8-done-20260524T080002Z.json
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (merge-base --is-ancestor exit 0)
scenario_files_staged: 0 (all 3 corruptions reverted before commit)
ssot_not_mutated: goalsEarned=0, decisionMatrix all TBD, G8 stays EARNED-PENDING
g8_goal_status: EARNED-PENDING (PO flips at Phase-3 terminal)
```

| AC | Command | Result | Verdict |
|----|---------|--------|---------|
| AC-1 (Test A — cooldown-gate corrupt) | suppress false→true → sandbox run | exit 1, fail=1, FAIL line present | PASS |
| AC-2 (Test B — golden after revert) | git checkout cooldown-gate-golden → sandbox run | exit 0, 11/11 PASS, status=OK | PASS |
| AC-3 Run 1 (signal-classifier corrupt) | valid true→false → sandbox run | exit 1, fail=1 | PASS |
| AC-3 Run 2 (dedup-key-builder corrupt) | fingerprint 4c79b07f→deadbeef → sandbox run | exit 1, fail=1 | PASS |
| AC-4 (git status clean of alert-engine scenarios) | git status --short grep scenarios | zero alert-engine files | PASS |
| AC-5 (G8 evidence compiled + signal) | evidence file + signal created + committed | files committed | PASS |

**G8 verdict: PASS — dashboard is NOT false-green. Honest-red proven.**
**Next:** pm — mark P2-J DONE, sequence P2-K (G9 PO Playwright Path B).

---

## c282 cycle-72 · 2026-05-24 · alert-engine P2-G — G5b/G5c audit — PASS

**Task:** P2-G — G5b/G5c audit (brownfield deprecation integration regression check) | **Verdict:** PASS

```
date: 2026-05-24T07:35:23Z
outcome: PASS — 5/5 ACs PASS; G5 evidence complete
type: pilot-task-qa (read-only audit + evidence writing, no code changes)
signal: docs/signals/qa-ae-P2-G-g5-evidence-done-20260524T073523Z.json
evidence: docs/handoffs/TASK_P2-G-ae-g5b-g5c-audit.md §[QA] Review Record
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (merge-base --is-ancestor exit 0)
foreign_paths_staged: 0 (staging discipline enforced)
ssot_not_mutated: goalsEarned/decisionMatrix untouched; G5 stays EARNED-PENDING
```

| AC | Command | Count | Verdict |
|----|---------|-------|---------|
| AC-1 (zero direct domain imports) | grep vn-market-intelligence/alert-engine\|apps/alert-engine/pkg in mcp-server/src/ | 0 matches (exit 1) | PASS |
| AC-2 (HTTP client at port 5006) | grep 5006\|alert-engine\|alertEngine clients.ts | 2 matches (lines 13, 28) | PASS |
| AC-3 (zero TODO.*migrat in alert-engine/) | grep TODO.*migrat *.go | 0 matches (exit 1) | PASS |
| AC-4 (zero TODO.*migrat in _deprecated/) | grep TODO.*migrat _deprecated/ | 0 matches (exit 1) | PASS |
| AC-5 (G5 evidence compiled) | handoff updated + signal emitted | g5_ready_to_grade=YES | PASS |

**G5 status:** EARNED-PENDING (evidence complete; PO flips at Phase-3 terminal 12/12 close)
**P2-G verdict: PASS**
**NEXT:** pm — mark P2-G DONE, sequence P2-H (G3 composition root).

---

## c282 cycle-71 · 2026-05-24 · alert-engine P2-D — G4 freeze-anchor confirmation + evidence compilation — PASS

**Task:** P2-D AC-1/AC-2/AC-3 — G4 evidence compilation | **Verdict:** PASS

```
date: 2026-05-24T09:20:00Z
outcome: PASS — freeze anchor confirmed, tag ancestry verified, G4 evidence table complete
type: pilot-task-qa (read-only verification + evidence writing)
signal: docs/signals/qa-ae-P2-D-g4-evidence-done-20260524T092000Z.json
evidence: docs/handoffs/TASK_P2-D-ae-g4-evidence.md §G4 Evidence Summary
ac_1_freeze_sha: 6c2edc9d (only commit on .golangci.yml — P2-B commit, no subsequent touch)
ac_2_tag_sha: 4d5b2f754aa1782e870acd633abc7f316593a08e (alert-engine-pre-ci ancestor of HEAD, exit 0)
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (merge-base --is-ancestor exit 0)
foreign_paths_staged: 0 (staging discipline verified pre-commit)
ssot_not_mutated: goalsEarned=0, decisionMatrix all TBD, no goal flips
g4_goal_status: EARNED-PENDING (evidence complete; PO flips at Phase-3 terminal 12/12 close)
```

| AC | Verdict | Key Evidence |
|----|---------|-------------|
| AC-1 (freeze anchor) | PASS | `git log --oneline apps/alert-engine/.golangci.yml` → 1 commit: 6c2edc9d P2-B. No subsequent touch. |
| AC-2 (tag ancestry) | PASS | `git merge-base --is-ancestor alert-engine-pre-ci HEAD` exit 0; tag SHA 4d5b2f75 |
| AC-3 (G4 evidence table) | PASS | 6-field table written to handoff; all fields populated with real SHAs |

**P2-D verdict: PASS — G4 evidence complete. G4 stays EARNED-PENDING.**
**NEXT:** pm — mark P2-D DONE, sequence P2-E (pre-delete tag).

---

## c282 cycle-70 · 2026-05-24 · alert-engine P2-C — G4 Fence-A QA reproduction — PASS

**Task:** P2-C AC-4 — QA independent fence reproduction | **Verdict:** PASS (fence enforces universally, not file-specific)

```
date: 2026-05-24T09:06:00Z
outcome: PASS — Fence-A independently enforced on dedup-key-builder/builder.go
type: pilot-task-qa (fence-enforcement reproduction, inject+revert discipline)
signal: docs/signals/qa-ae-P2-C-repro-done-20260524T090600Z.json
evidence: docs/handoffs/TASK_P2-C-ae-g4-fence-violation-proof.md §Evidence — QA Reproduction
injected_file: apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go
verbatim_fence_a_line: "pkg/primitive/dedup-key-builder/builder.go:21:2: import 'github.com/vn-market-intelligence/alert-engine/pkg/infrastructure' is not allowed from list 'fence-a': Fence-A: primitive must not import infrastructure layer (depguard)"
lint_exit_violation: 1 | lint_exit_after_revert: 0
git_status_clean: true (violation never staged/committed)
sandbox: 11/11 PASS exit 0
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (merge-base exit 0)
background_files_undisturbed: true
```

| Check | Verdict |
|---|---|
| Fence-A fires on different file (dedup-key-builder) | PASS |
| fence-a rule name in output | PASS |
| Violation file named in output | PASS |
| Lint exit non-zero on violation | PASS (exit 1) |
| Lint exit 0 after revert | PASS |
| git status clean (never staged/committed) | PASS |
| Sandbox 11/11 | PASS |
| Anchor intact | PASS |
| Background files undisturbed | PASS |

**P2-C verdict: PASS — fence is NOT file-specific. feedback_fence_false_green cross-check satisfied.**
**NEXT:** pm — mark P2-C DONE, sequence P2-D (freeze-anchor confirmation).

---

## c282 cycle-69 · 2026-05-24 · kinh-dich P2-KD-Z — Phase-2 close-gate — READY-FOR-PHASE-3

**Task:** P2-KD-Z — Phase-2 Close-Gate Verification | **Verdict:** READY-FOR-PHASE-3

```
date: 2026-05-24T04:55:03Z
outcome: READY-FOR-PHASE-3
type: pilot-task-qa (Phase-2 close-gate — read-only audit + live sandbox run)
signal: docs/signals/qa-kd-phase2-close-gate-20260524T045503Z.json
evidence: docs/handoffs/TASK_P2-KD-Z-close-gate-evidence.md
sandbox: 17/17 PASS, exit 0 (15 primitive + 2 module)
eslint: exit 0 | tsc: exit 0
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (CONFIRMED — 153 commits since, ancestor of HEAD)
ssot_not_mutated: goalsEarned=0, decisionMatrix all TBD, no dup keys
goal_flips: NONE (Charter §4.5 honored)
```

| AC | Verdict | Key Evidence |
|----|---------|-------------|
| AC-1 (sandbox 17/17 + ESLint + tsc) | PASS | All exit 0; 17/17 scenarios green |
| AC-2 (goal evidence G1/G3/G4/G5/G6/G8/G9/G10/G11/G12) | PASS | Evidence complete; TASK_P2-KD-N-g10-g11.md absent as separate file but G10/G11 evidence fully in TASK_P2-KD-N.md |
| AC-3 (G12 streak carry-forward) | PASS | P1-B1/B2/B3/D/E/F + P2 tasks all sandbox-green-before-DONE |
| AC-4 (pre-revert tags ancestry) | PASS | pre-ci→pre-delete→pre-inject→HEAD ancestry verified |
| AC-5 (ESLint fence clean) | PASS | exit 0, no warnings |
| AC-6 (anchor + SSOT) | PASS | Anchor ancestor CONFIRMED; goalsEarned=0; decisionMatrix TBD; no dup keys |
| AC-7 (SI-2 boundary Phase 2) | PASS | No Phase-2 task touched SI-2; pre-Phase-2 469c047a is metadata-only, documented |

**Verdict: READY-FOR-PHASE-3**
**NEXT:** pm — record P2-KD-Z DONE + Phase-2 COMPLETE, then authorize Phase-3 PO terminal 12/12 atomic close.

---

## c282 cycle-64 · 2026-05-24 · stock-price P2-Z — Phase-2 close-gate — READY-FOR-PHASE-3

**Task:** P2-Z — Phase-2 Close-Gate Verification | **Verdict:** READY-FOR-PHASE-3 | **Commit:** (pending)

```
date: 2026-05-24T02:20:19Z
outcome: READY-FOR-PHASE-3
type: pilot-task-qa (Phase-2 close-gate — read-only verification + sandbox run, no production code mutation)
signal: docs/signals/qa-sp-phase2-close-gate-20260524T022019Z.json
evidence: docs/handoffs/TASK_P2-Z-sp-close-gate-evidence.md
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (CONFIRMED — 104 commits since anchor, ancestor of HEAD)
ssot_not_mutated: docs/data/pilot-status-stock-price.json (read-only — not touched)
goal_flips: NONE (Charter §4.5 honored — all 12 G-goals TBD)
phase_field_note: PM omission — top-level phase="1" instead of "2"; §4.5 binding invariants all intact; PM to correct in Phase-3 terminal commit
```

| AC | Verdict | Key Evidence |
|----|---------|-------------|
| AC-1 (sandbox all-green) | PASS | primitive=9/9, module=2/2, all=11/11 exit 0; go build exit 0; golangci-lint 0 issues exit 0 |
| AC-2 (goal evidence complete) | PASS | All 6 files present: TASK_P2-H.md (G3), TASK_P2-D-sp-g4-evidence.md (G4), TASK_P2-G-sp-g5-evidence.md (G5), TASK_P2-J-sp-g8-evidence.md (G8), 2026-05-24-g9-stock-price-user-confirmation.md (G9), dev-sp-P2-M-done-20260524T021353Z.json (G10/G11) |
| AC-3 (G12 streak) | PASS | Phase-1 3/3 complete (P1-B1/B2/B3) + Phase-2 5 tasks (P2-B/F/H/I/M) all sandbox-green-before-DONE |
| AC-4 (tag ancestry) | PASS | ci<=delete OK; delete<=inject OK — both merge-base --is-ancestor checks exit 0 |
| AC-5 (anchor + SSOT) | CONDITIONAL-PASS | Anchor ancestor CONFIRMED; goalsEarned=0 CONFIRMED; decisionMatrix all TBD CONFIRMED; no dup keys; top-level phase="1" PM omission (non-blocking) |

**Phase-2 exit criteria:**
- Criterion 1: All 6 Phase-2 goal evidence files present — PASS
- Criterion 2: Sandbox all-green (11/11) — PASS
- Criterion 3: G12 streak carry-forward — PASS
- Criterion 4: Pre-revert tags ordered — PASS
- Criterion 5: §4.5 binding invariants intact — PASS (with PM phase field note)

**Verdict: READY-FOR-PHASE-3**
**NEXT:** pm — record P2-Z DONE + Phase-2 COMPLETE in SSOT (update phase2.status=CLOSED, top-level phase="2"), then authorize Phase-3 PO terminal 12/12 atomic close.

---

## c282 cycle-63 · 2026-05-24 · stock-price P2-J — G8 honest-red deliberate-break proof — 5/5 ACs PASS

**Task:** P2-J — G8 honest-red deliberate-break proof | **Verdict:** APPROVED — G8 PROVEN | **Commit:** b960bd8f

```
date: 2026-05-24T01:49:00Z
outcome: 5/5 ACs PASS — G8 honest-red contract proven
type: pilot-task-qa (deliberate-break proof, read-only + revert discipline)
evidence: docs/handoffs/TASK_P2-J-sp-g8-evidence.md
signal: docs/signals/qa-sp-P2-J-g8-done-20260524T014900Z.json
anchor_intact: debba8eaff0724d1fb32fc9d28640201cc32d1cc (CONFIRMED)
ssot_not_mutated: docs/data/pilot-status-stock-price.json (not touched)
goal_flips: NONE (Charter §4.5)
```

| AC | Verdict | Key Evidence |
|----|---------|-------------|
| AC-1 (Test A) | PASS | tier-fallback-selector-golden source hnx → exit 1, fail=1, dashboard RED |
| AC-2 (Test B) | PASS | after revert → exit 0, total=11 pass=11 fail=0 status=OK, dashboard GREEN |
| AC-3 Run 1 | PASS | price-quote-normalizer-golden changePercent 9.99 → exit 1, reverted clean |
| AC-3 Run 2 | PASS | price-staleness-classifier-golden STALE→FRESH flip → exit 1, reverted clean |
| AC-4 | PASS | git status --short grep scenarios = empty (zero scenario mutations remaining) |
| AC-5 | PASS | evidence file + signal emitted + committed |

**Next:** PM sequences P2-K (G9 PO Playwright Path B).

---
