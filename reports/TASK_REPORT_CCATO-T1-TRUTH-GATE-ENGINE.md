## Task Report CCATO-T1-TRUTH-GATE-ENGINE

**Sprint:** NARRATIVE-TRUTH-CCATO-GATE
**Spec:** `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md` S4.1-S4.4
**Commits under test:** `c18ba298` (feat, engine + harness), `29aac30e` (fix, isolation-safety)

changed: `scripts/narrative-truth-gate.sh` (455L), `docs/data/claim-tool-map.json` (89L), `scripts/test-narrative-truth-gate.sh` (231L)
tests: harness self-reports 10 pass / 0 fail (Step 0 tool-resolution + isolation x2 + (a) exit + (a) content + (b) content + (c) exit + (c) content + (d) exit + (d) content)
verdict: **APPROVED**

### Independent verification (RAW-run, not relayed from prior reports)

**1. Harness execution — run twice, both green**
```
$ bash scripts/test-narrative-truth-gate.sh   (run 1)
RESULT: 10 passed / 0 failed   exit=0

$ bash scripts/test-narrative-truth-gate.sh   (run 2)
RESULT: 10 passed / 0 failed   exit=0
```

**2. Isolation safety (the fixer's job — commit 29aac30e)**
- `jq '[.signal_queue.rows[]?|select(.type=="narrative_contradiction")]|length' docs/data/orch/orch-state.json`
  → `0` before run 1, `0` after run 1, `0` before run 2, `0` after run 2. No accumulation.
- `shasum docs/data/orch/orch-state.json` identical across both runs: `e64b32805d77d60abe4329af4d1b5a42c7c336c3` (before run1 == after run1 == before run2 == after run2).
- `git diff docs/data/orch/orch-state.json` after both runs contains ONLY the pre-existing dispatcher `.head` handoff-note edit (made before I was spawned, to route this task to qa) — zero bytes attributable to the harness. No `docs/data/orch/.orch-apply-*.json` stray temp files left behind.
- The harness proves the real FAIL-path emit (2 rows, `orch-validate.mjs` Stage 0+1 PASS) against an **isolated copy** via `ORCH_STATE=<copy> ORCH_APPLY_LIVE_FILE_OVERRIDE=<copy>` — `scripts/orch-apply.sh:49` genuinely honors `ORCH_APPLY_LIVE_FILE_OVERRIDE`, confirmed by reading the script directly. This is correct design, not a cheat: it exercises the real write+validate path without polluting the live signal_queue.

**3. Zero-hardcode grep** (`scripts/narrative-truth-gate.sh`)
```
grep -n '"VNM"\|"HPG"\|"VCB"\|"FPT"\|"ANI"' scripts/narrative-truth-gate.sh        → no matches
grep -n 'get_technical_indicators\|get_foreign_flow\|get_macro_snapshot\|...' scripts/narrative-truth-gate.sh → no matches
grep -n 'không có dữ liệu\|chưa trả được\|RSI\|MACD\|Bollinger' scripts/narrative-truth-gate.sh → no matches
```
All lexicon/dimension/tool/null-marker data flows through `claim_map.get(...)` (lines 114-117, 194) reading `docs/data/claim-tool-map.json` at runtime. The only structural literals in the script are: the `arg_style` dispatch-key strings (`ticker_code`/`ticker_codes_array`/`no_ticker`/`ticker_actionCode_yoy` — a finite shape-interpreter enum, documented in claim-tool-map.json `_meta.arg_style_values`, not domain data) and the `"vn-market"` gateway server slug (protocol constant, matches the brief's own literal usage and CLAUDE.md's mandated gateway wrapper convention). Neither is a ticker/keyword/tool literal that "should be config" — both are structural/protocol identifiers.

**4. Behavior — RAW-confirmed via live gateway calls (no cache arg passed, every classification is a live probe)**
- FAIL-on-non-null: `docs/social/fb-post-2026-06-30.md` (the real incident fixture, verified its line 10 + line 28 text matches the brief) → `[FAIL] dimension=technical_indicators ... ticker=VNM` citing live RSI/MACD, and `[FAIL] dimension=foreign_flow` citing live per-ticker `get_foreign_flow` data → exit 1.
- PASS-on-null: synthetic ANI fixture (real ticker, 1/35 candles) → `[PASS] dimension=technical_indicators ... ticker=ANI — honest no-data confirmed: "... Không đủ dữ liệu kỹ thuật ... TA: en attente (1/35 bougies) ..."` → exit 0.
- Determinism: run 1 and an independent re-run (NTG_SKIP_SIGNAL_EMIT=1) produced an identical 2-entry verdict set and identical exit code (1), both against fresh live gateway calls.

**5. S4.1-S4.4 AC coverage map** (task scope = CCATO-T1-TRUTH-GATE-ENGINE only, per `orch-state.json` sprint_goal — the SKILL.md wrapper is `CCATO-T2-CLAIM-TRUTH-SKILL` and the 6-flow wiring is `CCATO-T3-FLOW-WIRING-6PT`, both correctly BACKLOG/out-of-scope here)
| AC | Status | Evidence |
|---|---|---|
| S4.1 artifacts (claim-tool-map.json, narrative-truth-gate.sh, signal schema) | PASS | files exist; emit proven on isolated copy |
| S4.1 `.claude/skills/claim-truth-gate/SKILL.md` | N/A this task | belongs to CCATO-T2 (BACKLOG, depends on T1) |
| S4.2 claim-tool-map.json schema | PASS | version/negation_lexicon/dimensions all present; additive `arg_style`+`tool_null_markers`+`non_ticker_tokens` documented in `_meta` with rationale; `market_snapshot.keywords` deviation from brief's literal example is explicitly justified in `_meta.deviations_from_brief` (eliminates 2 phantom FAILs from "phiên này") |
| S4.3 algorithm steps 1-9 | PASS (minor note) | steps 1,2,4,5,6,7,8,9 match spec exactly; step 3's "±50 char window" is implemented as full-sentence-scope keyword match instead of a literal char window — functionally sound (no FP/FN across all DoD fixtures), not documented in `_meta` the way the keyword-tuning deviation was. Non-blocking. |
| S4.4 negation lexicon (11 seed entries) | PASS | exact match against brief content, sourced from JSON only |
| DoD (a)(b)(c)(d) §9 | PASS | all 4 independently reproduced (see §4 above) |
| DoD (e)(f) wiring/backstop | N/A this task | belongs to CCATO-T3 (BACKLOG, depends on T2) |

### Verdict
**APPROVED** — engine matches S4.1-S4.4 for its declared T1 scope, isolation-safety fix holds under 2 repeated runs (no live signal_queue pollution, no dirty-tree residue), zero-hardcode mandate holds, and all 4 documented DoD behaviors are independently reproduced against the live MCP gateway.
