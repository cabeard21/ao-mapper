import type { CSSProperties } from "react";
import { useConnectionActions } from "../../hooks/useConnectionActions";
import { useMapStore } from "../../store/mapStore";

export function EdgeContextMenu() {
  const edgeContextMenu = useMapStore((s) => s.edgeContextMenu);
  const edges = useMapStore((s) => s.edges);
  const closeEdgeContextMenu = useMapStore((s) => s.closeEdgeContextMenu);
  const openConnectionModal = useMapStore((s) => s.openConnectionModal);
  const { deleteConnection } = useConnectionActions();

  if (!edgeContextMenu) return null;

  const edge = edges.find((candidate) => candidate.id === edgeContextMenu.edgeId);
  if (!edge) return null;

  const openEditModal = () => {
    openConnectionModal({
      edgeId: edge.id,
      fromNodeId: edge.source,
      toNodeId: edge.target,
    });
  };

  const deleteEdge = () => {
    deleteConnection.mutate(edge.id, { onSuccess: closeEdgeContextMenu });
  };

  return (
    <div
      style={{
        ...menuStyle,
        left: edgeContextMenu.x,
        top: edgeContextMenu.y,
      }}
    >
      <button type="button" style={itemStyle} onClick={openEditModal}>
        Edit
      </button>
      <button
        type="button"
        style={dangerItemStyle}
        onClick={deleteEdge}
        disabled={deleteConnection.isPending}
      >
        {deleteConnection.isPending ? "Deleting..." : "Delete"}
      </button>
    </div>
  );
}

const menuStyle = {
  position: "absolute",
  zIndex: 30,
  minWidth: 132,
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
} satisfies CSSProperties;

const dangerItemStyle = {
  ...itemStyle,
  color: "#fecaca",
} satisfies CSSProperties;

