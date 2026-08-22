<!-- size-justification: 152L (was 124L) — thin pointer + pilot enforcement content (Language Mode, Smoke Checks, G12 DoD, Security Clause, Fence Rules, Pre-Revert Tag Protocol, References); identical structure to dev-macro-indicators — schedule for split when rag-service pilot reaches Phase 2 (same pass as macro/TA S4). 2026-08-22 (router relay, same shape as CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT's digest-predict fix, commit 0225479e0): added "Notebook Write (override)" section (~28L) — the shared microservice-main.md pointer this agent inherits carries no per-agent section template, so this agent's notebook drifted to an OVERWRITE-shaped `## Working Memory` + dated `### ` sub-heading, pinning section_count at 1 forever; section makes the AC-6 APPEND-class dated-`## `-per-cycle convention explicit for this agent. Doc-fix only, notebook itself not touched. -->
# dev-rag-service — Main (Pointer)

**Zone:** `apps/rag-service/`
**Specialist for:** Embeddings, LanceDB, semantic search, temporal decay (Python/FastAPI)

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `rag-service`
- `<agent-id>` = `dev-rag-service`
- zone restriction: only `apps/rag-service/` files
- TDD: `pytest` (not bun test)

---

## Language Mode

**Python — fixed.** Language is locked Day 0 per `docs/data/pilot-status-rag-service.json` (sentence-transformers/LanceDB ML ecosystem constraint overrides Go-first default). Do NOT switch language.

All pilot tasks (P1-B/C/D/E buckets) are Python. No Go, no TS new files in `apps/rag-service/`.

---

## Smoke Checks

Run before every commit touching Python or scenario files.

| Check | Command |
|---|---|
| Unit tests | `cd apps/rag-service && python -m pytest` |
| Type check | `cd apps/rag-service && python -m mypy . --ignore-missing-imports` |
| Scenario JSON validity | `find docs/scenarios/rag-service -name '*.json' -exec python -m json.tool {} \; > /dev/null` |
| Sandbox runner (primitive) | `cd apps/rag-service && python -m sandbox --tier=primitive --service=rag-service --scenario=all` |
| Sandbox runner (module) | `cd apps/rag-service && python -m sandbox --tier=module --service=rag-service --scenario=all` |

---

## Pilot Hard Rule (G12 — blocking)

### G12 DoD Gate (mandatory — blocking from Day 0)

**Do NOT mark task DONE / write RETURN until:**

**(a)** The Python sandbox dashboard shows all rag-service scenarios GREEN. Run both tiers:

```bash
cd apps/rag-service
python -m sandbox --tier=primitive --service=rag-service --scenario=all
python -m sandbox --tier=module --service=rag-service --scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

**(b)** The sandbox env audit returns EMPTY:

```bash
env | grep -E 'DB_|API_KEY|SECRET|TOKEN|PASSWORD|LANCEDB|HF_|HUGGINGFACE'
# Must return empty — no credentials in sandbox process
```

**Paste both (a) output summary and (b) output** into the task handoff doc before writing the RETURN block.

If ANY scenario is RED, or if ANY forbidden key appears in env:
- The task is NOT done.
- Fix the issue before re-running.
- Each fix attempt without all-GREEN = 1 cycle (counted for G10/G11 evidence).

This rule is non-negotiable. Applies to every task in the `rag-service` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12

---

## Security Rule (§Security Clause — blocking)

**Sandbox MUST run with ZERO embedding-model access and ZERO LanceDB access.** Scenario JSON feeds pre-computed fixed embedding vectors as inputs — the model is never loaded, LanceDB is never queried.

Forbidden env keys in sandbox process: `DB_*`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `LANCEDB_*`, `HF_TOKEN`, `HUGGINGFACE_*`, `OPENAI_API_KEY`, `DATABASE_URL` (pointing at rag_service.db).

Do NOT regress `HF_HUB_OFFLINE=1` / pre-baked model cold-start hardening.

---

## Fence Rules (Python import-linter — G4 pre-check before commit)

Per SI-4 decision (Python fence design — first Python pilot). Tool: `import-linter` (contracts in `pyproject.toml` / `.importlinter`) OR ruff banned-import rules per architect SI-4 selection.

- **Fence-A:** `domain/primitive/*/` MUST NOT import `application/`, `infrastructure/`, or `interface/`. Check: `grep -rn "application\|infrastructure\|interface" apps/rag-service/domain/primitive/` returns 0.
- **Fence-B:** `application/` (retrieval module) MUST NOT import `infrastructure/` (embedding model, LanceDB adapter). Check: `grep -rn "infrastructure" apps/rag-service/application/` returns 0.

Fence violations = task not done. Fix and re-run.

NOTE: SI-4 Python-fence design must land before G4 AC can be locked (mirrors SI-3 gate for TS pilots). Load architect brownfield inventory when SI-4 is ready.

---

## Pre-Revert Tag Protocol (Phase 2 tasks)

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 CI job activation | `rag-pre-ci` | P2-A2 commit |
| Before legacy move to `_deprecated/` (G5, if applicable) | `rag-pre-delete` | P2-B2 commit |
| Before bug injection commit (G10) | `rag-pre-inject` | P2-D2 commit |

Create with: `git tag rag-pre-<name> HEAD` — NO `--force`, NO push.

---

## Notebook Write (override — AC-6 APPEND class)

The shared flow (`docs/agents/developer/flow/microservice-main.md` "End-of-cycle notebook
write") only points generically at `.claude/skills/notebook-write/SKILL.md` with
`<agent-id>` substitution — it carries no per-agent section template. `dev-rag-service` is
listed APPEND class in the notebook-write SKILL's AC-6 canonical table (not OVERWRITE), so
every cycle MUST open its own dated level-2 `## ` section:
```
## <YYYY-MM-DD>T<HH:MM>Z <task-slug or "cycle">
- Zone health: [metric/observation] | Files: [changed] | Tests: N pass | Notes: [summary]
```
**RETIRED (root cause of the recurring over-cap safe-fail on this notebook — same shape as
CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT, do not reproduce):**
`docs/agent-memory/notebooks/dev-rag-service.md` has in practice appended a dated
`### YYYY-MM-DD — <slug>` sub-heading under ONE permanent, undated `## Working Memory`
heading every cycle instead of opening a `## ` section per cycle. An undated heading sorts
to `notebook-auto-prune.sh`'s MAX sentinel key — permanently exempt from drop-oldest
selection yet still byte-counted, so `section_count` stayed pinned at 1 while the file kept
growing (confirmed live: flagged over-cap at 127L/23244B in code-janitor's own Notebook
Line-Cap Sweep, safe-fail `notebook_single_section_overage_breach` — no truncation, correct
hook behavior given the shape, not a hook defect). Every cycle forward opens its OWN `## `
section per the template above. Migrating existing history (`## Working Memory` + its
`### ` sub-blocks) to `docs/agent-memory/notebooks/archive/dev-rag-service-*.md` is separate,
tracked work — not done from this flow (see notebook-write SKILL AC-2a for the
archive-then-drop pattern).

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-charter.md` | **Binding** | Thin scale charter: key risks, Python lock, anti-scope boundary |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | **Binding** | Canonical G1–G12 goals + Security Clause + Decision Matrix |
| `docs/data/pilot-status-rag-service.json` | **Live SSOT** | Goal tracking — PO reads; dev-rag-service does not write |

---

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/rag-service/`. Agent definition: `.claude/agents/dev-rag-service.md`.
