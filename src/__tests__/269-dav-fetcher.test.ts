process.env["DB_PATH"] = ":memory:";

/**
 * Task 269 — DAV Pharmacy Fetcher + Pharma Store
 *
 * Tests for:
 *   - fetchDavPharmacy: Cheerio scraper for dav.gov.vn (mockable)
 *   - pharmaStore: SQLite CRUD for pharma_events table
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { fetchDavPharmacy, type DrugApproval } from "../infrastructure/fetchers/davPharmacy.js";
import {
  insertPharmaEvent,
  getPharmaEvents,
  type PharmaEventRow,
} from "../infrastructure/db/pharmaStore.js";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// DAV Fetcher tests (mock HTTP client)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal HTML simulating a DAV drug approval listing page */
const DAV_SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="drug-approval-list">
    <table>
      <tbody>
        <tr>
          <td>SD-1234/2024</td>
          <td>Amoxicillin 500mg</td>
          <td>Dược Hậu Giang</td>
          <td>2024-10-15</td>
          <td>generic</td>
        </tr>
        <tr>
          <td>SD-5678/2024</td>
          <td>Clarithromycin 250mg</td>
          <td>Imexpharm</td>
          <td>2024-10-16</td>
          <td>generic</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="news-item">
    <h3>Công bố phê duyệt thuốc mới của Traphaco</h3>
    <p>Cục Quản lý Dược đã phê duyệt đăng ký lưu hành sản phẩm của Traphaco.</p>
  </div>
  <div class="news-item">
    <h3>Giá trần thuốc nhập khẩu được điều chỉnh</h3>
    <p>Bộ Y tế ban hành thông tư điều chỉnh giá trần thuốc nhập khẩu nhóm 1.</p>
  </div>
</body>
</html>
`;

describe("Task 269 — DAV Pharmacy Fetcher", () => {
  it("returns empty array on network error (never throw)", async () => {
    const failingClient = {
      get: async (_url: string): Promise<string> => {
        throw new Error("Network timeout");
      },
    };
    const result = await fetchDavPharmacy(failingClient);
    expect(result).toBeArray();
    expect(result.length).toBe(0);
  });

  it("returns empty array on empty HTML response", async () => {
    const emptyClient = {
      get: async (_url: string): Promise<string> => "",
    };
    const result = await fetchDavPharmacy(emptyClient);
    expect(result).toBeArray();
    expect(result.length).toBe(0);
  });

  it("parses drug approvals from structured HTML", async () => {
    const mockClient = {
      get: async (_url: string): Promise<string> => DAV_SAMPLE_HTML,
    };
    const result = await fetchDavPharmacy(mockClient);
    expect(result).toBeArray();
    // Should return at least one drug approval
    expect(result.length).toBeGreaterThan(0);
  });

  it("maps Dược Hậu Giang to DHG stock code", async () => {
    const mockClient = {
      get: async (_url: string): Promise<string> => DAV_SAMPLE_HTML,
    };
    const result = await fetchDavPharmacy(mockClient);
    const dhgApproval = result.find((d: DrugApproval) => d.relatedStocks.includes("DHG"));
    expect(dhgApproval).toBeDefined();
  });

  it("maps Imexpharm to IMP stock code", async () => {
    const mockClient = {
      get: async (_url: string): Promise<string> => DAV_SAMPLE_HTML,
    };
    const result = await fetchDavPharmacy(mockClient);
    const impApproval = result.find((d: DrugApproval) => d.relatedStocks.includes("IMP"));
    expect(impApproval).toBeDefined();
  });

  it("DrugApproval has required fields", async () => {
    const mockClient = {
      get: async (_url: string): Promise<string> => DAV_SAMPLE_HTML,
    };
    const result = await fetchDavPharmacy(mockClient);
    if (result.length > 0) {
      const first = result[0]!;
      expect(typeof first.drugName).toBe("string");
      expect(typeof first.manufacturer).toBe("string");
      expect(Array.isArray(first.relatedStocks)).toBe(true);
    }
  });

  it("returns empty array when HTML has no recognisable drug data", async () => {
    const noDataHtml = "<html><body><p>No data here</p></body></html>";
    const mockClient = {
      get: async (_url: string): Promise<string> => noDataHtml,
    };
    const result = await fetchDavPharmacy(mockClient);
    expect(result).toBeArray();
    // No crash — graceful empty result
    expect(result.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pharma Store tests (in-memory SQLite via singleton)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 269 — Pharma Store", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("creates pharma_events table without error", () => {
    // initDatabase already ran — just verify table exists
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pharma_events'",
      )
      .all();
    expect(tables.length).toBe(1);
  });

  it("inserts a pharma event and retrieves it", () => {
    const event: PharmaEventRow = {
      event_type: "drug_approval",
      drug_name: "Amoxicillin 500mg",
      manufacturer: "Dược Hậu Giang",
      stock_code: "DHG",
      approval_date: "2024-10-15",
      description: "New generic drug approval for DHG",
      severity: "medium",
    };
    insertPharmaEvent(db, event);
    const rows = getPharmaEvents(db);
    expect(rows.length).toBe(1);
    expect(rows[0]!.drug_name).toBe("Amoxicillin 500mg");
    expect(rows[0]!.stock_code).toBe("DHG");
  });

  it("filters by stock_code", () => {
    insertPharmaEvent(db, {
      event_type: "drug_approval",
      drug_name: "Drug A",
      manufacturer: "DHG",
      stock_code: "DHG",
      approval_date: null,
      description: "DHG drug",
      severity: "low",
    });
    insertPharmaEvent(db, {
      event_type: "outbreak",
      drug_name: null,
      manufacturer: null,
      stock_code: "IMP",
      approval_date: null,
      description: "Outbreak signal for IMP",
      severity: "high",
    });

    const dhgRows = getPharmaEvents(db, { stockCode: "DHG" });
    expect(dhgRows.length).toBe(1);
    expect(dhgRows[0]!.stock_code).toBe("DHG");

    const impRows = getPharmaEvents(db, { stockCode: "IMP" });
    expect(impRows.length).toBe(1);
    expect(impRows[0]!.stock_code).toBe("IMP");
  });

  it("filters by days lookback", () => {
    // Insert an old event (31 days ago)
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    db.run(
      `INSERT INTO pharma_events (event_type, description, severity, created_at)
       VALUES ('drug_approval', 'Old event', 'low', ?)`,
      [oldDate],
    );
    // Insert a recent event
    insertPharmaEvent(db, {
      event_type: "outbreak",
      drug_name: null,
      manufacturer: null,
      stock_code: "DHG",
      approval_date: null,
      description: "Recent outbreak",
      severity: "high",
    });

    const rows30 = getPharmaEvents(db, { days: 30 });
    // Old event should be excluded
    expect(rows30.every((r) => r.description !== "Old event")).toBe(true);
  });
});
