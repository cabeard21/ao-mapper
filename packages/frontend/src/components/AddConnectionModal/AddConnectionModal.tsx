import {
  FormEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ConnectionType } from "@ao-mapper/shared";
import { useConnectionActions } from "../../hooks/useConnectionActions";
import { useMapStore } from "../../store/mapStore";

const connectionTypes: Array<{ value: ConnectionType; label: string }> = [
  { value: "BZ_PORTAL", label: "BZ portal" },
  { value: "ROYAL_ROAD", label: "Royal road" },
  { value: "AVALON_ROAD", label: "Avalon road" },
  { value: "TUNNEL", label: "Tunnel" },
  { value: "HIGHWAY", label: "Highway" },
];

const durationOptions = [
  { value: "", label: "Permanent" },
  { value: "1", label: "1h" },
  { value: "2", label: "2h" },
  { value: "22", label: "22h" },
];

function getInitialDuration(edgeDuration: number | null | undefined): string {
  if (edgeDuration === undefined) {
    return "22";
  }
  return edgeDuration === null ? "" : String(edgeDuration);
}

export function AddConnectionModal() {
  const modal = useMapStore((s) => s.connectionModal);
  const nodes = useMapStore((s) => s.nodes);
  const edges = useMapStore((s) => s.edges);
  const closeConnectionModal = useMapStore((s) => s.closeConnectionModal);
  const { createConnection, updateConnection } = useConnectionActions();

  const editingEdge = useMemo(
    () => edges.find((edge) => edge.id === modal?.edgeId) ?? null,
    [edges, modal?.edgeId]
  );
  const fromNode = nodes.find((node) => node.id === modal?.fromNodeId);
  const toNode = nodes.find((node) => node.id === modal?.toNodeId);

  const [connType, setConnType] = useState<ConnectionType>(
    editingEdge?.connType ?? "BZ_PORTAL"
  );
  const [durationHours, setDurationHours] = useState<string>(
    getInitialDuration(editingEdge?.durationHours)
  );

  useEffect(() => {
    setConnType(editingEdge?.connType ?? "BZ_PORTAL");
    setDurationHours(getInitialDuration(editingEdge?.durationHours));
  }, [editingEdge?.connType, editingEdge?.durationHours, modal?.edgeId]);

  if (!modal || !fromNode || !toNode) return null;

  const isSaving = createConnection.isPending || updateConnection.isPending;
  const title = editingEdge ? "Edit connection" : "Add connection";
  const error = createConnection.error ?? updateConnection.error;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedDuration = durationHours ? Number(durationHours) : null;

    if (editingEdge) {
      updateConnection.mutate(
        {
          id: editingEdge.id,
          connType,
          durationHours: parsedDuration,
        },
        { onSuccess: closeConnectionModal }
      );
      return;
    }

    createConnection.mutate(
      {
        fromZoneId: modal.fromNodeId,
        toZoneId: modal.toNodeId,
        connType,
        durationHours: parsedDuration,
      },
      { onSuccess: closeConnectionModal }
    );
  };

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label={title}>
      <form style={modalStyle} onSubmit={handleSubmit}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>{title}</h2>
          <button type="button" style={iconButtonStyle} onClick={closeConnectionModal}>
            x
          </button>
        </header>

        <div style={zonesStyle}>
          <span style={zonePillStyle}>{fromNode.label}</span>
          <span style={{ color: "#9aa4b2" }}>to</span>
          <span style={zonePillStyle}>{toNode.label}</span>
        </div>

        <label style={labelStyle}>
          Type
          <select
            value={connType}
            onChange={(event) => setConnType(event.target.value as ConnectionType)}
            style={fieldStyle}
          >
            {connectionTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Duration
          <select
            value={durationHours}
            onChange={(event) => setDurationHours(event.target.value)}
            style={fieldStyle}
          >
            {durationOptions.map((option) => (
              <option key={option.value || "permanent"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {error ? <p style={errorStyle}>{error.message}</p> : null}

        <footer style={footerStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={closeConnectionModal}>
            Cancel
          </button>
          <button type="submit" style={primaryButtonStyle} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}

const backdropStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  display: "grid",
  placeItems: "center",
  background: "rgba(5, 8, 14, 0.58)",
} satisfies CSSProperties;

const modalStyle = {
  width: "min(420px, calc(100vw - 32px))",
  border: "1px solid #30384a",
  borderRadius: 8,
  padding: 18,
  background: "#141824",
  color: "#f8fafc",
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.42)",
} satisfies CSSProperties;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
} satisfies CSSProperties;

const titleStyle = {
  margin: 0,
  fontSize: 18,
  letterSpacing: 0,
} satisfies CSSProperties;

const iconButtonStyle = {
  width: 32,
  height: 32,
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#1f2937",
  color: "#f8fafc",
  cursor: "pointer",
} satisfies CSSProperties;

const zonesStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 16,
  flexWrap: "wrap",
} satisfies CSSProperties;

const zonePillStyle = {
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "6px 8px",
  background: "#0f172a",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  gap: 6,
  marginBottom: 12,
  color: "#cbd5e1",
  fontSize: 13,
} satisfies CSSProperties;

const fieldStyle = {
  width: "100%",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "9px 10px",
  background: "#0f172a",
  color: "#f8fafc",
} satisfies CSSProperties;

const errorStyle = {
  margin: "4px 0 0",
  color: "#f87171",
  fontSize: 13,
} satisfies CSSProperties;

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 16,
} satisfies CSSProperties;

const secondaryButtonStyle = {
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "9px 12px",
  background: "#111827",
  color: "#f8fafc",
  cursor: "pointer",
} satisfies CSSProperties;

const primaryButtonStyle = {
  border: "1px solid #2563eb",
  borderRadius: 6,
  padding: "9px 12px",
  background: "#2563eb",
  color: "#ffffff",
  cursor: "pointer",
} satisfies CSSProperties;
