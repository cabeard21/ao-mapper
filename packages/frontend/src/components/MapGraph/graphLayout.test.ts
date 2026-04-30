import { describe, expect, it } from "vitest";
import { readableLayoutOptions, shouldLayoutAfterRouteVisualEdges } from "./graphLayout";

describe("graphLayout", () => {
  it("uses deterministic spacing-oriented settings for automatic layout", () => {
    expect(readableLayoutOptions).toMatchObject({
      name: "fcose",
      fit: true,
      randomize: false,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: 140,
      nodeRepulsion: 8_388_608,
      tilingPaddingVertical: 42,
      tilingPaddingHorizontal: 42,
    });
  });

  it("reruns layout after route-only visual edges are added", () => {
    expect(shouldLayoutAfterRouteVisualEdges(0)).toBe(false);
    expect(shouldLayoutAfterRouteVisualEdges(2)).toBe(true);
  });
});
