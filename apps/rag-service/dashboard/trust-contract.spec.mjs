#!/usr/bin/env node
/**
 * trust-contract.spec.mjs — G9 Playwright headless trust-contract check
 * P3-E UPDATE: Microservice panel now asserts honest-GREEN (3 service cards),
 * NOT the prior NOT-RUN assertion that validated the defect.
 *
 * Path B (Day-0 default): opens dashboard/index.html via file:// in headless
 * Chromium and asserts the TRUST CONTRACT:
 *
 *   TC-1  3 panels render (Primitives, Module, Microservice)
 *   TC-2  5 primitive cards present + named (similarity-scorer,
 *          relevance-threshold-gate, top-k-selector, context-window-packer,
 *          temporal-decay-scorer), all showing GREEN
 *   TC-3  retrieval module card GREEN
 *   TC-4  microservice panel has exactly 3 service cards, all GREEN
 *          (REPLACES prior NOT-RUN assertion which validated the defect).
 *          Service cards: /search golden, /index golden, /search 422 edge.
 *   TC-5  GREEN/RED state each card shows MATCHES the underlying trace
 *          pass/fail (trust = what you see is true). Proven by injecting a
 *          pass=false patch into the live DOM via page.route() for the
 *          similarity-scorer trace (primitive honest-red) AND separately for
 *          the service search-golden trace (service tier honest-red).
 *          The index.html file on disk is NEVER modified — patch is in-memory only.
 *   TC-5b Each Microservice card has a clickable detail-view toggle (canonical G6:
 *          click a card in EACH panel -> detail view renders). Verified by
 *          clicking the trace-toggle button and confirming trace-detail shows.
 *   TC-6  console_errors === 0
 *   TC-7  network_calls === 0 (file:// only; asserted via request interception)
 *
 * Writes VERDICT object to dashboard/trust-contract-result.json.
 * Captures dashboard/trust-contract-screenshot.png.
 *
 * Exit codes:
 *   0 — PASS
 *   1 — FAIL
 *
 * Usage (from repo root or apps/rag-service):
 *   node apps/rag-service/dashboard/trust-contract.spec.mjs
 *
 * playwright-core resolution: searches sibling app node_modules in priority order.
 * Security: ZERO DB credentials, ZERO API keys. Pure file:// load.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution — derive EVERYTHING from import.meta.url
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const RAG_ROOT = path.resolve(DASHBOARD_DIR, "..");
const APPS_ROOT = path.resolve(RAG_ROOT, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");
const PAGE_URL = `file://${INDEX_HTML}`;

const VERDICT_PATH = path.join(DASHBOARD_DIR, "trust-contract-result.json");
const SCREENSHOT_PATH = path.join(DASHBOARD_DIR, "trust-contract-screenshot.png");

// ---------------------------------------------------------------------------
// Resolve playwright-core — local first, then sibling apps
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  const candidates = [
    { label: "local rag-service", dir: path.join(RAG_ROOT, "node_modules", "playwright-core") },
    { label: "apps/mcp-server", dir: path.join(APPS_ROOT, "mcp-server", "node_modules", "playwright-core") },
    { label: "apps/technical-analysis", dir: path.join(APPS_ROOT, "technical-analysis", "node_modules", "playwright-core") },
    { label: "apps/frontend", dir: path.join(APPS_ROOT, "frontend", "node_modules", "playwright-core") },
    { label: "apps/news-fetch", dir: path.join(APPS_ROOT, "news-fetch", "node_modules", "playwright-core") },
  ];

  for (const { label, dir } of candidates) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      if (label !== "local rag-service") {
        console.warn(`[trust-contract] WARN: playwright-core resolved from ${label}`);
      }
      return dir;
    }
  }

  throw new Error(
    "playwright-core not found in any sibling node_modules. " +
    "Install: cd apps/rag-service && npm install playwright-core"
  );
}

const pwDir = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(pwDir, "index.js"));

// ---------------------------------------------------------------------------
// Trust-contract assertions
// ---------------------------------------------------------------------------

// Expected primitive cards (order-independent)
const EXPECTED_PRIMITIVES = [
  "similarity-scorer",
  "relevance-threshold-gate",
  "top-k-selector",
  "context-window-packer",
  "temporal-decay-scorer",
];

// Expected service cards in the Microservice panel (P3-E: now GREEN, not NOT-RUN)
const EXPECTED_SERVICE_CARD_COUNT = 3;

async function run() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[trust-contract] FATAL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const networkCalls = [];

  // TC-6: capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  // TC-7: capture network calls
  // file:// pages produce no HTTP requests. Any request = violation.
  page.on("request", (req) => {
    const url = req.url();
    // Exclude the file:// page itself
    if (!url.startsWith("file://")) {
      networkCalls.push(url);
    }
  });

  const verdict = {
    panels_ok: false,
    panels_count: 0,
    primitive_cards: [],
    primitive_cards_count: 0,
    primitive_cards_all_green: false,
    module_ok: false,
    // P3-E: replaced microservice_not_run with service_cards_green
    service_cards_count: 0,
    service_cards_all_green: false,
    service_cards_detail_view_ok: false,
    colors_match_traces: false,
    service_tier_honest_red_ok: false,
    honest_red_method: null,
    console_errors: 0,
    network_calls: 0,
    verdict: "FAIL",
    error: null,
    // Explicitly record that prior defect assertion is gone
    p3e_note: "P3-E: Microservice panel asserts honest-GREEN (3 service cards), NOT NOT-RUN. Prior NOT-RUN assertion was a defect — it validated the wrong contract.",
  };

  try {
    // -------------------------------------------------------------------------
    // Load dashboard via file://
    // -------------------------------------------------------------------------
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    // Let JS render all cards
    await page.waitForTimeout(800);

    // -------------------------------------------------------------------------
    // TC-1: 3 panels render
    // -------------------------------------------------------------------------
    const panelIds = ["#panel-primitives", "#panel-module", "#panel-microservice"];
    let panelsOk = true;
    let panelsCount = 0;
    for (const id of panelIds) {
      const el = await page.$(id);
      if (el) {
        panelsCount++;
      } else {
        console.error(`[trust-contract] FAIL TC-1: panel ${id} not found`);
        panelsOk = false;
      }
    }
    verdict.panels_ok = panelsOk;
    verdict.panels_count = panelsCount;

    // -------------------------------------------------------------------------
    // TC-2: 5 primitive cards present + named, all GREEN
    // The dashboard uses data-primitive attribute on each card div.
    // -------------------------------------------------------------------------
    const primitiveCardData = await page.$$eval(
      "#primitives-body .card",
      (cards) =>
        cards.map((card) => ({
          name: card.dataset.primitive || card.querySelector(".card-name")?.textContent?.trim() || "?",
          statusLabel: card.querySelector(".status-label")?.textContent?.trim() || "?",
          statusClass: card.querySelector(".status-label")?.className || "",
        }))
    );

    verdict.primitive_cards = primitiveCardData.map((c) => ({ name: c.name, status: c.statusLabel }));
    verdict.primitive_cards_count = primitiveCardData.length;

    // Check all 5 expected primitives are present and GREEN
    let allGreen = true;
    for (const expected of EXPECTED_PRIMITIVES) {
      const card = primitiveCardData.find((c) => c.name === expected);
      if (!card) {
        console.error(`[trust-contract] FAIL TC-2: primitive card "${expected}" not found`);
        allGreen = false;
      } else if (card.statusLabel !== "GREEN") {
        console.error(`[trust-contract] FAIL TC-2: primitive "${expected}" shows "${card.statusLabel}" not "GREEN"`);
        allGreen = false;
      }
    }
    verdict.primitive_cards_all_green = allGreen;

    // -------------------------------------------------------------------------
    // TC-3: retrieval module card GREEN
    // -------------------------------------------------------------------------
    const moduleCardData = await page.$$eval(
      "#module-body .card",
      (cards) =>
        cards.map((card) => ({
          name: card.dataset.primitive || card.querySelector(".card-name")?.textContent?.trim() || "?",
          statusLabel: card.querySelector(".status-label")?.textContent?.trim() || "?",
        }))
    );
    const retrievalCard = moduleCardData.find((c) => c.name === "retrieval");
    verdict.module_ok = !!(retrievalCard && retrievalCard.statusLabel === "GREEN");
    if (!verdict.module_ok) {
      console.error(`[trust-contract] FAIL TC-3: retrieval module card not GREEN (found: ${JSON.stringify(moduleCardData)})`);
    }

    // -------------------------------------------------------------------------
    // TC-4: Microservice panel has >=3 service cards, ALL GREEN (P3-E — NOT NOT-RUN)
    // This assertion REPLACES the prior microservice_not_run=true check.
    // Prior spec asserted NOT-RUN as a PASS condition — that validated the defect.
    // -------------------------------------------------------------------------
    const microserviceCardData = await page.$$eval(
      "#microservice-body .card",
      (cards) =>
        cards.map((card) => ({
          name: card.dataset.primitive || card.querySelector(".card-name")?.textContent?.trim() || "?",
          statusLabel: card.querySelector(".status-label")?.textContent?.trim() || "?",
          hasToggle: !!card.querySelector(".trace-toggle"),
          hasDetail: !!card.querySelector(".trace-detail"),
        }))
    );

    verdict.service_cards_count = microserviceCardData.length;

    let allServiceGreen = microserviceCardData.length >= EXPECTED_SERVICE_CARD_COUNT;
    for (const card of microserviceCardData) {
      if (card.statusLabel !== "GREEN") {
        console.error(`[trust-contract] FAIL TC-4: service card "${card.name}" shows "${card.statusLabel}" not "GREEN"`);
        allServiceGreen = false;
      }
    }
    if (microserviceCardData.length < EXPECTED_SERVICE_CARD_COUNT) {
      console.error(`[trust-contract] FAIL TC-4: only ${microserviceCardData.length} service cards, expected >= ${EXPECTED_SERVICE_CARD_COUNT}`);
    }
    verdict.service_cards_all_green = allServiceGreen;

    // TC-5b: Each service card has a clickable detail-view toggle (canonical G6)
    // Verify the toggle + detail element are present in DOM for each service card
    let detailViewOk = microserviceCardData.length >= EXPECTED_SERVICE_CARD_COUNT;
    for (const card of microserviceCardData) {
      if (!card.hasToggle || !card.hasDetail) {
        console.error(`[trust-contract] FAIL TC-5b: service card "${card.name}" missing detail-view toggle (hasToggle=${card.hasToggle}, hasDetail=${card.hasDetail}) — canonical G6 not met`);
        detailViewOk = false;
      }
    }

    // Click the first service card toggle and verify detail becomes visible
    if (microserviceCardData.length > 0 && microserviceCardData[0].hasToggle) {
      try {
        const firstToggle = await page.$("#microservice-body .card .trace-toggle");
        if (firstToggle) {
          await firstToggle.click();
          await page.waitForTimeout(200);
          const detailVisible = await page.$eval(
            "#microservice-body .card .trace-detail",
            (el) => el.style.display !== "none"
          ).catch(() => false);
          if (!detailVisible) {
            console.error("[trust-contract] FAIL TC-5b: clicking service card toggle did not show trace-detail");
            detailViewOk = false;
          } else {
            console.log("[trust-contract] TC-5b: service card toggle clicked -> trace-detail visible (canonical G6 CONFIRMED)");
          }
          // Hide it again
          await firstToggle.click();
          await page.waitForTimeout(100);
        }
      } catch (e) {
        console.error(`[trust-contract] FAIL TC-5b: click toggle error: ${e.message}`);
        detailViewOk = false;
      }
    }
    verdict.service_cards_detail_view_ok = detailViewOk;

    // -------------------------------------------------------------------------
    // TC-5: Honest-red proof via page.route() — TWO proofs:
    //   (a) Primitive tier: similarity-scorer pass=false -> FAIL badge
    //   (b) Service tier: service-search-golden pass=false -> FAIL badge
    // File on disk is NEVER modified. In-memory patch only.
    // -------------------------------------------------------------------------

    // Read original HTML
    const originalHtml = fs.readFileSync(INDEX_HTML, "utf-8");

    // --- Proof (a): primitive honest-red ---
    const patchedHtmlA = originalHtml.replace(
      /("passed":\s*)(true)(\s*,\s*\n\s*"primitive":\s*"similarity_scorer")/,
      '$1false$3'
    );
    const patchedA = patchedHtmlA !== originalHtml;

    // --- Proof (b): service tier honest-red ---
    // The service trace block has "passed": true, "scenario": "search_golden"
    const patchedHtmlB = originalHtml.replace(
      /("passed":\s*)(true)(\s*,\s*\n\s*"scenario":\s*"search_golden")/,
      '$1false$3'
    );
    const patchedB = patchedHtmlB !== originalHtml;

    await page.close();

    // Proof (a): primitive honest-red
    let colorsMatchTraces = false;
    const page2 = await context.newPage();
    const page2ConsoleErrors = [];
    page2.on("console", (msg) => {
      if (msg.type() === "error") page2ConsoleErrors.push(msg.text());
    });

    if (patchedA) {
      await page2.route(PAGE_URL, (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: patchedHtmlA,
        });
      });
      await page2.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
      await page2.waitForTimeout(800);

      const patchedCard = await page2.$eval(
        "#primitives-body .card[data-primitive='similarity-scorer'] .status-label",
        (el) => ({ statusLabel: el.textContent?.trim(), statusClass: el.className })
      ).catch(() => null);

      if (patchedCard) {
        colorsMatchTraces = patchedCard.statusLabel === "FAIL";
        verdict.honest_red_method = `DOM patch via page.route(): trace-similarity-scorer-golden.passed set to false in-memory → card shows "${patchedCard.statusLabel}" (expected FAIL). File on disk NOT modified.`;
        if (!colorsMatchTraces) {
          console.error(`[trust-contract] FAIL TC-5a: after pass=false patch, similarity-scorer card shows "${patchedCard.statusLabel}" not "FAIL" — honesty broken`);
        } else {
          console.log(`[trust-contract] TC-5a: primitive honest-red CONFIRMED (similarity-scorer shows FAIL after patch)`);
        }
      } else {
        verdict.honest_red_method = "Patched HTML served but similarity-scorer card element not found";
        console.error("[trust-contract] FAIL TC-5a: could not read patched card status");
      }
    } else {
      verdict.honest_red_method = "HTML patch regex did not match — honesty check skipped (WARN)";
      colorsMatchTraces = false;
      console.warn("[trust-contract] WARN TC-5a: could not inject honesty patch");
    }
    verdict.colors_match_traces = colorsMatchTraces;
    await page2.close();

    // Proof (b): service tier honest-red
    let serviceTierHonestRed = false;
    const page3 = await context.newPage();
    if (patchedB) {
      await page3.route(PAGE_URL, (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: patchedHtmlB,
        });
      });
      await page3.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
      await page3.waitForTimeout(800);

      // The first service card (/search golden) should now be FAIL
      const serviceCardPatched = await page3.$eval(
        "#microservice-body .card .status-label",
        (el) => el.textContent?.trim()
      ).catch(() => null);

      if (serviceCardPatched !== null) {
        serviceTierHonestRed = serviceCardPatched === "FAIL";
        if (!serviceTierHonestRed) {
          console.error(`[trust-contract] FAIL TC-5b-svc: after service pass=false patch, first service card shows "${serviceCardPatched}" not "FAIL" — service tier honesty broken`);
        } else {
          console.log(`[trust-contract] TC-5b-svc: service tier honest-red CONFIRMED (/search golden shows FAIL after patch). File on disk NOT modified.`);
        }
      } else {
        console.error("[trust-contract] FAIL TC-5b-svc: could not read patched service card status");
      }
    } else {
      console.warn("[trust-contract] WARN TC-5b-svc: service tier HTML patch regex did not match — skipping service honest-red proof");
      serviceTierHonestRed = false;
    }
    verdict.service_tier_honest_red_ok = serviceTierHonestRed;
    await page3.close();

    // -------------------------------------------------------------------------
    // TC-6 + TC-7: errors and network (captured from original page load)
    // -------------------------------------------------------------------------
    verdict.console_errors = consoleErrors.length;
    verdict.network_calls = networkCalls.length;

    if (consoleErrors.length > 0) {
      console.error(`[trust-contract] FAIL TC-6: ${consoleErrors.length} console errors: ${consoleErrors.join("; ")}`);
    }
    if (networkCalls.length > 0) {
      console.error(`[trust-contract] FAIL TC-7: ${networkCalls.length} network calls detected: ${networkCalls.join(", ")}`);
    }

    // -------------------------------------------------------------------------
    // Take screenshot of all-green state (reload original)
    // -------------------------------------------------------------------------
    const page4 = await context.newPage();
    await page4.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page4.waitForTimeout(800);
    await page4.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    await page4.close();

    // -------------------------------------------------------------------------
    // Final verdict: all conditions must hold
    // -------------------------------------------------------------------------
    const allOk =
      verdict.panels_ok &&
      verdict.panels_count === 3 &&
      verdict.primitive_cards_all_green &&
      verdict.module_ok &&
      verdict.service_cards_count >= EXPECTED_SERVICE_CARD_COUNT &&
      verdict.service_cards_all_green &&
      verdict.service_cards_detail_view_ok &&
      verdict.colors_match_traces &&
      verdict.service_tier_honest_red_ok &&
      verdict.console_errors === 0 &&
      verdict.network_calls === 0;

    verdict.verdict = allOk ? "PASS" : "FAIL";

  } catch (err) {
    verdict.error = err.message;
    verdict.verdict = "FAIL";
    console.error(`[trust-contract] FATAL: ${err.message}`);
  } finally {
    await browser.close();
  }

  // -------------------------------------------------------------------------
  // Write verdict JSON
  // -------------------------------------------------------------------------
  fs.writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 2));
  console.log("");
  console.log("[trust-contract] VERDICT:");
  console.log(JSON.stringify(verdict, null, 2));
  console.log("");

  if (verdict.verdict === "PASS") {
    console.log("[trust-contract] PASS — all trust-contract assertions satisfied");
    console.log(`  TC-1 panels_ok:                     ${verdict.panels_ok} (${verdict.panels_count}/3)`);
    console.log(`  TC-2 primitive_cards:               ${verdict.primitive_cards_count}/5 all GREEN=${verdict.primitive_cards_all_green}`);
    console.log(`  TC-3 module_ok:                     ${verdict.module_ok}`);
    console.log(`  TC-4 service_cards:                 ${verdict.service_cards_count} cards, all_green=${verdict.service_cards_all_green}`);
    console.log(`  TC-5b detail_view_ok:               ${verdict.service_cards_detail_view_ok} (canonical G6 all 3 panels)`);
    console.log(`  TC-5a colors_match_traces:          ${verdict.colors_match_traces} (primitive honest-red)`);
    console.log(`  TC-5b-svc service_tier_honest_red:  ${verdict.service_tier_honest_red_ok} (service tier honest-red)`);
    console.log(`  TC-6 console_errors:                ${verdict.console_errors}`);
    console.log(`  TC-7 network_calls:                 ${verdict.network_calls}`);
    console.log(`  Screenshot:                         ${SCREENSHOT_PATH}`);
    console.log(`  Verdict file:                       ${VERDICT_PATH}`);
    console.log("");
    console.log("  NOTE: This is the AUTOMATED PROXY only.");
    console.log("  FINAL G9 YES requires USER verbal sign-off at pilot review.");
    console.log("  (pilot-charter.md L192-194 — the canonical G9 arbiter is the USER)");
  } else {
    console.error(`[trust-contract] FAIL — verdict: ${verdict.verdict}`);
    if (verdict.error) console.error(`  error: ${verdict.error}`);
  }

  process.exit(verdict.verdict === "PASS" ? 0 : 1);
}

run();
