import { describe, expect, it } from "vitest";
import { formatCityDistance } from "./ZoneInfoPanel";

describe("formatCityDistance", () => {
  it("renders hop count only when meters are not present", () => {
    expect(formatCityDistance({ hops: 3 })).toBe("3 hops");
  });

  it("renders hop count and distance when meters are present", () => {
    expect(formatCityDistance({ hops: 3, meters: 148 })).toBe("3 hops · 148m");
  });
});
