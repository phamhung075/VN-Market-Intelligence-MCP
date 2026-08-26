# Architecture Brief — Behavioral-Verification Gate with Deploy-Aware Ordering

**Author:** agents-architect | **Date:** 2026-08-26T18:04:48Z | **Trigger:** direct user request (via router), verbatim: *"agent không thực sự làm việc, các agent chỉ thay đổi orch-state.json không tạo ra bất kì giá trị nào thực sự... phải có cơ chế kiểm thử để xem xét kết quả, dev team phải tập trung hơn vào việc phát triển... nếu agent không thực sự làm việc thì phải có cơ chế thay đổi."*

**Scope discipline:** this brief does NOT re-litigate the coordination-overhead numbers (router already measured them correctly: 114/1661 commits (6.9%) touch real code in 7d, 891/1661 (53.6%) are state/data-only, orch-state.json churns 64k/net-7k). Those numbers say the user's "zero value" is too strong but the signal-to-noise complaint is real. This brief designs ONE mechanism against the concrete, re-verified defect below, sized to the 6.9% population it actually applies to — not the other 93%.

---

## 1. The anchor case — independently re-verified, not trusted from router's first pass

- Row `FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL` (`docs/data/orch/archive/2026-08.json` `.done_tasks[458]`), commit `4b4bfea7a`. Re-verified: `git show -s --format=%cI 4b4bfea7a` = **2026-08-24T21:15:49+02:00 (19:15:49Z)**. Row's own `qa_verified_at` = **2026-08-24T19:53:57Z** (router cited `:58Z`, off by 1s — immaterial). `docker images` for `vn-market-intelligence-mcp-frontend` = **2026-08-24 22:06:57+02:00 CEST (20:06:57Z)**. **DONE_VERIFIED landed 13 minutes before the image that ships the fix existed.**
- qa's actual verification (`verification.raw_probe.tool`): `"git merge-base --is-ancestor + git show --numstat/diff + vitest run (targeted+full) + tsc --noEmit + grep DDD/security + mock-guard.sh"`. **Correction to router's framing:** this is not pure diff-reading — vitest and tsc actually ran. But both ran host-side, pre-rebuild, against source — never against the built frontend image a browser would load. The gap is precisely the one the ask names: verification that happens *before* a rebuild cannot observe what the rebuild changes.

## 2. Root cause — two live verification paths, only one is deploy-aware, and the dominant one isn't it

Re-derived from `docs/agents/qa/flow/main.md` + `docs/protocols/docker-deployment-runbook.md`, not assumed:

- **Close Gate** (`docker-deployment-runbook.md` § Microservice Code-Change Close Gate, Steps 1–6): ops rebuilds → SHA-gates → **qa Step 5 explicitly says "verify liveness + key behaviour matches the new code, not a pre-build snapshot."** This step already exists, is already assigned, and is already deploy-aware by construction. Confirmed alive: `git log --grep="close-gate" -i` shows real recent runs (`37a03065d`, `c7d88ac60`, 2026-08-15/earlier).
- **Direct-Commit Verify** (`qa/flow/main.md` § "Direct-Commit Verify (dev-team Review-Lane QA-Drain rows, `branch:null`)", added 2026-07-22 to unblock a staging deadlock): diff + host-side test run, **no rebuild step, no Step-5 equivalent**. Explicitly documented as the path for rows that arrive `branch:null` — "every one of its 32 live source rows" per the file's own size-justification header. The anchor case (`branch:null`, `claimed_by: dev-team (review-lane qa-drain)`) went through this path. **This is the dominant path for the fleet's actual FIX-* code delivery, and it is the one with no deploy-aware check at all.** The defect is not "qa skipped a gate" — qa followed its flow correctly. The flow has a hole.

## 3. A second, corroborating dead mechanism — do not build on it

`docker-deployment-runbook.md` Step 4 calls `scripts/verify-deploy-sha.sh <svc>` "the authoritative deploy-complete check," gated on the `vn.market.git_sha` Docker label. **Live-probed this cycle, 2026-08-26**, `docker inspect` on all 11 running services: **9/11 report the literal string `"unknown"`** (mcp-server, frontend, kinh-dich-service, pdf-extractor, alert-engine, rag-service, stock-price, macro-indicators, technical-analysis); only news-fetch and api-gateway carry a real SHA. `docker-compose.yml` has **zero** occurrences of `GIT_SHA` — never wired as a build-arg. This exact defect is already tracked, unpicked: `FIX-FLEET-DEPLOYED-VS-MAIN-UNANSWERABLE-GIT-SHA-BUILD-ARG-IS-OMITTABLE` (P1, backlog), `OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL` (P2, backlog), `FIX-PDFX-DOCKERFILE-DEPLOY-SHA-LABEL-KEY-MISMATCH` (P2, backlog). **Not re-minted here — out of scope, do not duplicate.** But it means: any new mechanism that keys "is this commit in the running image" off the SHA label would be built on a substrate that is dead on 9/11 services right now. This design deliberately does not depend on it (§4).

## 4. A third, corroborating dead mechanism — the fleet's own designated answer to this exact ask has never run

`orch-sentinel` OH-2 ("Behavioral-Verification Coverage Map") is the mechanism the fleet already commissioned to answer "does anything verify agents work correctly." Re-verified live: `docs/data/orch-sentinel-scorecard.md` is frozen at **2026-07-22T00:17:57Z, Mode: LITE** — OH-2.1/2.2/2.3 read `"(pending first FULL run)"` literally, still, today (5+ weeks). `.claude/commands/crons/cron-orch-sentinel.md`: *"Neither cron is armed yet."* `git log --all --grep="orch-sentinel"` confirms this was already independently found and triaged 2026-08-22 (`910c2e9f8`, po notebook): `FIX-ORCH-SENTINEL-OH4-CRONS-NEVER-ARMED-DEAD-OBSERVABILITY-MECHANISM` (P2, backlog, `depends_on: CWO-T4-P0-TUSTATS-PERAGENT`, itself P3 backlog, both still unpicked). **Not re-minted here.** But it means: I cannot design "extend OH-2" to mean "add a check that only runs when the FULL cron fires" — that cron has fired zero times since creation. §5 below routes around this the same way §3 routes around the SHA label: reuse only the part of the substrate that is independently confirmed alive.

## 5. Design — Behavioral-Predicate Gate (deploy-aware, sampled, role-separated)

### 5a. Predicate format — declared at mint, before work starts

One new optional field on the task row, `verification.behavior_predicate`, populated by PO/BA **at mint time**, only for rows where `zone` starts with `apps/` (the only zones that ship inside a rebuilt Docker image — `scripts/`/`docs/` changes run live off the repo and have no build step to wait on):

```json
"behavior_predicate": {
  "declared_at": "2026-08-23T07:47:20Z",
  "declared_by": "po",
  "cmd": "curl -s http://localhost:3001/dashboard/orchestration | grep -c 'Không theo dõi'",
  "expect": ">=1"
}
```
Cheap by construction: one shell one-liner + an expected value, same authoring effort as one of the free-text AC bullets PO/BA already write (it replaces one, see §7.1) — not a new writing task. Not satisfiable by narration: it is a command with a captured raw result, not a sentence.

### 5b. Execution — deploy-aware, ridden on an already-mandatory step, owned by a different role than the author

Extend `docs/agents/ops/flow/docker.md` § Post-Rebuild Health Verification (already mandatory, already runs on **every** rebuild regardless of trigger) with one additional loop, positioned after Deploy-Evidence Capture, before the mandatory builder-prune:

1. For the just-rebuilt `<svc>`, find `done_verified[]` + this-month's archive rows where `zone` maps to `<svc>` and `verification.behavior_predicate` is present and `verification.behavior_probe` is absent.
2. Ordering check — **do not use the SHA label (§3, dead)**. Reuse the timestamp discipline the Deploy-Evidence Capture step already performs (`date -u` + `docker inspect --format '{{.State.StartedAt}}'`, live since 2026-08-05): confirm image `Created`/container `StartedAt` postdates the row's commit timestamp (`git show -s --format=%cI <commit>`). If not yet postdated, skip — the commit isn't in this build.
3. Run the predicate `cmd` against the now-healthy service, capture raw stdout verbatim (same "paste literal raw output, never a narrated conclusion" discipline the Deploy-Evidence Capture step already enforces).
4. Write `verification.behavior_probe{tool, args, live_value_observed, observed_at, observed_by:"ops", match:<bool>}` via `jq | scripts/orch-apply.sh` — reuses the existing `RawProbeSchema` shape verbatim (already `.passthrough()` on `VerificationSchema`, so this is schema-legal today with zero code change; agent-father may formalize a named sub-schema as a follow-up, not a blocker).
5. On `match:false` — do not silently continue: move the row `done_verified[]`/archive → `review[]` via the same `orch-apply.sh` mechanism ops already uses for Step 4b handoff, `send_telegram(channel="bug", ...)`. **This is the actual teeth**: DONE_VERIFIED becomes provisional, mechanically revocable by a later deploy-time observation — not a terminal, unfalsifiable claim.

This closes §2's gap for **both** verification paths at once, without adding either path's own latency: Close Gate's Step 5 ("verify key behaviour") stops being unstructured prose and gets the same machine-checked predicate; Direct-Commit Verify keeps its current speed (still unblocks QA-Drain immediately) because the check happens later, once, in a place that already runs unconditionally — not inserted into qa's per-row critical path.

### 5c. Gate change — the one new hard-reject, scoped narrowly

`checkVerificationGate()` in `orchStateSchema.ts` gains one new condition, mirroring the existing `hasValidRawProbe`/`hasHonestGapReason` pattern: if `status == "DONE_VERIFIED"` AND `zone` starts with `apps/` AND `priority` ∈ {P0,P1} AND `verification.behavior_predicate` is absent → reject, same as today's missing-`raw_probe` rejection. This is the literal enforcement of "a row may not reach DONE_VERIFIED on diff-reading alone" for the population where it matters — scoped to P0/P1 `apps/` rows only, not fleet-wide.

## 6. Metric — extends OH-2, does not duplicate it (per the ask's explicit instruction)

`docs/data/orch-sentinel-scorecard.md` §OH-2 answers "does anything verify policy/architecture/tools/file-location per agent" (4 belief axes, `dim-oh2-verification-coverage.md` OH-2.1–2.3). None of those axes is "does the shipped product behave as declared" — that is a genuinely missing 5th axis, not a duplicate of the existing 4.

**New check OH-2.4 — Behavioral-Predicate Coverage & Pass Rate**, added to `dim-oh2-verification-coverage.md`. Scans `done_verified[]` + trailing-7d archive slice for `zone` matching `apps/*`. Three ratios, each with a real denominator, each comparable week over week:

- `declared/code_rows` — mint-time honesty: of P0/P1 `apps/` DONE_VERIFIED rows, how many carry `behavior_predicate`.
- `executed/declared` — deploy-aware follow-through: how many have `behavior_probe.observed_at` populated. **This is the ratio that would have flagged the anchor case** — it can only reach 100% after the next rebuild that covers the row, so a persistently low value after >1 elapsed rebuild cycle for that service is itself the signal (MED at <50% after one elapsed cycle, HIGH after two).
- `passed/executed` — actual correctness: of executed probes, how many `match:true`.

**Cadence — do NOT gate this on the dead FULL-only weekly cron (§4).** OH-2.4 is a pure jq numeric scan over `task_board`/archive fields — no doc-parsing judgment, same shape as OH-1's checks. Promote it to **FULL + LITE** in `docs/agents/orch-sentinel/flow/main.md` § Mode Dispatch, joining OH-1 as the fastest-moving dimension, so it gets real data from the cron that is actually armed and running daily, independent of whether `FIX-ORCH-SENTINEL-OH4-CRONS-NEVER-ARMED-DEAD-OBSERVABILITY-MECHANISM` (§4, someone else's already-tracked P2, blocked on its own P3 dependency) ever lands.

## 7. Remediation ladder — mechanical, reuses the existing counter pattern, PO stays the decision-gate

No new infrastructure — the "N consecutive runs" counter technique already lives in `<!-- OH-STATE: {json} -->` for OH-2.2/OH-4.2/OH-4.3. Add `oh2_4_owner_fail_streak: {<owner_agent>: N}`:

- **Rung 0 (single failure):** `behavior_probe.match:false` → row demoted to `review[]` (§5b step 5) + one signal_queue row to `po` (LOW), informational.
- **Rung 1 (≥3 failures, same `owner` field, rolling 20-row/30d window):** OH-2.4 fires a signal_queue row to `agent-father` (MED): "review flow doc/prompt for `<owner>` — N behavior-predicate failures in window, rows: [...]." Mechanical trigger, no judgment call — same threshold shape already live for D-FLEET pilot graduation and OH-4.3's zero-streak.
- **Rung 2 (a 2nd Rung-1 escalation for the same owner within 60d, fail streak not reduced):** signal_queue row to `po` (HIGH) with an explicit, unresolved decision menu — tool-grant reduction, mandatory second-review pairing, or retirement-review of that agent identity. PO decides; this design does not auto-retire anything, matching the fleet's existing PO-gated culture (same posture as D-FLEET graduation requiring "a recorded decision either way").

## 8. What this design removes or replaces — not just adds

1. **Replaces qa's free-text AC re-derivation** for the specific behavior-outcome AC on P0/P1 `apps/` rows: today qa writes a paragraph reasoning a behavioral AC from a diff (see the anchor case's own `status_note`, ~400+ chars for AC-1..AC-7 combined). Once `behavior_probe` exists, that AC is closed by citing the probe result — one paragraph of prose deleted per predicate-covered row going forward, not added.
2. **Replaces Close Gate Step 5's unstructured prose** ("verify... key behaviour matches new code") — today unenforceable and, per §2, not even reached by the dominant delivery path — with the same machine-checked predicate reused across both paths, instead of two separately-maintained, partially-dead verification stories.
3. **Zero new scheduled cycles.** Rides two mechanisms that already run unconditionally: ops's Post-Rebuild Health Verification (fires on every rebuild today, regardless) and orch-sentinel's LITE cron (fires daily today, regardless). No new cron, no new agent, no new mandatory step on every dev-team tick or every commit — the 93% of commits that touch no `apps/` code are completely untouched by this design.
4. **Explicitly does not wait for two already-dead substrates to be fixed first** (§3 SHA label, §4 FULL cron) — both are the "predicate so heavy nobody runs it" trap named in the ask; this design routes around both rather than depending on either landing.
5. **Mint-time cost is a swap, not an addition** — `behavior_predicate:{cmd,expect}` replaces one free-text AC bullet PO/BA already author, for the ~6.9%-of-commits population (`apps/` P0/P1 rows) where it applies. The other 93% of commits (state/docs/memory-only, per router's own measurement) carry zero new field, zero new check, zero new latency.

## 9. Implementation handoff (agent-father)

| File | Change | Actor at runtime |
|---|---|---|
| `apps/mcp-server/src/infrastructure/orchStateSchema.ts` | `checkVerificationGate()`: new conditional per §5c (mirror `hasValidRawProbe` pattern). Optional: name `BehaviorPredicateSchema`/`BehaviorProbeSchema` under `VerificationSchema` for typed clarity (schema-legal today via `.passthrough()` either way). | schema, compile-time |
| `docs/agents/qa/flow/main.md` § Direct-Commit Verify | +1 conditional: P0/P1 `apps/` rows require `behavior_predicate` present before flip; if absent, `CHANGES_REQUESTED` citing missing mint-time predicate (pushes to PO/BA at next mint, not a new qa burden). | qa |
| `docs/agents/po/flow/*` (mint/triage step) + `ba` mint template | +1 optional field `behavior_predicate:{cmd,expect}` at mint, P0/P1 `apps/` rows only. | po / ba |
| `docs/agents/ops/flow/docker.md` § Post-Rebuild Health Verification | +1 loop per §5b (timestamp-gated, not SHA-label-gated), between Deploy-Evidence Capture and mandatory builder-prune. | ops |
| `docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md` | +OH-2.4 per §6. | orch-sentinel |
| `docs/agents/orch-sentinel/flow/main.md` § Mode Dispatch | Promote OH-2.4 to FULL+LITE (join OH-1). | orch-sentinel |
| `docs/agent-memory/modules/tool-usage-stats.json` OH-STATE | +`oh2_4_owner_fail_streak` counter per §7. | orch-sentinel (self-referential diff, same technique as OH-4.3) |

**Explicitly not touched, not re-minted (dedup discipline honored):** `FIX-FLEET-DEPLOYED-VS-MAIN-UNANSWERABLE-GIT-SHA-BUILD-ARG-IS-OMITTABLE`, `OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL`, `FIX-PDFX-DOCKERFILE-DEPLOY-SHA-LABEL-KEY-MISMATCH`, `FIX-ORCH-SENTINEL-OH4-CRONS-NEVER-ARMED-DEAD-OBSERVABILITY-MECHANISM`, `CWO-T4-P0-TUSTATS-PERAGENT` — all already tracked, all in `backlog[]`, none are prerequisites for this design (§3, §4 explain why each was deliberately routed around rather than depended on).

## 10. Irony-test self-check

This brief adds text but the *mechanism* it specifies removes more than it adds where it matters (§8): fewer qa prose paragraphs per predicate-covered row, no new cron, no new agent, no new step on the 93% of commits that don't touch `apps/`, and it deliberately does not spend effort re-fixing two already-tracked dead substrates. The measurable output is the OH-2.4 ratio itself — falsifiable next Sunday/next LITE run, not this brief's word count.
