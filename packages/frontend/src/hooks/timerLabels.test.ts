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
          connType: "PORTAL_7",
          durationHours: 2,
          expiresAt: "2026-04-28T14:00:00.000Z",
        },
        now
      )
    ).toBe("7 player 2h");
  });

  it("uses only the type label for permanent edges", () => {
    expect(
      formatConnectionLabel({
        connType: "PORTAL_20",
        durationHours: null,
        expiresAt: null,
      })
    ).toBe("20 player");
  });
});

