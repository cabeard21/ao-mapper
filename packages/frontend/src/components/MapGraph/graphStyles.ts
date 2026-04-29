import type cytoscape from "cytoscape";

export const graphStyles: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": "#1a1a2e",
      "background-image": "data(icon)",
      "background-fit": "contain",
      "background-opacity": 0.72,
      label: "data(label)",
      color: "#ffffff",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-weight": 500,
      width: 40,
      height: 40,
      "border-width": 2,
      "border-color": "#2a2a3e",
      "text-outline-color": "#0d0d1a",
      "text-outline-width": 2,
    },
  },
  {
    selector: 'node[zoneType="royal"]',
    style: { "background-color": "#4488ff" },
  },
  {
    selector: 'node[zoneType="black"]',
    style: { "background-color": "#444444" },
  },
  {
    selector: 'node[zoneType="red"]',
    style: { "background-color": "#cc3333" },
  },
  {
    selector: 'node[zoneType="yellow"]',
    style: { "background-color": "#ccaa22" },
  },
  {
    selector: 'node[zoneType="blue"]',
    style: { "background-color": "#7799ff" },
  },
  {
    selector: 'node[zoneType="roads"]',
    style: { "background-color": "#aa44cc" },
  },
  {
    selector: 'node[zoneType="unknown"]',
    style: { "background-color": "#666666" },
  },
  {
    selector: "node.selected",
    style: { "border-color": "#ffffff", "border-width": 3 },
  },
  {
    selector: "node.current-zone",
    style: { "border-color": "#00ff88", "border-width": 4 },
  },
  {
    selector: "node.connection-source",
    style: { "border-color": "#38bdf8", "border-width": 4 },
  },
  {
    selector: "node.dimmed",
    style: { opacity: 0.3 },
  },
  {
    selector: "node.route-node",
    style: { "border-color": "#ffd700", "border-width": 3 },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "unbundled-bezier",
      "line-color": "#888",
      width: 2,
      label: "data(label)",
      color: "#ffffff",
      "font-size": 10,
      "text-background-color": "#0d0d1a",
      "text-background-opacity": 0.7,
      "text-background-padding": "2px",
      "target-arrow-color": "#888",
      "target-arrow-shape": "triangle",
    },
  },
  {
    selector: 'edge[connType="PORTAL_7"]',
    style: {
      "line-color": "#4488ff",
      "target-arrow-color": "#4488ff",
    },
  },
  {
    selector: 'edge[connType="PORTAL_20"]',
    style: {
      "line-color": "#ff8800",
      "target-arrow-color": "#ff8800",
    },
  },
  {
    selector: "edge.timed",
    style: { "line-style": "dashed" },
  },
  {
    selector: "edge.time-low",
    style: { color: "#ff4444" },
  },
  {
    selector: "edge.route-edge",
    style: {
      "line-color": "#ffd700",
      "target-arrow-color": "#ffd700",
      width: 4,
    },
  },
];
