# Decision Journal — Sprint FACTORY-TECHANALYSIS-dedup-calculator · dev-technical-analysis

**Sprint goal:** Dedup `sandboxCalculator.Calculate` vs `infrastructure.TACalculator.Calculate`
via a shared `pkg/module` mapper; fix the MA5/MA20/MA50 drift where sandbox omitted them.
**Agent:** dev-technical-analysis
**Started:** 2026-07-29T01:50:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-07-29T01:52:00Z
**task-id:** FACTORY-TECHANALYSIS-dedup-calculator
**what-done:** Re-read both live implementations (line numbers had drifted
from the audit's 374-402 estimate, per the task's own caveat — `cmd/sandbox`
was already split into ~29 files by `FACTORY-TECHANALYSIS-split-sandbox`;
`sandboxCalculator.Calculate` now lives in `cmd/sandbox/service_adapters.go`
L23-51). Confirmed the drift is real and exactly as described:
`sandboxCalculator.Calculate` builds `domain.TechnicalIndicators` without
`MA5`/`MA20`/`MA50` fields; `infrastructure.TACalculator.Calculate` sets all
three from `module.Compute`'s `Result.MA5/MA20/MA50`. Verified the fence
rule live in `.golangci.yml`: Fence-B (`pkg/module/**`) denies only
`module -> application` and `module -> interface`; `module -> domain` is
unrestricted, and domain has zero imports of module (grep-confirmed) — no
cycle risk. `sandbox` already imports `pkg/module` directly (no
`pkg/infrastructure` import, Fence-C respected) so a new `module -> domain`
edge inside `pkg/module` itself does not change sandbox's own fence
standing.
**what-considered:** only path — task spec's proposed mapper location
(`pkg/module`) is the only layer both callers can reach without violating a
fence (`pkg/infrastructure` is Fence-C-restricted to `cmd/server/main.go`
only, so the mapper cannot live there).
**why-decision:** Matches the audit's own read; verified against live
`.golangci.yml` rather than trusting the audit's prose.
**why-change:** No change from plan.

---

### STEP dev-technical-analysis-S2 · dev-technical-analysis · 2026-07-29T01:52:40Z
**task-id:** FACTORY-TECHANALYSIS-dedup-calculator
**what-done:** TDD: baseline-captured `TACalculator.Calculate` output
(5 representative close-series: 100-ramp period=14, 100-ramp period=0/
defaults, 38-ramp period=14 [MA5/20 populated, MA50 N/A], 60-osc period=14
[MACD cross-signals present], 5-short period=14 [everything N/A but no
error]) to `ta-calculator-before.json` via a temporary
`pkg/infrastructure/zz_baseline_capture_test.go` (deleted before commit,
never staged). Wrote `pkg/module/mapper_test.go` calling
`module.ToDomainIndicators` — confirmed RED (`undefined:
module.ToDomainIndicators`, build failure). Implemented
`pkg/module/mapper.go::ToDomainIndicators(res Result)
*domain.TechnicalIndicators` — the exact same field-by-field mapping
(including the `CrossEvent -> domain.CrossSignal` loop) both callers used to
carry independently. Confirmed GREEN.
**what-considered:** only path — mapper signature takes `Result` by value
(matches `module.Compute`'s return type, no pointer needed, `Result` is a
small value-type struct of slices).
**why-decision:** N/A (mechanical extraction, exact behavior preserved).
**why-change:** No change from plan.

---

### STEP dev-technical-analysis-S3 · dev-technical-analysis · 2026-07-29T01:53:10Z
**task-id:** FACTORY-TECHANALYSIS-dedup-calculator
**what-done:** Rewired both callers to `module.Compute` then
`module.ToDomainIndicators(res)`. Re-captured `TACalculator.Calculate`
output to `ta-calculator-after.json`, `diff`'d against the before capture —
byte-identical (0 diff lines). `go build ./...`, `go vet ./...`,
`golangci-lint run ./...` (0 issues — confirms the new `module -> domain`
import edge does not trip Fence-B/C), full `go test ./...` (12 packages,
all green, including the new mapper tests and the pre-existing 8 module/
infra/sandbox suites). `bash dashboard/build.sh` — G12 gate: 35/35
scenarios green, headless render-check PASS. Grepped `docs/scenarios/
technical-analysis/service/*.json` and `cmd/sandbox/service_diffs.go` for
any MA5/MA20/MA50 assertion field before concluding no fixture update was
needed — none exists (`applyServiceDiffs` only checks rsi/macdLine/
bollingerUpper/sma/ema "populated" flags + volatility null-fields), so the
now-populated MA5/20/50 in sandbox output does not change any scenario
verdict; `sandbox_test.go` has zero references to `sandboxCalculator` or
MA5/20/50 either — no test-file edits required.
**what-considered:**
- Update scenario JSON to assert MA5/20/50 populated (would exercise the
  fixed drift explicitly) — considered but not required by the DoD text
  ("update sandbox test expectations/golden outputs accordingly" — there
  are none referencing these fields to update); adding new assertions is
  scope creep beyond "dedup + fix drift", deferred.
- Ship as-is since no existing fixture/test regresses and the mapper's own
  new unit test (`TestToDomainIndicators`) already asserts MA5/20/50 are
  populated and byte-match `Compute`'s `Result`. Chosen.
**why-decision:** DoD's actual gate is behavior-preservation for the real
service (proved byte-identical) + drift-fix for sandbox (proved via the new
mapper unit test + the G12 all-green run, which exercises sandbox's full
HTTP path end-to-end including the now-populated MAs, even though no
scenario JSON happens to assert on them). Inventing new scenario assertions
that were never part of this task's stated files-to-modify would be adding
undirected scope.
**why-change:** No change from plan; DoD's "update sandbox test
expectations/golden outputs" clause turned out to have zero live targets
(verified, not assumed).

---

### STEP dev-technical-analysis-S4 · dev-technical-analysis · 2026-07-29T01:53:40Z
**task-id:** FACTORY-TECHANALYSIS-dedup-calculator
**what-done:** Verified live whether `cmd/sandbox` output ships anywhere.
`Dockerfile` does `COPY cmd/ cmd/` (source only, all of `cmd/`) but only
builds `go build -o /out/server ./cmd/server/`, and the final `alpine`
stage only `COPY --from=builder /out/server /app/server` — `cmd/sandbox` is
never compiled into any built artifact, matching the
`FACTORY-TECHANALYSIS-split-sandbox` precedent's own finding. Only
`pkg/infrastructure/calculator.go` is on `cmd/server`'s build graph, so only
that file triggers `rebuild_required: true`. No MCP tool grant on this
agent session (Read/Edit/Write/Glob/Grep/Bash only per router dispatch) —
commit-mutex/task_claim/task_release skipped, committing directly with
explicit pathspecs, same precedent as `FACTORY-COWORK-SPAWNFANOUT` /
`FACTORY-PDF-split-handlers`. Holding row at REVIEW (not self-flipping to
DONE/DONE_VERIFIED) per Docker Microservice Code-Change Close Gate
(`docs/protocols/docker-deployment-runbook.md`) — `next_agent: "ops"` for
gated rebuild+swap, then `qa` for live-endpoint verify, then `po` Step 6
sign-off, exact chain the sibling `FACTORY-PDF-split-handlers` row used.
**what-considered:** only path — Docker close-gate is standing,
non-negotiable policy for a file on the shipped service's build graph;
router prompt explicitly directed this chain.
**why-decision:** N/A (policy compliance).
**why-change:** No change from plan.

---

## Files touched

**NEW:**
- `apps/technical-analysis/pkg/module/mapper.go` — `ToDomainIndicators`
- `apps/technical-analysis/pkg/module/mapper_test.go`

**MODIFIED:**
- `apps/technical-analysis/pkg/infrastructure/calculator.go` — `Calculate`
  now delegates to `module.ToDomainIndicators`; output byte-identical
  before/after (JSON-diff verified, 5 representative inputs).
- `apps/technical-analysis/cmd/sandbox/service_adapters.go` —
  `sandboxCalculator.Calculate` now delegates to the same mapper; MA5/MA20/
  MA50 now populated (previously omitted — the drift this task fixes).
- `docs/architecture/microservice/technical-analysis/infrastructure.md`,
  `docs/architecture/microservice/technical-analysis/testing.md` — doc-review
  updates describing the shared mapper and the fence-edge rationale.

**Not touched:** no scenario JSON / `sandbox_test.go` changes — grep-verified
no existing fixture asserts on MA5/MA20/MA50, so none needed updating (see
S3).

## Rebuild status
`pkg/infrastructure/calculator.go` is on `cmd/server`'s build graph →
`rebuild_required: true`. Holding at REVIEW, `next_agent: "ops"` per Docker
Microservice Code-Change Close Gate — `cmd/sandbox` confirmed not shipped
(Dockerfile never builds or copies it), so no additional ops hop needed for
the sandbox side.
