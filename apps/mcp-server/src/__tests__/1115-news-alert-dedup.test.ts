Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1115 — News alert deduplication after server restart (report #1114)
 *
 * Verifies that news_mention alerts for the same article + same stock
 * within the same UTC day generate identical deterministic IDs, allowing
 * INSERT OR IGNORE in storeAlerts() to silently prevent duplicates even
 * when the RSS feed returns the same article with a different URL.
 *
 * Root cause: Google News RSS returns tracking-param URLs that change
 * between fetches. The existing URL-based dedup in rag_analyses fails for
 * these cases, causing `newEntries` to contain the same articles again
 * after restart, generating new alerts with random IDs.
 *
 * Fix: news_mention alerts now use deterministicNewsId() — keyed on
 * (actionCode + title-fingerprint + UTC day) — so the same article always
 * maps to the same alert ID regardless of URL changes or restarts.
 */

import { describe, it, expect } from "bun:test";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const WATCHLIST = [{ actionCode: "VCB" }, { actionCode: "HPG" }, { actionCode: "FPT" }];

function makeNewsSignal(
  actionCode: string,
  title: string,
  override: Partial<Signal> = {},
): Signal {
  return {
    type: "news_mention",
    severity: "medium",
    actionCode,
    message: `${title} — cascade impact on ${actionCode}`,
    confidence: 0.75,
    detectedAt: "2026-04-12T09:00:00.000Z",
    ...override,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1115 — News alert deduplication (report #1114)", () => {

  describe("Deterministic news_mention alert ID", () => {
    it("generates the same ID for the same article + stock within the same UTC day", () => {
      const title = "Oil Drops on Mideast Peace Talks";

      const sig1 = makeNewsSignal("VCB", title);
      const sig2 = makeNewsSignal("VCB", title, { detectedAt: "2026-04-12T17:45:00.000Z" });

      const alerts1 = generateAlerts([sig1], WATCHLIST);
      const alerts2 = generateAlerts([sig2], WATCHLIST);

      expect(alerts1).toHaveLength(1);
      expect(alerts2).toHaveLength(1);
      expect(alerts1[0]!.id).toBe(alerts2[0]!.id);
    });

    it("generates different IDs for the same article on different UTC days", () => {
      const title = "Oil Drops on Mideast Peace Talks";

      const sig1 = makeNewsSignal("VCB", title, { detectedAt: "2026-04-11T23:59:00.000Z" });
      const sig2 = makeNewsSignal("VCB", title, { detectedAt: "2026-04-12T00:01:00.000Z" });

      const alerts1 = generateAlerts([sig1], WATCHLIST);
      const alerts2 = generateAlerts([sig2], WATCHLIST);

      expect(alerts1[0]!.id).not.toBe(alerts2[0]!.id);
    });

    it("generates different IDs for different stocks with the same article", () => {
      const title = "Vietnam stock market gathers pace";

      const sigVcb = makeNewsSignal("VCB", title);
      const sigHpg = makeNewsSignal("HPG", title);

      const alertsVcb = generateAlerts([sigVcb], WATCHLIST);
      const alertsHpg = generateAlerts([sigHpg], WATCHLIST);

      expect(alertsVcb[0]!.id).not.toBe(alertsHpg[0]!.id);
    });

    it("generates different IDs for different articles on the same stock+day", () => {
      const sig1 = makeNewsSignal("FPT", "Oil Drops on Mideast Peace Talks");
      const sig2 = makeNewsSignal("FPT", "Russia Inflation 5.9% rises to new high");

      const alerts1 = generateAlerts([sig1], WATCHLIST);
      const alerts2 = generateAlerts([sig2], WATCHLIST);

      expect(alerts1[0]!.id).not.toBe(alerts2[0]!.id);
    });

    it("ID is stable regardless of minor message suffix differences (same title, different reasoning)", () => {
      // Same article title, different cascade reasoning suffix — should give same ID
      const title = "Vietnam stock market gathers pace";

      const sig1 = makeNewsSignal("VCB", title, {
        message: `${title} — strong banking sector momentum`,
      });
      const sig2 = makeNewsSignal("VCB", title, {
        message: `${title} — positive VCB direct mention`,
        detectedAt: "2026-04-12T18:10:00.000Z",
      });

      const alerts1 = generateAlerts([sig1], WATCHLIST);
      const alerts2 = generateAlerts([sig2], WATCHLIST);

      // Both signals have the same article title as the message prefix
      // The ID is based on the highest-confidence signal's message first 32 chars
      // Both start with "vietnam stock market gathers pac" (after normalization)
      expect(alerts1[0]!.id).toBe(alerts2[0]!.id);
    });
  });

  describe("Price signal IDs use 4-hour-bucket (report #2589 fix)", () => {
    it("price_drop alerts within same 4h window share the same deterministic ID", () => {
      const sig1: Signal = {
        type: "price_drop",
        severity: "high",
        actionCode: "VCB",
        message: "VCB price_drop signal",
        confidence: 0.9,
        detectedAt: "2026-04-12T09:00:00.000Z", // hour 09 → bucket 08
      };
      const sig2: Signal = {
        ...sig1,
        detectedAt: "2026-04-12T11:45:00.000Z", // hour 11 → bucket 08 (same bucket)
      };
      const sig3: Signal = {
        ...sig1,
        detectedAt: "2026-04-12T12:00:00.000Z", // hour 12 → bucket 12 (different bucket)
      };

      const alerts1 = generateAlerts([sig1], WATCHLIST);
      const alerts2 = generateAlerts([sig2], WATCHLIST);
      const alerts3 = generateAlerts([sig3], WATCHLIST);

      // Same 4h bucket → same ID
      expect(alerts1[0]!.id).toBe(alerts2[0]!.id);
      expect(alerts1[0]!.id).toMatch(/^alert-VCB-price_drop-2026-04-12T08$/);
      // Different 4h bucket → different ID
      expect(alerts1[0]!.id).not.toBe(alerts3[0]!.id);
      expect(alerts3[0]!.id).toMatch(/^alert-VCB-price_drop-2026-04-12T12$/);
    });
  });

  describe("Mixed signal types still use random IDs", () => {
    it("mixed news_mention + price_drop generates a random ID (not deterministic)", () => {
      const sigs: Signal[] = [
        makeNewsSignal("VCB", "Oil Drops on Mideast Peace Talks"),
        {
          type: "price_drop",
          severity: "high",
          actionCode: "VCB",
          message: "VCB price_drop signal",
          confidence: 0.9,
          detectedAt: "2026-04-12T09:00:00.000Z",
        },
      ];

      const alerts = generateAlerts(sigs, WATCHLIST);
      expect(alerts).toHaveLength(1);
      // Mixed types → falls through to generateId() → random prefix pattern
      expect(alerts[0]!.id).toMatch(/^alert-[a-z0-9]+-[a-z0-9]+$/);
    });
  });
});
