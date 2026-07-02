# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · dev-vps-crawls

**Sprint goal:** no goal set (task dispatched ambiently — see task-id below for actual scope)
**Agent:** dev-vps-crawls
**Started:** 2026-07-02T13:34:53Z

---

### STEP dev-vps-crawls-S1 · dev-vps-crawls · 2026-07-02T13:34:53Z
**task-id:** BCTC-HNX-SSL-HARDEN
**what-done:** Replaced curl -k (verify OFF) with curl --cacert /root/hnx-ca-bundle.pem in vps-scripts/fetch-bctc.sh; built vps-scripts/hnx-ca-bundle.pem; shipped it via scripts/deploy-vinahost.sh; offline+live verified; committed 073fa27f.
**what-considered:**
- Fetch intermediate from AIA CA-Issuers URL embedded in the live HNX leaf cert (most authoritative link) vs. generic search-engine PEM copy
- Cross-verify root via GlobalSign's own valid.r3.roots.globalsign.com test endpoint + published fingerprint vs. trusting a single download
- Bundle order intermediate+root (openssl verify order-agnostic for -CAfile) vs. root-only (would fail — leaf issuer is the intermediate, not the root)
**why-decision:** AIA-embedded URL is definitionally the correct issuer link for this exact leaf cert, eliminating source-substitution risk; GlobalSign's own root-validation endpoint gave independent live corroboration beyond a static fingerprint match.
**why-change:** No change from task brief — deploy intentionally NOT run (user-gated per hard constraints).
