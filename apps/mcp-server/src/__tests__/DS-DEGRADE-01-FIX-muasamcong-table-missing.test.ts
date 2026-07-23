/**
 * DS-DEGRADE-01-FIX — public_contracts table missing from live schema init.
 *
 * Root cause (RAW-verified at source, see docs/agent-memory/decisions/
 * sprint-DS-DEGRADE-01-FIX-dev-mcp-server.md): publicContractsStore.ts
 * (writer) and publicInvestmentTools.ts's get_public_contracts stale-vs-empty
 * SLA check (reader, added 2026-06-10 commit 815ccaedd — comment
 * "DS-DEGRADE-01 FIX") both target a `public_contracts` table that was NEVER
 * created by any schema-*.ts initXTables() function wired into
 * initDatabase(). The only place `CREATE TABLE public_contracts` existed was
 * a test-local `makeTestDb()` helper in taskB-public-contracts-job.test.ts,
 * which builds its own isolated :memory: Database — completely bypassing the
 * real initDatabase()/getDb() path and masking the gap from every prior test
 * run (including 1982-quality-burndown-CHIJ.test.ts's FIX 5 suite, which
 * only asserts "stale OR unavailable" — a vacuous check that passes either
 * way and never actually seeds a stale row through the real schema).
 *
 * Runtime probe (this task) against the REAL initDatabase() path confirmed:
 * `SELECT ... FROM public_contracts` and `INSERT INTO public_contracts`
 * both threw "no such table: public_contracts". The SELECT is caught
 * silently in getPublicContractsHandler's try/catch (publicInvestmentTools.ts
 * lines 61-93) and falls through to the generic {unavailable:true} branch —
 * so the designed stale:true/degraded signal for an empty-upstream-while-
 * stale-stored condition could NEVER fire in production, defeating the
 * entire intent of the 2026-06-10 fix.
 *
 * Fix: schema-macro.ts now registers `public_contracts` (exact column set
 * mirrors the pre-existing test fixture — no drift) inside initMacroTables(),
 * which initDatabase() already calls. No change to publicContractsStore.ts
 * or publicInvestmentTools.ts — the previously-written degradation logic is
 * now reachable.
 *
 * Covered cases (through the REAL initDatabase()/getDb() path — not a
 * hand-rolled isolated :memory: DB, to actually exercise the schema wire-up).
 * Order matters: TC-2 (zero rows) MUST run before TC-3 seeds a row into the
 * shared module-level getDb() singleton, since get_public_contracts always
 * reads via that singleton — bun:test runs `it` blocks within a `describe`
 * sequentially in declaration order (no test.concurrent used here):
 *   TC-1: table exists after initDatabase() (regression guard for the gap itself)
 *   TC-2: empty upstream + NO stored row yet -> {unavailable:true} (genuinely no data)
 *   TC-3: empty upstream + stale stored row (age > SLA) -> {stale:true, stale_since, source}
 *   TC-4: non-empty upstream -> normal contract-listing text path unaffected (not stale/unavailable JSON)
 *   TC-5: storePublicContracts() write succeeds (was throwing "no such table" before the fix)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll } from "bun:test";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import { getPublicContractsHandler } from "../interface/mcp/tools/sector/publicInvestmentTools.js";
import { storePublicContracts } from "../infrastructure/db/publicContractsStore.js";

beforeAll(async () => {
  await initDatabase();
});

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe("DS-DEGRADE-01-FIX — public_contracts schema wiring", () => {
  it("TC-1: public_contracts table exists after real initDatabase()", () => {
    const db = getDb();
    const tbl = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='public_contracts'")
      .get();
    expect(tbl).not.toBeNull();
  });

  it("TC-2: empty upstream + no stored row yet -> unavailable:true (genuinely no data, distinct from stale)", async () => {
    // Must run BEFORE TC-3 seeds a row — public_contracts is empty at this point
    // (fresh :memory: DB from initDatabase() in beforeAll, no writer has run yet).
    const db = getDb();
    const preCount = db.query("SELECT COUNT(*) as n FROM public_contracts").get() as { n: number };
    expect(preCount.n).toBe(0);

    const result = await getPublicContractsHandler({
      _testHtml: "<html><body>no rows this cycle</body></html>",
    });

    const parsed = parseJson(result.content[0]?.text ?? "");
    expect(parsed).not.toBeNull();
    expect(parsed!["unavailable"]).toBe(true);
    expect(parsed!["stale"]).toBeUndefined();
  });

  it("TC-3: empty upstream + stale stored row (age > 168h SLA) -> stale:true (not fresh, not silently empty)", async () => {
    const db = getDb();
    // Seed a row whose fetched_at is 10 days old — well past the 7-day SLA.
    db.run(`
      INSERT INTO public_contracts (title, value, category, agency, winner, award_date, related_stocks, fetched_at)
      VALUES ('tc3-stale-seed', 1, 'other', 'a', 'w', '2026-01-01', '[]', datetime('now', '-10 days'))
    `);

    const result = await getPublicContractsHandler({
      _testHtml: "<html><body>no rows this cycle</body></html>",
    });

    const parsed = parseJson(result.content[0]?.text ?? "");
    expect(parsed).not.toBeNull();
    expect(parsed!["stale"]).toBe(true);
    expect(parsed!["source"]).toBe("muasamcong");
    expect(typeof parsed!["stale_since"]).toBe("string");
    // MUST NOT be silently reported as fresh/empty-with-no-signal.
    expect(parsed!["unavailable"]).toBeUndefined();
  });

  it("TC-4: non-empty upstream is unaffected (normal listing path, not stale/unavailable JSON)", async () => {
    const html =
      '<table class="table-result"><tr><td>header</td></tr>' +
      "<tr><td>Gói thầu cao tốc test</td><td>1.000.000.000</td><td>Bộ GTVT</td>" +
      "<td>HHV Corp</td><td>2026-07-20</td></tr></table>";

    const result = await getPublicContractsHandler({ _testHtml: html });
    const text = result.content[0]?.text ?? "";

    expect(text).toContain("KẾT QUẢ CHỌN NHÀ THẦU");
    expect(text).toContain("Gói thầu cao tốc test");
    const parsed = parseJson(text);
    expect(parsed).toBeNull(); // plain listing text, not the stale/unavailable JSON shape
  });

  it("TC-5: storePublicContracts() write succeeds against the real schema (was 'no such table' before the fix)", () => {
    const db = getDb();
    const result = storePublicContracts(db, [
      {
        title: "tc5-store-write-probe",
        value: 1,
        category: "other",
        agency: "a",
        winner: "w",
        awardDate: "2026-07-21",
        relatedStocks: [],
      },
    ]);
    expect(result.attempted).toBe(1);
    expect(result.inserted).toBe(1);

    const row = db
      .query<{ title: string }, [string]>(
        "SELECT title FROM public_contracts WHERE title = ?",
      )
      .get("tc5-store-write-probe");
    expect(row?.title).toBe("tc5-store-write-probe");
  });
});
