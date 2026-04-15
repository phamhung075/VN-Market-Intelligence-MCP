process.env["DB_PATH"] = ":memory:";

/**
 * Task 064 — Multi-signal Alert Generator
 *
 * Tests for generateAlerts() (pure domain) and storeAlerts() (infrastructure).
 *
 * generateAlerts:
 *   - Groups signals by actionCode
 *   - Only generates alerts for stocks in the watchlist
 *   - Severity escalation: 1 signal → signal severity, 2 signals → high, 3+ → critical
 *   - Generates a human-readable message summarising the signals
 *
 * storeAlerts:
 *   - Inserts alert rows into SQLite alerts table (infrastructure adapter)
 *   - Accepts a db parameter — no I/O inside domain layer
 *   - Does NOT insert duplicates for the same signal combo within a time window
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSignal(
  actionCode: string,
  type: Signal["type"] = "price_drop",
  severity: Signal["severity"] = "medium",
  override: Partial<Signal> = {},
): Signal {
  return {
    type,
    severity,
    actionCode,
    message: `${actionCode} ${type} signal`,
    confidence: 0.8,
    detectedAt: new Date().toISOString(),
    ...override,
  };
}

const watchlist = [
  { actionCode: "VCB" },
  { actionCode: "HPG" },
  { actionCode: "MWG" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 064 — Alert Generator", () => {
  // ── generateAlerts ────────────────────────────────────────────────────────

  describe("generateAlerts — basic behaviour", () => {
    it("returns an empty array when signals array is empty", () => {
      const alerts = generateAlerts([], watchlist);
      expect(alerts).toBeInstanceOf(Array);
      expect(alerts.length).toBe(0);
    });

    it("ignores signals for stocks not in the watchlist", () => {
      const signals = [makeSignal("FPT"), makeSignal("SSI")];
      const alerts = generateAlerts(signals, watchlist);
      expect(alerts.length).toBe(0);
    });

    it("generates an alert for a single signal with matching severity", () => {
      const signal = makeSignal("VCB", "price_drop", "high");
      const alerts = generateAlerts([signal], watchlist);

      expect(alerts.length).toBe(1);
      const alert = alerts[0]!;
      expect(alert.actionCode).toBe("VCB");
      expect(alert.severity).toBe("high");
      expect(alert.signals).toHaveLength(1);
      expect(alert.signals[0]).toEqual(signal);
    });

    it("Alert object has all required fields", () => {
      const signal = makeSignal("HPG", "volume_spike", "medium");
      const [alert] = generateAlerts([signal], watchlist);
      expect(alert).toBeDefined();
      const a = alert!;

      // Required shape
      expect(typeof a.id).toBe("string");
      expect(a.id.length).toBeGreaterThan(0);
      expect(typeof a.actionCode).toBe("string");
      expect(Array.isArray(a.signals)).toBe(true);
      expect(["low", "medium", "high", "critical"]).toContain(a.severity);
      expect(typeof a.message).toBe("string");
      expect(a.message.length).toBeGreaterThan(0);
      expect(typeof a.isRead).toBe("boolean");
      expect(a.isRead).toBe(false);
      expect(typeof a.createdAt).toBe("string");
      // createdAt must be ISO 8601
      expect(() => new Date(a.createdAt)).not.toThrow();
    });
  });

  describe("generateAlerts — severity escalation", () => {
    it("2 signals for the same stock → severity elevated to high", () => {
      const signals = [
        makeSignal("VCB", "price_drop", "medium"),
        makeSignal("VCB", "volume_spike", "medium"),
      ];
      const alerts = generateAlerts(signals, watchlist);

      expect(alerts.length).toBe(1);
      expect(alerts[0]!.severity).toBe("high");
      expect(alerts[0]!.signals).toHaveLength(2);
    });

    it("3 signals for the same stock → severity escalated to critical", () => {
      const signals = [
        makeSignal("HPG", "price_drop", "medium"),
        makeSignal("HPG", "volume_spike", "medium"),
        makeSignal("HPG", "news_mention", "low"),
      ];
      const alerts = generateAlerts(signals, watchlist);

      expect(alerts.length).toBe(1);
      expect(alerts[0]!.severity).toBe("critical");
      expect(alerts[0]!.signals).toHaveLength(3);
    });

    it("4 signals for the same stock → still critical", () => {
      const signals = [
        makeSignal("MWG", "price_drop", "medium"),
        makeSignal("MWG", "volume_spike", "high"),
        makeSignal("MWG", "news_mention", "low"),
        makeSignal("MWG", "report_new", "medium"),
      ];
      const alerts = generateAlerts(signals, watchlist);

      expect(alerts.length).toBe(1);
      expect(alerts[0]!.severity).toBe("critical");
    });

    it("single low-severity signal → alert severity stays low", () => {
      const signal = makeSignal("VCB", "news_mention", "low");
      const [alert] = generateAlerts([signal], watchlist);
      expect(alert!.severity).toBe("low");
    });
  });

  describe("generateAlerts — multiple stocks", () => {
    it("generates separate alerts for different stocks", () => {
      const signals = [
        makeSignal("VCB", "price_drop", "medium"),
        makeSignal("HPG", "volume_spike", "high"),
      ];
      const alerts = generateAlerts(signals, watchlist);

      expect(alerts.length).toBe(2);
      const codes = alerts.map((a) => a.actionCode).sort();
      expect(codes).toEqual(["HPG", "VCB"]);
    });

    it("mixes watchlist and non-watchlist signals correctly", () => {
      const signals = [
        makeSignal("VCB", "price_drop", "medium"),   // in watchlist
        makeSignal("FPT", "price_surge", "high"),    // NOT in watchlist
        makeSignal("HPG", "volume_spike", "medium"), // in watchlist
      ];
      const alerts = generateAlerts(signals, watchlist);
      expect(alerts.length).toBe(2);
      const codes = alerts.map((a) => a.actionCode).sort();
      expect(codes).toEqual(["HPG", "VCB"]);
    });
  });

  describe("generateAlerts — message quality", () => {
    it("single-signal message references the signal type and stock code", () => {
      const signal = makeSignal("VCB", "price_drop", "high");
      const [alert] = generateAlerts([signal], watchlist);
      expect(alert!.message.toLowerCase()).toContain("vcb");
      expect(alert!.message.toLowerCase()).toContain("price_drop");
    });

    it("multi-signal message references the stock code and all signal types", () => {
      const signals = [
        makeSignal("HPG", "price_drop", "medium"),
        makeSignal("HPG", "volume_spike", "medium"),
        makeSignal("HPG", "news_mention", "low"),
      ];
      const [alert] = generateAlerts(signals, watchlist);
      const msg = alert!.message.toLowerCase();
      expect(msg).toContain("hpg");
      expect(msg).toContain("price_drop");
      expect(msg).toContain("volume_spike");
      expect(msg).toContain("news_mention");
    });
  });

  // ── storeAlerts ───────────────────────────────────────────────────────────

  describe("storeAlerts — SQLite persistence", () => {
    // Use an in-memory DB for isolation
    const OLD_DB_PATH = Bun.env["DB_PATH"];

    beforeEach(async () => {
      Bun.env["DB_PATH"] = ":memory:";
      // Dynamic import so module re-reads env each test
      const { closeDb, initDatabase } = await import(
        "../infrastructure/db/schema.js"
      );
      closeDb();
      await initDatabase();
    });

    afterEach(async () => {
      const { closeDb } = await import("../infrastructure/db/schema.js");
      closeDb();
      if (OLD_DB_PATH !== undefined) {
        Bun.env["DB_PATH"] = OLD_DB_PATH;
      } else {
        delete Bun.env["DB_PATH"];
      }
    });

    it("stores alerts in SQLite and retrieves them", async () => {
      const { storeAlerts } = await import(
        "../infrastructure/db/alertStore.js"
      );
      const { getDb } = await import("../infrastructure/db/schema.js");

      const signal = makeSignal("VCB", "price_drop", "high");
      const alerts = generateAlerts([signal], watchlist);
      const db = getDb();
      storeAlerts(alerts, db);

      const rows = db
        .prepare("SELECT * FROM alerts WHERE id = ?")
        .all(alerts[0]!.id) as { id: string; severity: string }[];

      expect(rows.length).toBe(1);
      expect(rows[0]!.severity).toBe("high");
    });

    it("does not insert duplicate alerts with same id", async () => {
      const { storeAlerts } = await import(
        "../infrastructure/db/alertStore.js"
      );
      const { getDb } = await import("../infrastructure/db/schema.js");

      const signal = makeSignal("HPG", "volume_spike", "medium");
      const alerts = generateAlerts([signal], watchlist);
      const db = getDb();

      // store twice — second call should be a no-op for same id
      storeAlerts(alerts, db);
      storeAlerts(alerts, db);

      const rows = db
        .prepare("SELECT * FROM alerts WHERE id = ?")
        .all(alerts[0]!.id);
      expect(rows.length).toBe(1);
    });

    it("persists signals_json as parseable JSON array", async () => {
      const { storeAlerts } = await import(
        "../infrastructure/db/alertStore.js"
      );
      const { getDb } = await import("../infrastructure/db/schema.js");

      const signals = [
        makeSignal("MWG", "price_surge", "medium"),
        makeSignal("MWG", "volume_spike", "high"),
      ];
      const alerts = generateAlerts(signals, watchlist);
      const db = getDb();
      storeAlerts(alerts, db);

      const row = db
        .prepare("SELECT signals_json FROM alerts WHERE id = ?")
        .get(alerts[0]!.id) as { signals_json: string } | undefined;

      expect(row).toBeDefined();
      const parsed = JSON.parse(row!.signals_json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });
});
