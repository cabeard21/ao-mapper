import { describe, expect, it } from "vitest";
import { connectionTypes, durationOptions } from "./AddConnectionModal";

describe("connectionTypes", () => {
  it("has exactly two portal types", () => {
    expect(connectionTypes).toHaveLength(2);
  });

  it("includes 7 player portal", () => {
    expect(connectionTypes).toContainEqual({ value: "PORTAL_7", label: "7 player" });
  });

  it("includes 20 player portal", () => {
    expect(connectionTypes).toContainEqual({ value: "PORTAL_20", label: "20 player" });
  });

  it("does not include legacy types", () => {
    const values = connectionTypes.map((t) => t.value);
    expect(values).not.toContain("BZ_PORTAL");
    expect(values).not.toContain("ROYAL_ROAD");
    expect(values).not.toContain("AVALON_ROAD");
  });
});

describe("durationOptions", () => {
  it("has 25 options (Permanent plus 1–24 hours)", () => {
    expect(durationOptions).toHaveLength(25);
  });

  it("first option is Permanent with empty value", () => {
    expect(durationOptions[0]).toEqual({ value: "", label: "Permanent" });
  });

  it("1-hour option uses singular label", () => {
    expect(durationOptions[1]).toEqual({ value: "1", label: "1 hour" });
  });

  it("2-hour option uses plural label", () => {
    expect(durationOptions[2]).toEqual({ value: "2", label: "2 hours" });
  });

  it("24-hour option is the last option", () => {
    expect(durationOptions[24]).toEqual({ value: "24", label: "24 hours" });
  });
});
