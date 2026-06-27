/**
 * TASK-FFT-L3A — useFreshnessRevalidator unit tests.
 *
 * Coverage:
 *   A. Tiers with clientRefreshMs > 0 → setInterval called (realtime, intraday, event)
 *   B. Tiers with clientRefreshMs = null → NO setInterval (daily, weekly, static) — EC-5
 *   C. Cleanup: clearInterval called on unmount (no memory leak) — NFR-A2
 *
 * useRevalidator from @remix-run/react is mocked via vi.hoisted so the factory
 * has access to the stub before any module imports resolve.
 *
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 * Task:   TASK-FFT-L3A
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import type { SlaTierKey } from "~/lib/hooks/useFreshnessRevalidator";

// ---------------------------------------------------------------------------
// Mock @remix-run/react — vi.hoisted ensures the fn exists before imports
// ---------------------------------------------------------------------------

const mockRevalidate = vi.hoisted(() => vi.fn());

vi.mock("@remix-run/react", () => ({
  useRevalidator: () => ({ state: "idle", revalidate: mockRevalidate }),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  mockRevalidate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// A. Tiers with clientRefreshMs → interval fires
// ---------------------------------------------------------------------------

describe("useFreshnessRevalidator — tiers WITH client refresh interval", () => {
  const ACTIVE_TIERS: { tier: SlaTierKey; refreshMs: number }[] = [
    { tier: "realtime", refreshMs: 60_000 },
    { tier: "intraday", refreshMs: 300_000 },
    { tier: "event", refreshMs: 300_000 },
  ];

  for (const { tier, refreshMs } of ACTIVE_TIERS) {
    it(`${tier}: revalidate() called after ${refreshMs}ms`, () => {
      renderHook(() => useFreshnessRevalidator(tier));

      // No call before interval fires
      expect(mockRevalidate).not.toHaveBeenCalled();

      // Advance by one full interval
      act(() => {
        vi.advanceTimersByTime(refreshMs);
      });

      expect(mockRevalidate).toHaveBeenCalledTimes(1);
    });

    it(`${tier}: revalidate() called again after 2× interval`, () => {
      renderHook(() => useFreshnessRevalidator(tier));

      act(() => {
        vi.advanceTimersByTime(refreshMs * 2);
      });

      expect(mockRevalidate).toHaveBeenCalledTimes(2);
    });
  }
});

// ---------------------------------------------------------------------------
// B. EC-5: Tiers without client refresh → NO interval
// ---------------------------------------------------------------------------

describe("useFreshnessRevalidator — EC-5: tiers WITHOUT client refresh", () => {
  const PASSIVE_TIERS: SlaTierKey[] = ["daily", "weekly", "static"];

  for (const tier of PASSIVE_TIERS) {
    it(`${tier}: no interval set — revalidate() never called even after 24h`, () => {
      renderHook(() => useFreshnessRevalidator(tier));

      act(() => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours
      });

      expect(mockRevalidate).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// C. NFR-A2: cleanup on unmount — no memory leak
// ---------------------------------------------------------------------------

describe("useFreshnessRevalidator — NFR-A2: cleanup on unmount", () => {
  it("clears interval when component unmounts (realtime tier)", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useFreshnessRevalidator("realtime"));

    // Confirm interval was active
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);

    // Unmount — cleanup must fire
    unmount();

    // After unmount, advancing timers must NOT trigger more calls
    const callsBefore = mockRevalidate.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000 * 5);
    });
    expect(mockRevalidate.mock.calls.length).toBe(callsBefore); // no new calls

    // clearInterval must have been called (NFR-A2)
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("does NOT call setInterval for static tier (EC-5)", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const { unmount } = renderHook(() => useFreshnessRevalidator("static"));
    unmount();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it("clears interval on unmount (event tier — 300s)", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useFreshnessRevalidator("event"));

    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);

    unmount();

    const callsBefore = mockRevalidate.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(300_000 * 3);
    });
    expect(mockRevalidate.mock.calls.length).toBe(callsBefore);
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});
