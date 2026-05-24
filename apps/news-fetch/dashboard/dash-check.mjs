#!/usr/bin/env node
/**
 * dash-check.mjs — news-fetch G9 trust-contract headless DOM inspector (Path B)
 *
 * Loads dashboard/index.html via file:// in headless Chromium, reads the LIVE
 * rendered DOM, and emits a machine-parseable G9 trust-contract report. This is
 * the PO's Path-B verification per pilot-charter §G9: confirm one can point to a
 * specific card / story proving a primitive works — from the DASHBOARD ALONE
 * (no TS, no test output, no terminal).
 *
 * Asserts:
 *   - 3 sandbox panels rendered (primitives / module / microservice)
 *   - 1 live-data panel present (panel-live-data) — shows degrade state under file://
 *   - 6 sandbox cards (4 primitive + 1 module + 1 microservice)
 *   - status badges are honest (PASS/FAIL/ERROR/NOT-RUN — never fabricated)
 *   - ≥1 green (PASS) primitive card with a human-readable story
 *   - live panel shows file:// degrade message (no fake rows, no network error)
 *   - 0 JS console errors, 0 page errors
 *   - 0 external network calls (file:// only — every request must be file://)
 *   - saves render-check.png screenshot for evidence
 *
 * Exit codes:
 *   0 - PASS  (3 sandbox panels, 1 live panel, 6 sandbox cards, ≥1 green primitive story, live degrade shown, 0 errors, 0 net)
 *   1 - FAIL  (missing panels/cards, red dashboard, JS/page errors, network calls)
 *
 * Usage (from apps/news-fetch/):
 *   node dashboard/dash-check.mjs
 *
 * Security: ZERO DB credentials, ZERO API keys. Pure file:// load.
 * Mirrors the fleet precedent apps/kinh-dich-service/dashboard/dash-check.mjs,
 * adapted to news-fetch DOM (badge classes + panel/card IDs).
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const NF_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");
const SCREENSHOT = path.join(DASHBOARD_DIR, "render-check.png");
const PAGE_URL = `file://${INDEX_HTML}`;

// Honest badge labels — the ONLY values the dashboard may render.
const VALID_BADGE_LABELS = new Set(["PASS", "FAIL", "ERROR", "NOT-RUN"]);

// ---------------------------------------------------------------------------
// Resolve playwright-core — local first, sibling fallback with warning.
// ---------------------------------------------------------------------------
function resolvePlaywrightCore() {
  const localPath = path.resolve(NF_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return { path: localPath, isLocal: true };
  }
  for (const sib of ["technical-analysis", "frontend", "kinh-dich-service"]) {
    const sp = path.resolve(NF_ROOT, "..", sib, "node_modules", "playwright-core");
    if (fs.existsSync(path.join(sp, "package.json"))) {
      console.warn(
        `[dash-check] WARN: playwright-core not local, falling back to apps/${sib}/node_modules`
      );
      return { path: sp, isLocal: false };
    }
  }
  throw new Error(
    "playwright-core not found in local or sibling node_modules. " +
      "Install: cd apps/news-fetch && bun add -d playwright-core"
  );
}

const pwInfo = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwInfo.path, "index.js"));
const { chromium } = pwCore;

async function run() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[dash-check] FAIL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const networkRequests = []; // every request URL — must all be file://

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("request", (req) => networkRequests.push(req.url()));

  try {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(400); // settle synchronous XHR + badge paint

    // 1. Panels — 3 sandbox panels + 1 live-data panel = 4 total.
    const panelIds = await page.$$eval(".panel", (els) => els.map((e) => e.id));
    const SANDBOX_PANEL_IDS = ["panel-primitives", "panel-module", "panel-microservice"];
    const sandboxPanelIds = panelIds.filter((id) => SANDBOX_PANEL_IDS.includes(id));
    const hasLivePanel = panelIds.includes("panel-live-data");

    // 2. Cards — id + name + meta + badge text/class per card.
    const cards = await page.$$eval(".card", (els) =>
      els.map((e) => {
        const badge = e.querySelector(".badge");
        const wires = e.querySelector(".wires");
        const endpoints = e.querySelector(".endpoints");
        return {
          id: e.id,
          name: e.querySelector(".card-name")?.textContent.trim() ?? "",
          meta: e.querySelector(".card-meta")?.textContent.trim() ?? "",
          badge: badge ? badge.textContent.trim() : "",
          badgeClass: badge ? badge.className : "",
          // "story" = the human-readable line a PO points at to prove the
          // primitive works: "<name>: <meta> -> <badge>" plus any wiring.
          wires: wires ? wires.textContent.trim() : null,
          endpoints: endpoints
            ? endpoints.textContent.trim().replace(/\s+/g, " ")
            : null,
        };
      })
    );

    // 3. Last-run line (the trace summary the PO reads).
    const lastRun = await page
      .$eval("#last-run", (e) => e.textContent.trim())
      .catch(() => "");

    // 4. Live panel degrade state (file:// → must show degrade, not fake rows, not error).
    const liveDegradeVisible = await page
      .$eval("#live-state-degrade", (e) => !!e && e.textContent.trim().length > 0)
      .catch(() => false);
    const liveFakeRows = await page
      .$eval("#live-data-rows", () => true)
      .catch(() => false);
    const liveErrorVisible = await page
      .$eval("#live-state-error", () => true)
      .catch(() => false);

    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    await browser.close();

    // -----------------------------------------------------------------------
    // Build per-card stories + classify badges.
    // -----------------------------------------------------------------------
    const stories = cards.map((c) => {
      const tail = c.wires
        ? ` [${c.wires}]`
        : c.endpoints
        ? ` [${c.endpoints}]`
        : "";
      return `${c.name}: ${c.meta} -> ${c.badge}${tail}`;
    });

    const badgeCounts = { PASS: 0, FAIL: 0, ERROR: 0, "NOT-RUN": 0 };
    const badLabels = [];
    for (const c of cards) {
      if (VALID_BADGE_LABELS.has(c.badge)) badgeCounts[c.badge]++;
      else badLabels.push(c.badge || "(empty)");
    }

    const primitiveCards = cards.filter((c) => c.id.startsWith("prim-"));
    const greenPrimitives = primitiveCards.filter((c) => c.badge === "PASS");

    // External (non-file://) requests = trust violation.
    const externalRequests = networkRequests.filter(
      (u) => !u.startsWith("file://")
    );

    // -----------------------------------------------------------------------
    // Verdict (data-driven — no hardcoded pass totals).
    // -----------------------------------------------------------------------
    const failReasons = [];
    if (sandboxPanelIds.length !== 3)
      failReasons.push(`expected 3 sandbox panels, got ${sandboxPanelIds.length} (panelIds=${JSON.stringify(panelIds)})`);
    if (!hasLivePanel)
      failReasons.push("panel-live-data not found");
    if (cards.length !== 6)
      failReasons.push(`expected 6 sandbox cards, got ${cards.length}`);
    if (greenPrimitives.length < 1)
      failReasons.push("no green (PASS) primitive card with a story");
    if (badgeCounts.FAIL > 0 || badgeCounts.ERROR > 0)
      failReasons.push(
        `dashboard not all-green: ${badgeCounts.FAIL} FAIL, ${badgeCounts.ERROR} ERROR`
      );
    if (consoleErrors.length > 0)
      failReasons.push(`${consoleErrors.length} JS console errors`);
    if (pageErrors.length > 0)
      failReasons.push(`${pageErrors.length} page errors`);
    if (badLabels.length > 0)
      failReasons.push(`bad badge labels: [${badLabels.join(", ")}]`);
    if (externalRequests.length > 0)
      failReasons.push(
        `${externalRequests.length} external network calls: [${externalRequests.join(", ")}]`
      );
    if (!liveDegradeVisible)
      failReasons.push("live panel does not show file:// degrade state (expected #live-state-degrade visible)");
    if (liveFakeRows)
      failReasons.push("live panel shows fake row data under file:// (SECURITY VIOLATION)");
    if (liveErrorVisible)
      failReasons.push("live panel shows error state under file:// (degrade should fire before fetch attempt)");

    const verdict = failReasons.length === 0 ? "PASS" : "FAIL";

    const result = {
      service: "news-fetch",
      goal: "G9",
      panels_rendered: panelIds.length,
      panel_ids: panelIds,
      sandbox_panels: sandboxPanelIds.length,
      live_panel_present: hasLivePanel,
      live_panel_degrade: liveDegradeVisible,
      live_panel_fake_rows: liveFakeRows,
      cards_total: cards.length,
      cards_per_tier: {
        primitives: cards.filter((c) => c.id.startsWith("prim-")).length,
        module: cards.filter((c) => c.id.startsWith("mod-")).length,
        microservice: cards.filter((c) => c.id.startsWith("svc-")).length,
      },
      badge_counts: badgeCounts,
      status_honest: badLabels.length === 0,
      green_primitive_count: greenPrimitives.length,
      console_errors: consoleErrors.length,
      page_errors: pageErrors.length,
      network_requests_total: networkRequests.length,
      external_network_calls: externalRequests.length,
      screenshot: SCREENSHOT,
      last_run_line: lastRun,
      stories,
      verdict,
    };

    console.log(`DASH-CHECK-RESULT: ${JSON.stringify(result)}`);
    console.log("");
    if (verdict === "PASS") {
      console.log(
        `[dash-check] PASS — 3 sandbox panels + 1 live panel (degrade), 6 cards (${result.cards_per_tier.primitives}/${result.cards_per_tier.module}/${result.cards_per_tier.microservice}), ` +
          `${greenPrimitives.length} green primitive stories, 0 errors, 0 external net.`
      );
      console.log("[dash-check] Per-card stories:");
      for (const s of stories) console.log(`  - ${s}`);
    } else {
      console.log(`[dash-check] FAIL — ${failReasons.join("; ")}`);
      if (consoleErrors.length)
        console.log(`[dash-check] JS errors:\n  ${consoleErrors.join("\n  ")}`);
      if (pageErrors.length)
        console.log(`[dash-check] Page errors:\n  ${pageErrors.join("\n  ")}`);
    }

    process.exit(verdict === "FAIL" ? 1 : 0);
  } catch (err) {
    await browser.close();
    console.error(`[dash-check] FATAL: ${err.message}`);
    process.exit(1);
  }
}

run();
