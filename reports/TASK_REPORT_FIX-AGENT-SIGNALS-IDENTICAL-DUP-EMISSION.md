## Task Report FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION

**Mode:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`, row lived in `qa[]` with `commit` present; entered `qa` lane by ops post-rebuild)
**Fix commit:** `5f2e747190c13fffd74f589f2615e7f6761a7cec`
**Deployed image:** `sha256:8966b3b867fa4947852838056c087e48b2fe1783ba7ae08a34174c692cd0f721`, container `83847b9f6b85`

changed: `apps/mcp-server/src/domain/services/alertDedup.ts` (+41L, `computeGenericAlertFingerprint`), `apps/mcp-server/src/domain/services/alertGenerator.ts` (+18L/-4L, unconditional fingerprint wiring), `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` (+60L/-22L, `INSERT OR IGNORE` on all 10 `postSignal()` variants + `resolveInsertId()`), `apps/mcp-server/src/infrastructure/db/schema-news.ts` (+44L, partial `UNIQUE INDEX idx_agent_signals_dedup_identical`), plus test/docs/audit-script files

tests: `bun test` FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION.test.ts 10/10 pass + sibling alert-dedup suite (064-alert-generator, 1378-composite-alert-dedup, 1115-news-alert-dedup, FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK) 34/34 pass | `bun tsc --noEmit`: 0 errors | DDD: PASS (no domain→infra/application imports beyond a doc-comment mention) | security: PASS (no `process.env`, no secrets/token grep hits) | mock-guard: PASS

verdict: **APPROVED — DONE_VERIFIED**

### Verification detail

1. **Ancestry + scope match:** `git merge-base --is-ancestor 5f2e747190c1... main` → true. `git show --stat` touches exactly the 9 non-memory files claimed in `files[]`.
2. **Deploy evidence RAW-confirmed (not trusted from board prose):** `docker inspect 83847b9f6b85` — `Image=sha256:8966b3b8...`, `StartedAt=2026-08-08T19:06:16.05Z`, `RestartCount=0`, `Health=healthy` — byte-identical to ops's claimed evidence. `/health` → `toolCount=183` matches.
3. **Task's own QA gate — 2 FRESH `check-agent-signals-dup.ts` cycles with REAL new writes in between (not a static re-read of ops's single snapshot):**
   - Cycle 1 (`docker exec` against the live named-volume DB): `total=117, all-time dup-groups=0, active-24h dup-groups=0` — matches ops's post-deploy audit exactly.
   - **Live dedup-path probe** (exercises the actual deployed `postSignal()` code via `docker exec bun`, same file the fix touched): called `postSignal()` 3× — (1) fresh signal → new row id; (2) **byte-identical re-entrant duplicate, same minute** → returned `-1` (suppressed, confirmed via row-count: 0 new rows for this call); (3) genuinely different payload → new row id (confirmed NOT over-suppressed). Row count moved 117→119 (exactly 2 real inserts despite 3 calls).
   - Cycle 2 (after the live writes): `total=119, all-time dup-groups=0, active-24h dup-groups=0`.
   - Probe rows cleaned up post-verify (`DELETE ... WHERE from_agent='qa-dedup-verify'`, required `PRAGMA busy_timeout=5000` after one `SQLITE_BUSY` — DEFLAKE-VNSTOCK-3STATEMENT class); final recount `117/0`.
4. **alertGenerator.ts fingerprint fix spot-checked directly against scanMarket.ts re-entrancy (code diff read, not prose):** `fingerprint` is now set **unconditionally** on every `Alert` object via `computeGenericAlertFingerprint(actionCode, signalTypes, message, detectedAt)` — this function is pure and content-derived (minute-bucket of `detectedAt` + sorted signal types + message prefix), with **zero dependency** on `chooseAlertId()`'s random `generateId()` fallback (`id` stays random for the "otherwise" branch; only `fingerprint` changed). `alerts.fingerprint` carries a partial `UNIQUE INDEX ... WHERE fingerprint IS NOT NULL` (schema-alerts.ts) — confirms the pre-fix root cause: the "otherwise" branch left `fingerprint` `undefined`→`NULL`, structurally bypassing this UNIQUE gate entirely for `scanMarket()`'s re-entrant `generateAlerts()` calls. No post-deploy `alerts` rows existed yet to observe live (0 alerts fired in the ~10min since deploy) — verdict rests on the direct code-level confirmation, which is unambiguous and doesn't require waiting for a live re-entrant fire.
5. Re-ran REAL, not trusted from dev's/ops's prose: targeted + sibling test suites (34/34 + 10/10), `tsc --noEmit` (0 errors), `mock-guard.sh` (PASS), DDD grep (clean), secret/`process.env` grep (clean).

No blocking issues found.

### Board write
`.task_board.qa[] → .task_board.done_verified[]`, `status: QA → DONE_VERIFIED`. Row carries a real `verification.raw_probe` (RC-VERIF gate, non-grandfathered id): `tool: check-agent-signals-dup.ts + live postSignal() dedup probe`, `live_value_observed`: both fresh-cycle counts + probe suppression proof, `observed_at: 2026-08-08T19:19:07Z`. Applied via `jq` + `scripts/orch-apply.sh` (Stage0+1 PASS, conservation OK: `task_total 753→753`, `signal_total 31→31`, `signal_row_identity=clean`). Verification text appended to the row's own `status_note` field (no handoff file — direct-commit verify path).

DJ: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-14.md` §qa-S20.
