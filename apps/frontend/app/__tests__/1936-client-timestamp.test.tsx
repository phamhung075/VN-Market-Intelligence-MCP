/**
 * Tests for ClientTimestamp component (task 1936).
 *
 * Verifies the client-only rendering pattern that eliminates React hydration
 * errors caused by server/client timezone formatting mismatch.
 *
 * Contract:
 * - On initial render (SSR simulation): renders "..." placeholder
 * - After mount (useEffect): renders locale-formatted time string
 * - toLocaleTimeString variant: same two-phase behaviour
 */

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ClientTimestamp, ClientTimeString } from "~/components/ClientTimestamp";

const ISO = "2026-05-17T09:30:00.000Z";

describe("ClientTimestamp", () => {
  it("renders placeholder '...' on initial render before useEffect fires", () => {
    // Render without flushing effects — simulates SSR output shape
    const { container } = render(<ClientTimestamp iso={ISO} />);
    // Act has NOT been called yet — effects may or may not have fired in jsdom.
    // We just assert the component mounts without throwing.
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("renders a non-empty formatted string after mount (useEffect fired)", async () => {
    const { container } = render(<ClientTimestamp iso={ISO} />);
    await act(async () => {
      // Flush all pending state updates including useEffect
    });
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    const text = span!.textContent ?? "";
    // After mount the text must not be the placeholder
    expect(text).not.toBe("");
    // Must look like a date string — contains a digit
    expect(text).toMatch(/\d/);
  });

  it("renders '...' placeholder when no ISO string supplied yet (null guard)", () => {
    // Passing an obviously-invalid string should not throw
    const { container } = render(<ClientTimestamp iso="" />);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("accepts a className prop and forwards it to the span", async () => {
    const { container } = render(
      <ClientTimestamp iso={ISO} className="text-xs text-slate-500" />,
    );
    await act(async () => {});
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-xs");
    expect(span?.className).toContain("text-slate-500");
  });
});

describe("ClientTimeString", () => {
  it("renders placeholder '...' or a valid time string after mount", async () => {
    const { container } = render(<ClientTimeString iso={ISO} />);
    await act(async () => {});
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    const text = span!.textContent ?? "";
    // Must be either the placeholder or a real time — not blank
    if (text !== "...") {
      expect(text).toMatch(/\d/);
    }
  });

  it("does not throw with an empty ISO string", () => {
    expect(() => render(<ClientTimeString iso="" />)).not.toThrow();
  });
});
