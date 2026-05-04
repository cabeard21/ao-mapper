import type { CSSProperties } from "react";
import { useMapStore } from "../../store/mapStore";

export function MapControls() {
  const nodes = useMapStore((s) => s.nodes);
  const currentZoneId = useMapStore((s) => s.currentZoneId);
  const homeZoneId = useMapStore((s) => s.homeZoneId);
  const triggerViewport = useMapStore((s) => s.triggerViewport);
  const pruneIsolatedNodes = useMapStore((s) => s.pruneIsolatedNodes);

  const homeNodeOnMap = homeZoneId != null && nodes.some((n) => n.id === homeZoneId);
  const hasNodes = nodes.length > 0;

  return (
    <div style={toolbarStyle}>
      <button
        type="button"
        title="Go to current zone"
        disabled={currentZoneId == null}
        onClick={() => currentZoneId && triggerViewport({ type: "center", nodeId: currentZoneId })}
        style={currentZoneId != null ? buttonStyle : disabledButtonStyle}
      >
        ⊕
      </button>
      <button
        type="button"
        title="Go to home zone"
        disabled={!homeNodeOnMap}
        onClick={() => homeZoneId && triggerViewport({ type: "center", nodeId: homeZoneId })}
        style={homeNodeOnMap ? buttonStyle : disabledButtonStyle}
      >
        ⌂
      </button>
      <button
        type="button"
        title="Fit all nodes"
        disabled={!hasNodes}
        onClick={() => triggerViewport({ type: "fit" })}
        style={hasNodes ? buttonStyle : disabledButtonStyle}
      >
        ⊞
      </button>
      <button
        type="button"
        title="Clean up isolated nodes"
        onClick={() => pruneIsolatedNodes()}
        style={buttonStyle}
      >
        ✕
      </button>
    </div>
  );
}

const toolbarStyle = {
  position: "absolute",
  bottom: 16,
  left: 16,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
} satisfies CSSProperties;

const buttonStyle = {
  width: 36,
  height: 36,
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#182033",
  color: "#f8fafc",
  cursor: "pointer",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} satisfies CSSProperties;

const disabledButtonStyle = {
  ...buttonStyle,
  opacity: 0.4,
  cursor: "default",
} satisfies CSSProperties;
