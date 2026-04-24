Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/249-ssc-insider.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchInsiderTransactions,
  type RawInsiderRow,
} from "../infrastructure/fetchers/sscInsider.js";
import {
  insertInsiderTransaction,
  getInsiderTransactions,
  hasInsiderTransaction,
  type InsiderRow,
} from "../infrastructure/db/insiderStore.js";
import { Database } from "bun:sqlite";

// ── Mock HTML ──────────────────────────────────────────────────────────────

const MOCK_HTML = `
<html><body>
<table id="ctl00_ContentPlaceHolder1_GridView1">
  <tr>
    <th>Mã CK</th><th>Người giao dịch</th><th>Chức vụ</th>
    <th>Loại GD</th><th>SL đăng ký</th><th>SL thực hiện</th>
    <th>Giá</th><th>Từ ngày</th><th>Đến ngày</th>
  </tr>
  <tr>
    <td>VCB</td>
    <td>Nguyễn Văn A</td>
    <td>Chủ tịch HĐQT</td>
    <td>Mua</td>
    <td>5.000.000</td>
    <td>4.800.000</td>
    <td>80.000</td>
    <td>2026-03-01</td>
    <td>2026-03-15</td>
  </tr>
  <tr>
    <td>HPG</td>
    <td>Trần Thị B</td>
    <td>Tổng Giám đốc</td>
    <td>Bán</td>
    <td>2.000.000</td>
    <td>2.000.000</td>
    <td>25.000</td>
    <td>2026-03-10</td>
    <td>2026-03-20</td>
  </tr>
</table>
</body></html>
`;

const EMPTY_HTML = `<html><body><p>Không có dữ liệu</p></body></html>`;

function makeClient(html: string) {
  return { get: async () => html };
}

// ── In-memory DB for store tests ─────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id           TEXT PRIMARY KEY,
      code         TEXT NOT NULL,
      insider_name TEXT NOT NULL,
      position     TEXT NOT NULL,
      type         TEXT NOT NULL,
      registered_volume INTEGER NOT NULL DEFAULT 0,
      executed_volume   INTEGER NOT NULL DEFAULT 0,
      price        REAL NOT NULL DEFAULT 0,
      from_date    TEXT NOT NULL,
      to_date      TEXT NOT NULL,
      fetched_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_insider_code ON insider_transactions(code);
    CREATE INDEX IF NOT EXISTS idx_insider_from ON insider_transactions(from_date);
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 249 — SSC Insider Fetcher", () => {
  it("returns an array of RawInsiderRow", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    expect(Array.isArray(result)).toBe(true);
  });

  it("parses 2 rows from mock HTML", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    expect(result.length).toBe(2);
  });

  it("each row has required fields", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    for (const row of result) {
      expect(typeof row.code).toBe("string");
      expect(typeof row.insiderName).toBe("string");
      expect(typeof row.position).toBe("string");
      expect(typeof row.type).toBe("string");
      expect(typeof row.registeredVolume).toBe("number");
      expect(typeof row.executedVolume).toBe("number");
      expect(typeof row.price).toBe("number");
      expect(typeof row.fromDate).toBe("string");
      expect(typeof row.toDate).toBe("string");
    }
  });

  it("VCB row has correct code and type=buy", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    const vcb = result.find((r) => r.code === "VCB");
    expect(vcb).toBeDefined();
    expect(vcb!.type).toBe("buy");
  });

  it("HPG row has type=sell", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    const hpg = result.find((r) => r.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.type).toBe("sell");
  });

  it("volumes are parsed as numbers > 0", async () => {
    const result = await fetchInsiderTransactions(makeClient(MOCK_HTML));
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.registeredVolume).toBeGreaterThan(0);
    expect(vcb.executedVolume).toBeGreaterThan(0);
  });

  it("returns empty array on HTML with no data", async () => {
    const result = await fetchInsiderTransactions(makeClient(EMPTY_HTML));
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array when HTTP client throws", async () => {
    const badClient = {
      get: async () => {
        throw new Error("Network error");
      },
    };
    const result = await fetchInsiderTransactions(badClient);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 249 — InsiderStore", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  afterEach(() => {
    db.close();
  });

  const sampleRow: InsiderRow = {
    id: "VCB-NguyenVanA-2026-03-01",
    code: "VCB",
    insiderName: "Nguyen Van A",
    position: "Chairman",
    type: "buy",
    registeredVolume: 5_000_000,
    executedVolume: 4_800_000,
    price: 80_000,
    fromDate: "2026-03-01",
    toDate: "2026-03-15",
    fetchedAt: "2026-03-15T20:00:00Z",
  };

  it("inserts a row without throwing", () => {
    expect(() => insertInsiderTransaction(db, sampleRow)).not.toThrow();
  });

  it("getInsiderTransactions returns inserted row", () => {
    insertInsiderTransaction(db, sampleRow);
    const rows = getInsiderTransactions(db, "VCB");
    expect(rows.length).toBe(1);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[0]!.type).toBe("buy");
  });

  it("hasInsiderTransaction returns true after insert", () => {
    insertInsiderTransaction(db, sampleRow);
    expect(hasInsiderTransaction(db, sampleRow.id)).toBe(true);
  });

  it("hasInsiderTransaction returns false for unknown id", () => {
    expect(hasInsiderTransaction(db, "UNKNOWN-ID")).toBe(false);
  });

  it("duplicate insert is ignored (idempotent)", () => {
    insertInsiderTransaction(db, sampleRow);
    insertInsiderTransaction(db, sampleRow); // should not throw
    const rows = getInsiderTransactions(db, "VCB");
    expect(rows.length).toBe(1);
  });

  it("getInsiderTransactions returns rows for correct code only", () => {
    insertInsiderTransaction(db, sampleRow);
    insertInsiderTransaction(db, { ...sampleRow, id: "HPG-X-2026-03-01", code: "HPG" });
    const rows = getInsiderTransactions(db, "VCB");
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.code === "VCB")).toBe(true);
  });

  it("getInsiderTransactions with no code returns all", () => {
    insertInsiderTransaction(db, sampleRow);
    insertInsiderTransaction(db, { ...sampleRow, id: "HPG-X-2026-03-01", code: "HPG" });
    const rows = getInsiderTransactions(db);
    expect(rows.length).toBe(2);
  });
});
