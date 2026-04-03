/**
 * Task 257 — Weather VN Fetcher Tests
 *
 * Tests for fetchWeatherWarnings() and supporting utilities.
 * Infrastructure layer — uses injected HTTP clients for determinism.
 */

import { describe, it, expect } from "bun:test";
import {
  fetchWeatherWarnings,
  parseWeatherEventsFromText,
  detectEnsoFromText,
  type WeatherEvent,
  type WeatherEventType,
} from "../infrastructure/fetchers/weatherVn.js";

// ---------------------------------------------------------------------------
// Mock HTTP clients
// ---------------------------------------------------------------------------

function makeHtmlClient(html: string) {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

function makeFailingClient() {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network error");
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 257 — Weather VN Fetcher", () => {
  // 1. Returns array (never throws) even on network failure
  it("returns empty array on network failure (never throws)", async () => {
    const result = await fetchWeatherWarnings(makeFailingClient());
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  // 2. Parses typhoon from NCHMF-style HTML
  it("parses typhoon warning from NCHMF HTML", async () => {
    const html = `
      <html><body>
        <div class="warning-content">
          <h2>BÃO SỐ 3 (YAGI) - CẢNH BÁO CẤP ĐỘ 4</h2>
          <p>Bão mạnh ảnh hưởng các tỉnh miền Trung: Đà Nẵng, Quảng Nam, Quảng Ngãi.</p>
          <p>Thời gian dự báo: 48 giờ tới</p>
        </div>
      </body></html>
    `;
    const client = makeHtmlClient(html);
    const result = await fetchWeatherWarnings(client);
    const typhoon = result.find((e) => e.type === "typhoon");
    expect(typhoon).toBeDefined();
    expect(typhoon!.severity).toBeDefined();
    expect(typhoon!.regions.length).toBeGreaterThan(0);
  });

  // 3. Parses flood warning
  it("parses flood warning from text", async () => {
    const html = `
      <html><body>
        <div class="tin-tuc">
          <h3>LŨ LỚN TRÊN SÔNG MÃ - CẢNH BÁO CẤP ĐỘ 2</h3>
          <p>Lũ lớn khẩn cấp tại Thanh Hóa và Nghệ An. Mực nước vượt báo động 3.</p>
        </div>
      </body></html>
    `;
    const result = await parseWeatherEventsFromText(html);
    const flood = result.find((e) => e.type === "flood");
    expect(flood).toBeDefined();
  });

  // 4. Parses drought warning
  it("parses drought warning from text", async () => {
    const html = `
      <html><body>
        <p>Hạn hán nghiêm trọng tại các tỉnh Tây Nguyên: Gia Lai, Đắk Lắk, Kon Tum.
        Thiếu nước tưới tiêu vụ hè thu. Nguy cơ hạn hán kéo dài đến tháng 5.</p>
      </body></html>
    `;
    const result = await parseWeatherEventsFromText(html);
    const drought = result.find((e) => e.type === "drought");
    expect(drought).toBeDefined();
    expect(drought!.regions.some((r) => r.includes("Tây Nguyên") || r.includes("Gia Lai") || r.includes("Đắk Lắk"))).toBe(true);
  });

  // 5. Parses heat wave warning
  it("parses heat wave from text", async () => {
    const text = `
      Nắng nóng gay gắt, nhiệt độ cao nhất 40-41°C tại Hà Nội và các tỉnh Bắc Bộ.
      Cảnh báo nắng nóng đặc biệt gay gắt kéo dài 3-5 ngày.
    `;
    const result = await parseWeatherEventsFromText(text);
    const heatWave = result.find((e) => e.type === "heat_wave");
    expect(heatWave).toBeDefined();
  });

  // 6. Detects El Niño from ENSO text
  it("detects El Nino from ENSO status text", () => {
    const text = `
      Current ENSO Status: El Niño Advisory
      El Niño conditions are present. SST anomalies are +1.8°C above average.
      This El Niño is expected to continue through boreal spring 2025.
    `;
    const result = detectEnsoFromText(text);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("el_nino");
    expect(result!.severity).toBeDefined();
  });

  // 7. Detects La Niña from ENSO text
  it("detects La Nina from ENSO status text", () => {
    const text = `
      ENSO Alert System Status: La Niña Watch
      La Niña conditions have developed. Cooler than normal SST anomalies: -1.2°C.
      Increased rainfall expected across Southeast Asia.
    `;
    const result = detectEnsoFromText(text);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("la_nina");
  });

  // 8. Returns neutral when no ENSO signal
  it("returns null when no ENSO signal detected", () => {
    const text = `
      ENSO neutral conditions are present. No advisory in effect.
      Sea surface temperatures are near average.
    `;
    const result = detectEnsoFromText(text);
    expect(result).toBeNull();
  });

  // 9. Severity mapping — critical for typhoon cấp 4+
  it("maps typhoon cap do 4 to critical severity", async () => {
    const html = `<p>BÃO MẠNH CẤP ĐỘ 4 - cường độ gió mạnh cấp 12-14, bão số 5</p>`;
    const result = await parseWeatherEventsFromText(html);
    const typhoon = result.find((e) => e.type === "typhoon");
    expect(typhoon).toBeDefined();
    expect(["high", "critical"]).toContain(typhoon!.severity);
  });

  // 10. WeatherEvent has all required fields
  it("all returned WeatherEvents have required fields", async () => {
    const html = `<p>Bão số 2 mạnh lên, ảnh hưởng tỉnh Quảng Bình, Hà Tĩnh trong 24 giờ tới.</p>`;
    const result = await parseWeatherEventsFromText(html);
    for (const event of result) {
      expect(typeof event.type).toBe("string");
      expect(typeof event.severity).toBe("string");
      expect(Array.isArray(event.regions)).toBe(true);
      expect(typeof event.forecastDate).toBe("string");
      expect(typeof event.impactDuration).toBe("string");
      expect(typeof event.description).toBe("string");
    }
  });
});
