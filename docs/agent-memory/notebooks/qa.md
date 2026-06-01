# QA — Notebook

## Archive (cycles ≤159)

Full detail available via `git log docs/agent-memory/notebooks/qa.md`.
Key milestones: cycle-159 BCTC-TRUST-RED APPROVED | cycle-157 AIT-QA APPROVED | cycle-156 HC-QA-3 APPROVED | cycle-153 AR-QA bake-off APPROVED.

---

**Binding:** Active cycle only (≤200L). Historical detail in git log.

---

## cycle-178 · 2026-06-02 · T6-QA-GATE — VPS-DEPLOY-PLACEHOLDER-GUARD — FAIL (AC-6 blocked)

Sprint: VPS-DEPLOY-PLACEHOLDER-GUARD | Task: T6-QA-GATE | Verdict: FAIL | Report: reports/TASK_REPORT_VPS-DEP-T6-QA-GATE.md

ACs verified raw (7/8 PASS, 1 FAIL):
AC-1 PASS: GUARD-1 pre-SCP fires non-zero on `__API_KEY__` injection; clean render exits 0. Real placeholders caught: `__MCP_BASE__`, `__API_KEY__`, `__TE_API_KEY__`. Post-deploy SSH verify (uppercase-only `__[A-Z][A-Z0-9_]*__`) does NOT flag Python `__name__`/`__main__`. Pre-SCP guards retain mixed-case (intentional: shell scripts only, no Python dunders in render path).
AC-2 PASS: Deploy script pre-SCP guard confirmed before any $SCP in all 8 render blocks.
AC-3 PASS: Live VPS injection `# __INJECTED_TEST__` → grep -rl detects /root/fetch-prices.sh → cleaned immediately.
AC-4 PASS: `__TE_API_KEY__` sentinel at vps-scripts/fetch-tradingeconomics.sh L15 intact; empty-string expansion test passes GUARD-1.
AC-5 PASS: deploy-vps-proxy.sh absent from git HEAD (git ls-tree + filesystem both clean).
AC-6 FAIL: `.env` L10 comment-tombstone `# Vultr decommissioned 2026-04-13 — VULTR_IP / VULTR_USERNAME / VULTR_PASSWORD removed. Do not restore.` — literal `grep "VULTR_IP" .env` returns FOUND (exit 0). No active VULTR variable but AC criterion requires exit 1. Fix: remove the comment line from .env.
AC-7 PASS: article-body-fetcher.py (-rwxr-xr-x 9365 bytes) + beautifulsoup4 4.14.3 confirmed live on VPS.
AC-8 PASS: All 9 services active (systemctl is-active ×9); proxy HTTP 200; 5 service logs show successful push entries; no permanent http=000.

Blocker: 1-line fix in .env (remove comment). Sprint NOT closeable until AC-6 resolved. Escalate to dev-vps-crawls.

---

## cycle-176 · 2026-06-01 · PLACEHOLDER-GUARD-QA — VPS-DEPLOY-PLACEHOLDER-GUARD — APPROVED

Sprint: VPS-DEPLOY-PLACEHOLDER-GUARD | Task: PLACEHOLDER-GUARD-QA | Verdict: APPROVED (LOCAL GATE)
Commit: 96446b5d (impl) | Report: reports/TASK_REPORT_VPS-DEPLOY-PLACEHOLDER-GUARD-QA.md
Files: scripts/deploy-vps-proxy.sh, 6 vps-scripts, article-body-fetcher.py

C1 bash-n: 7 scripts + py_compile — all exit 0. C2 deliberate-violation: partial-sub (MCP_BASE only, API_KEY left) → GUARD-1 fires non-zero before any scp — CONFIRMED. C3 clean-render: 5 deployer-managed scripts CLEAN; fetch-tradingeconomics.sh annotated (L15 __TE_API_KEY__ sentinel not subbed by deploy-vps-proxy.sh — tradingeconomics NOT in that deployer's scope; deploy-vinahost.sh subs it; VULTR post-deploy guard unaffected). C4 marker-rename: __HTTP__/__heartbeat__ fully absent, _HTTP_/_heartbeat_ consistent across all producers+consumers. C5 env-unset: all __MCP_BASE__/__API_KEY__ only inside ${VAR:-...} defaults — design holds. C6 GUARD-3: py_compile exit 0, deploy block present (scp+chmod+x+pip3 install idempotent).

Next: ops — VPS-BS4-INSTALL one-off + full redeploy via deploy-vps-proxy.sh + post-deploy verify CLEAN + 14-feed ×2 cycles.

---

## cycle-175 · 2026-06-01 · CAFEF-VNECO-QA — VPS-NEWS-CAFEF-VNECO — APPROVED

Sprint: VPS-NEWS-CAFEF-VNECO | Task: CAFEF-VNECO-QA | Verdict: APPROVED
Commits: 814088b0 (P1+P2 code), 91bdb305 (TASKS handoff)
Files: vps-scripts/fetch-vn-news.sh, vps-proxy-server.js, article-body-fetcher.py

P1 — is_blocked() fix: bare grep -qi "robot" on RSS body → anchored CF challenge-page patterns only (just a moment..., checking your browser, cf-browser-verification, _cf_chl_, captcha-in-title). Static analysis PASS: old false-positive path gone, real CF IUAM/managed-challenge detection preserved. bash -n syntax: 0 errors. LOG_ROTATE_BYTES fix correct (default-first, conditional-override, quoted comparison). AC-1 dev live evidence: cafef 0→20+20 items 2026-06-01T08:58Z cycle. QA recommends ops spot-check ≥2 cycles in /var/log/vn-news-fetch.log (QA lane has no VPS SSH).

P2 — /proxy/article-body: spawn array (no shell interp, no shell=True), HTTPS enforced at server layer before spawn, X-API-Key auth required, domain whitelist bypass-proof (userinfo@/subdomain/http/encoded all rejected via Node.js URL + Python urlparse), Set(cafef.vn, vneconomy.vn) exact match. google.com → 400 confirmed by code logic. body_text cap: 8000ch (BeautifulSoup path, intentional) / 5000ch regex-fallback (also intentional). Ops: verify pip3 show beautifulsoup4 on VPS.

VPS-SOCAT-PERSIST http=000 confirmed pre-existing (not this sprint).
Report: reports/TASK_REPORT_CAFEF-VNECO-QA.md

---

## cycle-174 · 2026-05-31 · BANK-QA-3 — BANK-AWARE-BCTC — APPROVED

**Sprint:** BANK-AWARE-BCTC | **Task:** BANK-QA-3 | **Verdict:** APPROVED

```
date: 2026-05-31T~20:30Z
method: bun tsc + bun test (targeted + full suite batched)
commit: 941bf552 (BANK-DEV-4 hybrid discriminator)

TSC: 0 errors

TARGETED TESTS (sprint scope):
  BANK-AWARE-1 (DV-BANK-7 + 5 consumer tests): 29/0 PASS
  FU-6f-eval-blob-blockers: 8/0 PASS (DV-FU6F-B1-3 GREEN — was RED in QA-2)
  FU-6e-not-applicable-clear: 6/0 PASS
  240-bctc-full: 5/0 PASS
  Sprint total: 48/0 PASS

FULL SUITE (954 runnable files; 3 LanceDB excluded — Bun crash, pre-existing):
  10662 pass / 135 fail
  All 135 failures pre-existing: 089-tool-macro, 1414-diacritics, 1423-carry, 1570b-yield-spread
  Zero BANK-AWARE-BCTC regressions.

TRUTH TABLE SEEDS:
  ACB [A,B,I,I.1,XIII,01,null] → true (BANK) PASS
  FPT [100,270,411a,420a,420b] → false (CORPORATE) PASS
  income-only [10,60] → false (CORPORATE) PASS

DV-FU6F-B1-3 ROOT CAUSE CONFIRMED:
  BANK-DEV-2 3-digit-absence: ["10","60"] no 3-digit → isBankFormFromRows=true → bank anchors →
  2/2=1.0 → NOT red. Now: ROMAN_SECTION("10")=false → hasRomanOrSection=false → corporate →
  gross_profit null → 2/3<0.9 → RED. Correct.

CONSUMER INTEGRITY: 2 files changed (bctcFormType + test). Zero call-site signature changes.
C-6 computeBctcEval: corporate gross_profit still in goldenAnchors — confirmed via DV-BANK-5+DV-FU6F-B1-3.
DDD: PASS | Security: PASS

OUT-OF-SCOPE: BCTC-CODE-COLUMN-HYGIENE (label leaks to code col). Hybrid immune. Future task.
VCB PENDING/0rows: pre-existing.
```

REPORT: reports/TASK_REPORT_BANK-QA-3.md

---

## cycle-177 · 2026-06-01 · PROSE-TEXT-LOSS — Task #18 — APPROVED

Sprint: PROSE-TEXT-LOSS | Task: #18 PROSE-DEV-1 | Verdict: APPROVED
Commit: a10448b0 (fix) | 3 files changed

G1 TSC: 0 errors (full bun tsc --noEmit clean). G2 DV suite 5/5 PASS; DV-1 genuinely RED before fix confirmed via git diff (pre-fix: text_content:"", confidence:0 hardcoded in coverage-gap branch; new SELECT from pdf_extracted_text was not present — not a tautology). G3 Neighboring suites: pek-render-seam 12/0, 1271-bctc-inspect-md + 1273-bctc-inspect-overlay 16/0 — all green. G4 LIVE-SERVE: FPT doc e8ea3df5 page 1 → text_content 2081ch (pek_coverage_gap:true), page 2 → 134ch confidence:0.8 — non-empty confirmed. G5 Image SHA 33e4386c confirmed (new vs prior 4446a6e9, built 2026-06-01T17:17Z). DDD: interface→application import pre-existing (correct layer); no new imports. Security: no process.env, no secrets, no hardcoded creds.

## cycle-173 · 2026-05-31 · NB-PRUNE-1 — NB-PRUNE-FIX — APPROVED

Sprint: NB-PRUNE-FIX | Task: NB-PRUNE-1 | Verdict: APPROVED | Commit: 7166db01 (skill-only)
Fixtures: Session 5871L/69s→344L/3s (AC-5 guard fires); ISO-ts 316L/30s→27L/3s ≤200L; c-fmt 166L/12s→8L/3s ≤200L.
Preamble preserved: ISO+c-format confirmed. Exactly-3 no-prune: confirmed. Fenced ## over-count: theoretical only (0 live). TODO po/developer contradiction: deferred (po.md=26L). Skill 104L ≤120L cap. NB-PRUNE-1 → DONE in TASKS.md.
