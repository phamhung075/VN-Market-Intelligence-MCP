Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { parseCongBaoHtml } from "../infrastructure/fetchers/congbao.js";
import { parseSbvHtml } from "../infrastructure/fetchers/sbvCircular.js";

describe("Task 1225 — congbao + sbvCircular circuit breaker and proxy", () => {
  // ── parseCongBaoHtml ─────────────────────────────────────────────────────

  it("parseCongBaoHtml: returns empty array for empty HTML", () => {
    const result = parseCongBaoHtml("");
    expect(result).toEqual([]);
  });

  it("parseCongBaoHtml: parses Nghị định link correctly", () => {
    const html = `<html><body>
      <a href="/van-ban/123">Nghị định 45/2024/ND-CP về quản lý thị trường</a>
    </body></html>`;
    const result = parseCongBaoHtml(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.category).toBe("Nghị định");
    expect(result[0]!.documentNumber).toBe("45/2024/ND-CP");
  });

  it("parseCongBaoHtml: parses Thông tư link correctly", () => {
    const html = `<html><body>
      <a href="/van-ban/456">Thông tư 12/2024/TT-BTC hướng dẫn về thuế</a>
    </body></html>`;
    const result = parseCongBaoHtml(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.category).toBe("Thông tư");
  });

  it("parseCongBaoHtml: deduplicates by documentNumber", () => {
    const html = `<html><body>
      <a href="/van-ban/1">Nghị định 10/2024/ND-CP về điều hành giá</a>
      <a href="/van-ban/2">Nghị định 10/2024/ND-CP về điều hành giá</a>
    </body></html>`;
    const result = parseCongBaoHtml(html);
    expect(result.length).toBe(1);
  });

  it("parseCongBaoHtml: skips short or irrelevant links", () => {
    const html = `<html><body>
      <a href="/home">Trang chủ</a>
      <a href="/about">Giới thiệu</a>
    </body></html>`;
    const result = parseCongBaoHtml(html);
    expect(result).toEqual([]);
  });

  // ── parseSbvHtml ─────────────────────────────────────────────────────────

  it("parseSbvHtml: returns empty array for empty HTML", () => {
    const result = parseSbvHtml("");
    expect(result).toEqual([]);
  });

  it("parseSbvHtml: parses TT-NHNN circular correctly", () => {
    const html = `<html><body>
      <a href="/tt-nhnn/05">Thông tư 05/2024/TT-NHNN quy định về tín dụng cho vay</a>
    </body></html>`;
    const result = parseSbvHtml(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.circularNumber).toMatch(/05\/2024\/TT-NHNN/i);
    expect(result[0]!.category).toBe("Tín dụng");
  });

  it("parseSbvHtml: classifies lãi suất correctly (no cho vay keyword)", () => {
    // "cho vay" triggers Tín dụng before "lãi suất" in classifyCircular priority order.
    // Use a title with only lãi suất to verify the category branch.
    const html = `<html><body>
      <a href="/tt-nhnn/03">Thông tư 03/2024/TT-NHNN điều chỉnh lãi suất cơ bản</a>
    </body></html>`;
    const result = parseSbvHtml(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.category).toBe("Lãi suất");
  });

  it("parseSbvHtml: deduplicates by circularNumber", () => {
    const html = `<html><body>
      <a href="/tt-nhnn/08a">Thông tư 08/2024/TT-NHNN về dự trữ bắt buộc</a>
      <a href="/tt-nhnn/08b">Thông tư 08/2024/TT-NHNN về dự trữ bắt buộc</a>
    </body></html>`;
    const result = parseSbvHtml(html);
    expect(result.length).toBe(1);
  });

  // ── Circuit breaker integration ──────────────────────────────────────────

  it("fetchCongBao: returns empty array when httpClient throws (geo-block simulation)", async () => {
    const { fetchCongBao } = await import("../infrastructure/fetchers/congbao.js");
    const fakeClient = {
      get: async (_url: string) => {
        throw new Error("ECONNREFUSED: geo-blocked from France");
      },
    };
    const result = await fetchCongBao(fakeClient);
    expect(result).toEqual([]);
  });

  it("fetchSbvCirculars: returns empty array when httpClient throws (geo-block simulation)", async () => {
    const { fetchSbvCirculars } = await import("../infrastructure/fetchers/sbvCircular.js");
    const fakeClient = {
      get: async (_url: string) => {
        throw new Error("ECONNREFUSED: geo-blocked from France");
      },
    };
    const result = await fetchSbvCirculars(fakeClient);
    expect(result).toEqual([]);
  });

  it("fetchCongBao: uses circuit breaker — breakers.congbao exists", async () => {
    const { breakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    expect(breakers).toHaveProperty("congbao");
  });

  it("fetchSbvCirculars: uses circuit breaker — breakers.sbvCircular exists", async () => {
    const { breakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    expect(breakers).toHaveProperty("sbvCircular");
  });
});
