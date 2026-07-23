## Task Report UC-MDH-P4

**Mode:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null` — committed straight to `main`, no `task/NNN-*` branch)
**Title:** Implement the promised sprint-journal archival in pm task-archive (`scripts/agents-flow/decision-journal-archive.sh`)
**Commits verified:** `48e6bf250` (script + test + flow-doc + docs) · `880c28f43` (board flip) — both confirmed on `main` ancestry via `git merge-base --is-ancestor`.

### changed
- `scripts/agents-flow/decision-journal-archive.sh:1-230` (new)
- `scripts/agents-flow/decision-journal-archive.test.sh:1-322` (new)
- `docs/agents/pm/flow/task-archive.md` — pre-eviction id capture + § Step 5.5 pointer + Step 6 pathspec extension (+17L)
- `docs/policies/dev-standards.md` — CANONICAL pointer (+15L)
- `docs/WORK.md`, `docs/agent-memory/notebooks/developer.md`, `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-developer.md` (developer journal)

### tests
`bash scripts/agents-flow/decision-journal-archive.test.sh` — **26 pass / 0 fail, exit 0** (re-run live, not accepted from prose). Sandboxed via `mktemp -d` fixture (`SANDBOX`), `ORCH_STATE`/`ORCH_ARCHIVE_DIR`/`DECISIONS_DIR`/`ARCHIVE_DECISIONS_DIR` env overrides pointed entirely off-tree, `DJA_GIT_MV=0` forces plain `mv` inside the fixture (not `git mv` against the real index).

Independently confirmed sandboxing beyond trusting the harness's own env-var claims: snapshotted `docs/agent-memory/decisions/` + `docs/archive/decisions/` (487 files — filenames + per-file md5) immediately before and immediately after the test run. Filename list and every hash are **byte-identical**; `git status --porcelain` on both paths is unchanged before/after (same 3 pre-existing unrelated untracked peer files, none touched by the run).

tsc: N/A (shell-only, zero `.ts` touched — confirmed via `git show --stat` on both commits — Smart-Skip correctly applies) | ddd: PASS (zero `from.*infrastructure`/`from.*application` hits) | security: PASS (zero `process.env`/secrets hits)

### DDD / mock-guard / security
`bash scripts/audits/mock-guard.sh --files "scripts/agents-flow/decision-journal-archive.sh"` → `No production source files to scan. PASS.` (`.sh` is outside mock-guard's scan surface — expected, not a gap).

### Verification detail (raw, at source)
1. **File-ops-ONLY, never writes orch-state.json** — grep-confirmed: `ORCH_STATE` appears only in `jq -r ... "$ORCH_STATE"` read sites (2) plus the missing-file guard; zero `>`/write redirection anywhere in the file, zero `orch-apply.sh` reference. SSOT-W1 boundary holds.
2. **Contract fidelity vs the flow doc** — `docs/agents/pm/flow/task-archive.md` § Step 5.5 invokes `comm -23 <(echo "$PRE_EVICT_ACTIVE_IDS") <(echo "$POST_EVICT_ACTIVE_IDS") | bash .../decision-journal-archive.sh` (stdin mode, no flag) — matches the script's default `MODE="stdin"` exactly. `--all` mode (backfill) is a separate documented entry point, exercised in the test suite (run2/run3) and by the CANONICAL pointer in `dev-standards.md`. Step 6's `git add` pathspec covers both `docs/agent-memory/decisions/` and `docs/archive/decisions/`, correctly capturing the rename pair (`git mv` old+new paths) per `feedback_pathspec_commit_drops_rename_deletion`.
3. **Longest-match derivation, not bare-prefix-glob** — read the awk block (script:162-175): for each candidate file it strips `sprint-`/`.md`, then finds the LONGEST id in the closed∪active universe such that the remainder equals the id exactly or starts with `<id>-`; only then checks whether that specific id is closed-and-in-scope. Independently confirmed this is not a hypothetical: live-grepped `docs/data/orch/orch-state.json` and found `OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` genuinely present in `.task_board.active_sprints[]` while `OHLCV-UNIT-CONTAM` is genuinely a `.task_board.closed_sprints[]` stub — a real, live string-prefix collision the script must (and does, per the paired `PREFIX-COLLIDE`/`PREFIX-COLLIDE-EXTENDED` test fixtures) resolve to the longer active id, not the shorter closed one.
4. **Injection-safety** — no unquoted interpolation: `grep -Fxq` (fixed-string, not regex) for id membership tests, `awk -v rest="$rest"` (not string-concatenated into the program), `git mv -k -- "$f" "$dest"` / `mv "$f" "$dest"` (quoted, `--` separator against dash-led filenames). All shell variables consistently double-quoted.
5. **Idempotent + re-runnable** — test run3 (same fixture, no reset) re-runs `--all` and asserts `archived=0` (all previously-eligible files already moved); test run4 exercises a same-basename destination collision and asserts `SKIP-EXISTS` (source left untouched, destination never clobbered). `--dry-run` mode (test run7) previews `WOULD-ARCHIVE` with zero source/destination mutation — matches the developer's claim that the one-time `--all` backfill was safely previewed (~202/431 eligible) without being executed.
6. **Step 5.5 pointer + Step 6 pathspec coherence** — both additions in `task-archive.md` are minimal, additive, positioned correctly (pre-eviction id capture at the top before either eviction path; the Step 5.5 diff runs after both §Sprint Eviction and Step 4's `orch-cold-evict.sh`, as its own comment requires, since sprints can close via either path).
7. **Developer DJ-GATE-1** — `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S18, `task-id: UC-MDH-P4` present and matching.

No blocking issues found.

### NOTE — deferred `--all` backfill (not executed here)
The developer deliberately did **not** run the one-time mutating `--all` backfill (`--dry-run` confirmed ~202/431 closed-sprint journals would be archived). This mass file-move is correctly treated as a separate, deliberate post-QA/PO-routed action — it was not run as part of this verification and should not be inferred as done.

### verdict
**APPROVED** — direct-commit verify, no branch/merge (already on `main`).

### board disposition
`task_board.review[] -> task_board.done_verified[]` (status `REVIEW -> DONE_VERIFIED`), `qa_verdict=APPROVED`, `qa_verified_at=2026-07-23T05:50:02Z`, `qa_commit=48e6bf250`, `branch=null` — single `orch-apply.sh` write, Zod + conservation PASS (task_total 622=622, signal_total 108=108). `.head` synced to idle/`active_task_id:null`/`next_agent=pm` in the SAME write (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).
