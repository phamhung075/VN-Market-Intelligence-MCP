# ops-vps-fetch — BCTC-HNX-SSL-HARDEN VPS Deploy Verification

**Date:** 2026-07-04
**Provenance:** (router-dispatched) — diagnostic + verification ONLY, no deploy/restart run.
**Task type:** Review-board verification of BCTC-HNX-SSL-HARDEN acceptance criterion.

---

## Task

Repo scope for BCTC-HNX-SSL-HARDEN (commits `073fa27f` + `638fba89`) replaced insecure `curl -k`
with `--cacert <bundle>` cert-pinned verification in `vps-scripts/fetch-bctc.sh`, targeting HNX's
`owa.hnx.vn` PDF endpoint (whose server omits the GlobalSign RSA OV SSL CA 2018 intermediate from
its served chain — verify code 21). PO flagged the VPS deploy as UNCONFIRMED
(`get_vps_proxy_health(bctc)` showed 0 fetch/24h at review time — a low-queue-volume artifact, not
a deploy failure, per this verification). This task verifies, live on the VPS, whether the hardened
artifacts actually shipped and whether the acceptance criterion — "BCTC (HNX) fetch succeeds with
cert verification ON, post-deploy" — actually holds.

## Method

1. SSH to the VPS (reachable — connection confirmed).
2. Inspected `/root/fetch-bctc.sh` and `/root/hnx-ca-bundle.pem` (mtimes both `Jul 3 11:41`, i.e.
   post-hardening-commit).
3. Grepped the live script for `-k`/`--insecure` (none found) and for the actual `curl` invocation
   used for PDF download.
4. Byte-diffed the live script against the repo's hardened `vps-scripts/fetch-bctc.sh` (after
   redacting the templated `__API_KEY__`/`__MCP_BASE__` → live-secret substitution on both sides) —
   **identical**.
5. MD5-compared the live `/root/hnx-ca-bundle.pem` against the repo's `vps-scripts/hnx-ca-bundle.pem`
   — **identical checksum** (`17bf45efde60f44e244fda6bdf7d0e89`).
6. Pulled a real, recently-discovered HNX BCTC PDF URL from `/var/log/vn-bctc-fetch.log`
   (`.../cims/2026/4_W5/000000016289487_CV_CBTT_BCTC_Quy_I.2026_VI.pdf` — a Q1-2026 BCTC filing,
   the exact class of document the fetcher targets) and ran the fetcher's real download command
   live, verbatim, with verification ON and no `-k`:
   `curl --cacert /root/hnx-ca-bundle.pem -s -o <out> -w '...' <pdf_url>`

## Findings

- **Deploy timestamps:** `/root/fetch-bctc.sh` and `/root/hnx-ca-bundle.pem` both dated `Jul 3
  11:41` on the VPS — after the 2026-07-02/07-03 hardening commits, confirming a deploy did occur
  post-hardening (not stale pre-hardening artifacts).
- **Live script grep** — no `-k`/`--insecure` anywhere in `/root/fetch-bctc.sh`; the PDF-download
  `curl` line reads:
  ```
  HTTP_CODE=$(curl -s --cacert /root/hnx-ca-bundle.pem -L -o "$TMP_PDF" -w "%{http_code}" ...)
  ```
  — matches the repo's hardened form exactly (confirmed via redacted byte-diff: **IDENTICAL**).
- **CA bundle presence + integrity:** `/root/hnx-ca-bundle.pem` present, 4173 bytes, MD5
  `17bf45efde60f44e244fda6bdf7d0e89` — byte-identical to the repo copy (same MD5).
- **Live fetch with verification ON** (`curl --cacert ..., no -k`) against a real HNX BCTC PDF URL:
  ```
  RC=200 SIZE=536103 EXIT=0
  CURL_EXIT=0
  ```
  Output file confirmed via `file`: `PDF document, version 1.3`, 536103 bytes on disk.
  → cert chain (leaf + pinned GlobalSign intermediate/root) verifies successfully and the download
  completes with TLS verification enabled — no `-k` used at any point in this test.
- **Context on the "0 fetch/24h" PO flag:** `vn-bctc-fetch.service` is `active`; the fetch loop runs
  on a cron-like cadence and the queue has been empty (`Queue: 0 items pending`) for essentially
  every cycle in the trailing log window (2026-06-28 through 2026-07-03) — i.e. the low/zero
  fetch-count reflects an empty upstream queue, not a broken or unexercised code path. The one
  window with real queue items (producing the `owa.hnx.vn` PDF URLs above) is not captured in
  `get_vps_proxy_health`'s narrow recent-window metric, which is why the health check under-reports
  activity — this is a metric-visibility gap, not evidence the hardened path never ran.

## Verdict

`deploy_shipped: yes` — the hardened `fetch-bctc.sh` (using `--cacert`, zero `-k`/`--insecure`) and
its paired `hnx-ca-bundle.pem` are both live on the VPS, byte-identical to the repo's hardened
artifacts, and were deployed after the hardening commits.

`ac_met: true` — a live fetch against a real HNX BCTC PDF endpoint, run with TLS verification ON
and no `-k`, succeeded: `rc=0`, HTTP 200, 536103-byte valid PDF. This directly satisfies BCTC-HNX-SSL-HARDEN's
stated acceptance criterion: "BCTC (HNX) fetch succeeds with cert verification ON, post-deploy."

## Recommended-next

Resolve BCTC-HNX-SSL-HARDEN — repo hardening + VPS deploy are both confirmed live and the
acceptance criterion is independently verified with a real fetch. No further deploy action needed.
Suggest a secondary, low-priority follow-up (not blocking closure): widen
`get_vps_proxy_health(bctc)`'s observation window or add a queue-depth-aware denominator so future
low-queue-volume periods don't misread as "never ran" for reviewers relying on that metric alone.
