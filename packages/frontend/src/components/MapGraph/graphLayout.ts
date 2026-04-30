import type cytoscape from "cytoscape";

export const readableLayoutOptions = {
  name: "fcose",
  nodeDimensionsIncludeLabels: true,
  idealEdgeLength: 140,
  nestingFactor: 0.5,
  fit: true,
  randomize: false,
  padding: 64,
  animate: true,
  animationDuration: 250,
  tilingPaddingVertical: 42,
  tilingPaddingHorizontal: 42,
  nodeRepulsion: 8_388_608,
  numIter: 2_097_152,
  uniformNodeDimensions: true,
  quality: "proof",
} as unknown as cytoscape.LayoutOptions;

export function shouldLayoutAfterRouteVisualEdges(routeVisualEdgeCount: number): boolean {
  return routeVisualEdgeCount > 0;
}
