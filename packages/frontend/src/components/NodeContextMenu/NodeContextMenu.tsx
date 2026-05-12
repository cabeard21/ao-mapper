import type { CSSProperties } from "react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useMapStore } from "../../store/mapStore";

export function NodeContextMenu() {
  const queryClient = useQueryClient();
  const nodeContextMenu = useMapStore((s) => s.nodeContextMenu);
  const nodes = useMapStore((s) => s.nodes);
  const homeZoneId = useMapStore((s) => s.homeZoneId);
  const fromZone = useMapStore((s) => s.routePlannerFromZone);
  const toZone = useMapStore((s) => s.routePlannerToZone);
  const setHomeZoneId = useMapStore((s) => s.setHomeZoneId);
  const setRoutePlannerFromZone = useMapStore((s) => s.setRoutePlannerFromZone);
  const setRoutePlannerToZone = useMapStore((s) => s.setRoutePlannerToZone);
  const closeNodeContextMenu = useMapStore((s) => s.closeNodeContextMenu);

  if (!nodeContextMenu) return null;

  const node = nodes.find((candidate) => candidate.id === nodeContextMenu.nodeId);
  if (!node) return null;

  const isHomeZone = nodeContextMenu.nodeId === homeZoneId;
  const isFromZone = nodeContextMenu.nodeId === fromZone?.id;
  const isToZone = nodeContextMenu.nodeId === toZone?.id;

  const handleSetFrom = () => {
    setRoutePlannerFromZone(node.zone);
    closeNodeContextMenu();
  };

  const handleSetTo = () => {
    setRoutePlannerToZone(node.zone);
    closeNodeContextMenu();
  };

  const handleSetHome = async () => {
    try {
      await axios.put("/api/settings/home-zone", { zoneId: nodeContextMenu.nodeId });
      setHomeZoneId(nodeContextMenu.nodeId);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch {
      /* best-effort: localhost tool, API error is transient */
    } finally {
      closeNodeContextMenu();
    }
  };

  const handleClearHome = async () => {
    try {
      await axios.delete("/api/settings/home-zone");
      setHomeZoneId(null);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch {
      /* best-effort */
    } finally {
      closeNodeContextMenu();
    }
  };

  return (
    <div
      style={{
        ...menuStyle,
        left: nodeContextMenu.x,
        top: nodeContextMenu.y,
      }}
    >
      <button
        type="button"
        style={isFromZone ? activeItemStyle : itemStyle}
        onClick={handleSetFrom}
        disabled={isFromZone}
      >
        Set as From
      </button>
      <button
        type="button"
        style={isToZone ? activeItemStyle : itemStyle}
        onClick={handleSetTo}
        disabled={isToZone}
      >
        Set as To
      </button>
      <div style={separatorStyle} />
      <button
        type="button"
        style={isHomeZone ? activeItemStyle : itemStyle}
        onClick={isHomeZone ? handleClearHome : handleSetHome}
      >
        {isHomeZone ? "Clear home zone" : "Set as home zone"}
      </button>
    </div>
  );
}

const menuStyle = {
  position: "absolute",
  zIndex: 30,
  minWidth: 160,
  border: "1px solid #334155",
  borderRadius: 6,
  padding: 4,
  background: "#111827",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
} satisfies CSSProperties;

const itemStyle = {
  display: "block",
  width: "100%",
  border: 0,
  borderRadius: 4,
  padding: "8px 10px",
  background: "transparent",
  color: "#f8fafc",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
} satisfies CSSProperties;

const separatorStyle = {
  height: 1,
  margin: "4px 2px",
  background: "#273247",
} satisfies CSSProperties;

const activeItemStyle = {
  ...itemStyle,
  color: "#ffd700",
  cursor: "default",
} satisfies CSSProperties;
