<!-- size-justification: 87L — thin pointer + pilot enforcement content (Smoke Checks, G12 DoD gate, Security Clause, References); language fixed Python so no Language Mode table needed; schedule for split if pdf-extractor pilot reaches Phase 2 with additional per-task plans -->
# dev-pdf-extractor — Main (Pointer)

**Zone:** `apps/pdf-extractor/`
**Specialist for:** BCTC parsing, OCR, Vietnamese financial statement extraction (Python/FastAPI)

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `pdf-extractor`
- `<agent-id>` = `dev-pdf-extractor`
- zone restriction: only `apps/pdf-extractor/` files
- TDD: `pytest` (not bun test) — see microservice-main.md "TDD workflow — Python/FastAPI" section

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/pdf-extractor/`. See `docs/protocols/bctc-extraction-runbook.md`. Agent definition: `.claude/agents/dev-pdf-extractor.md`.

---

## Extraction Failure Debug Subroutine (run FIRST when investigating any BCTC extraction failure)

Before reading logs, before running tests, before any code change — fetch the eval for the failing report:
```
GET /api/bctc-eval/{report_id}   ← check schema_version field before parsing
```

Read `stages[*].gate_failures` for every stage. Each failing `gate_id` in `gate_failures_json` is a named detector gate; it becomes a **regression-set acceptance criterion** for the fix. List them explicitly in the task handoff before writing any code.

Example: if `stages[3].gate_failures = [{"gate_id": "value_blank_label_max", "threshold": 0, "actual": 44}]` → AC-1: `value_blank_label_max = 0` (zero blank-label rows) must pass after fix.

Status semantics: red = hard fail (at least one gate_id in gate_failures_json), yellow = soft warning only, green = all gates pass.

If `GET /api/bctc-eval/{report_id}` returns 404 or 409 (eval not yet computed) → proceed with log-based debug, note that structured eval is unavailable.

---

## Smoke Checks (Python — run before every commit)

| Check | Command |
|---|---|
| Unit tests | `cd apps/pdf-extractor && python -m pytest` |
| Type check | `cd apps/pdf-extractor && python -m mypy . --ignore-missing-imports` (if mypy configured) |
| Scenario JSON validity | `find docs/scenarios/pdf-extractor -name '*.json' -exec python -c "import json,sys; json.load(open(sys.argv[1]))" {} \; 2>&1` |
| Sandbox runner (primitive) | `cd apps/pdf-extractor && python sandbox_runner.py --tier=primitive --scenario=all` |
| Sandbox runner (module) | `cd apps/pdf-extractor && python sandbox_runner.py --tier=module --scenario=all` |

Sandbox runner path confirmed in brownfield inventory. Adapt command if architect specifies different entrypoint.

---

## Pilot Hard Rule (G12 — blocking)

### G12 DoD Gate (mandatory — blocking from Day 0)

**Do not RETURN or mark task DONE until the Python sandbox runner shows all pdf-extractor scenarios green for the touched tier.**

Run both tiers before declaring complete:

```bash
cd apps/pdf-extractor
python sandbox_runner.py --tier=primitive --scenario=all
python sandbox_runner.py --tier=module --scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `pdf-extractor` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md` §G12 (canonical: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12)

---

## Security Clause (§Security Clause — blocking)

**Sandbox process MUST have zero DB credentials and zero external API keys at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|VPS_|VINAHOST|PDF_EXTRACTOR_DB"
# Must return empty when running inside the sandbox process context
```

PDF extractor is explicitly named — it touches VPS + OCR + DB paths in production, but the sandbox runs scenario JSON only and MUST NOT have any VPS/OCR/DB credentials. If any credential appears in sandbox env, the task is blocked.

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md` | **PRIMARY** | Thin scale charter: service deltas, candidate primitives, key risks |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | **Canonical** | G1–G12 source of truth (language-agnostic) |
| `docs/data/pilot-status-pdf-extractor.json` | **Live SSOT** | Goal tracking — PO reads; dev-pdf-extractor does not write |
| `docs/protocols/bctc-extraction-runbook.md` | **Operational** | BCTC pipeline runbook; FREEZE coordination notes |
