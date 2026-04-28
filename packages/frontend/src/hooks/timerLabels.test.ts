import { describe, expect, it } from "vitest";
import { formatConnectionLabel, formatRemainingTime } from "./timerLabels";

describe("timerLabels", () => {
  it("formats remaining time with hours and minutes", () => {
    const now = new Date("2026-04-28T12:00:00.000Z");
    const expiresAt = "2026-04-28T14:43:00.000Z";

    expect(formatRemainingTime(expiresAt, now)).toBe("2h 43m");
  });

  it("rounds sub-hour timers up to the next minute", () => {
    const now = new Date("2026-04-28T12:00:00.000Z");
    const expiresAt = "2026-04-28T12:00:30.000Z";

    expect(formatRemainingTime(expiresAt, now)).toBe("1m");
  });

  it("includes the connection type label for timed edges", () => {
    const now = new Date("2026-04-28T12:00:00.000Z");

    expect(
      formatConnectionLabel(
        {
          connType: "BZ_PORTAL",
          durationHours: 22,
          expiresAt: "2026-04-29T10:00:00.000Z",
        },
        now
      )
    ).toBe("BZ 22h");
  });

  it("uses only the type label for permanent edges", () => {
    expect(
      formatConnectionLabel({
        connType: "AVALON_ROAD",
        durationHours: null,
        expiresAt: null,
      })
    ).toBe("Avalon");
  });
});

