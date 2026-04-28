import type { CSSProperties } from "react";
import { useMapStore } from "../../store/mapStore";

export function ConnectionToolbar() {
  const isConnectionDrawMode = useMapStore((s) => s.isConnectionDrawMode);
  const pendingConnectionFromNodeId = useMapStore((s) => s.pendingConnectionFromNodeId);
  const nodes = useMapStore((s) => s.nodes);
  const setConnectionDrawMode = useMapStore((s) => s.setConnectionDrawMode);

  const pendingNode = nodes.find((node) => node.id === pendingConnectionFromNodeId);

  return (
    <div style={toolbarStyle}>
      <button
        type="button"
        style={isConnectionDrawMode ? activeButtonStyle : buttonStyle}
        onClick={() => setConnectionDrawMode(!isConnectionDrawMode)}
      >
        {isConnectionDrawMode ? "Cancel connection" : "Draw connection"}
      </button>
      {isConnectionDrawMode ? (
        <span style={hintStyle}>
          {pendingNode ? `Select destination from ${pendingNode.label}` : "Select source zone"}
        </span>
      ) : null}
    </div>
  );
}

const toolbarStyle = {
  position: "absolute",
  left: 12,
  top: 12,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  gap: 8,
  maxWidth: "calc(100% - 24px)",
} satisfies CSSProperties;

const buttonStyle = {
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#182033",
  color: "#f8fafc",
  cursor: "pointer",
  fontSize: 13,
} satisfies CSSProperties;

const activeButtonStyle = {
  ...buttonStyle,
  border: "1px solid #38bdf8",
  background: "#075985",
} satisfies CSSProperties;

const hintStyle = {
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "8px 10px",
  background: "rgba(15, 23, 42, 0.92)",
  color: "#dbeafe",
  fontSize: 13,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} satisfies CSSProperties;

