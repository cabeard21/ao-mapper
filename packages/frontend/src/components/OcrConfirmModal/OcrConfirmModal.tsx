import { type CSSProperties, useState } from "react";
import axios from "axios";
import type { ApiResponse, Zone } from "@ao-mapper/shared";
import { useConnectionActions } from "../../hooks/useConnectionActions";
import { useMapStore } from "../../store/mapStore";
import { zoneToNode } from "../zonePresentation";
import { ZoneSearch } from "../ZoneSearch/ZoneSearch";

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function OcrConfirmModal() {
  const pendingOcrResult = useMapStore((s) => s.pendingOcrResult);
  const setPendingOcrResult = useMapStore((s) => s.setPendingOcrResult);
  const currentZoneId = useMapStore((s) => s.currentZoneId);
  const nodes = useMapStore((s) => s.nodes);
  const addNode = useMapStore((s) => s.addNode);
  const { createConnection } = useConnectionActions();

  const [fromZoneId, setFromZoneId] = useState<string | null>(null);

  if (!pendingOcrResult) return null;

  const { toZone, connType, closesInMinutes } = pendingOcrResult;
  const currentNode = nodes.find((n) => n.id === currentZoneId);
  const resolvedFromId = currentZoneId ?? fromZoneId;
  const resolvedFromLabel = currentNode?.label ?? null;
  const isSaving = createConnection.isPending;

  const dismiss = () => {
    setPendingOcrResult(null);
    setFromZoneId(null);
    createConnection.reset();
  };

  const handleConfirm = async () => {
    if (!resolvedFromId) return;

    // Ensure toZone is on the map so the edge renders
    if (!nodes.some((n) => n.id === toZone.id)) {
      try {
        const { data } = await axios.get<ApiResponse<Zone>>(`/api/zones/${toZone.id}`);
        if (data.success && data.data) addNode(zoneToNode(data.data));
      } catch {
        // best-effort: edge will still be created even if node doesn't render
      }
    }

    createConnection.mutate(
      {
        fromZoneId: resolvedFromId,
        toZoneId: toZone.id,
        connType,
        durationHours: closesInMinutes / 60,
      },
      { onSuccess: dismiss }
    );
  };

  const portalLabel = connType === "PORTAL_20" ? "20-man" : "7-man";

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="Confirm OCR portal">
      <div style={modalStyle}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>Add portal from OCR</h2>
          <button type="button" style={iconButtonStyle} onClick={dismiss}>
            x
          </button>
        </header>

        <div style={rowStyle}>
          <span style={dimStyle}>To</span>
          <span style={zonePillStyle}>{toZone.displayName}</span>
          <span style={badgeStyle}>{portalLabel}</span>
          <span style={badgeStyle}>{formatDuration(closesInMinutes)}</span>
        </div>

        <div style={fromSectionStyle}>
          <span style={dimStyle}>From</span>
          {currentZoneId ? (
            <span style={zonePillStyle}>{resolvedFromLabel ?? currentZoneId}</span>
          ) : (
            <div style={searchWrapStyle}>
              <ZoneSearch
                placeholder="Select your current zone…"
                onSelect={(zone) => setFromZoneId(zone.id)}
              />
            </div>
          )}
        </div>

        {createConnection.isError ? (
          <p style={errorStyle}>{createConnection.error.message}</p>
        ) : null}

        <footer style={footerStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={dismiss}>
            Dismiss
          </button>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={isSaving || !resolvedFromId}
            onClick={handleConfirm}
          >
            {isSaving ? "Adding…" : "Add portal"}
          </button>
        </footer>
      </div>
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
  width: "min(440px, calc(100vw - 32px))",
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
  marginBottom: 16,
} satisfies CSSProperties;

const titleStyle = {
  margin: 0,
  fontSize: 18,
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

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
  marginBottom: 12,
} satisfies CSSProperties;

const fromSectionStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
  marginBottom: 16,
} satisfies CSSProperties;

const dimStyle = {
  color: "#9aa4b2",
  fontSize: 13,
  minWidth: 28,
} satisfies CSSProperties;

const zonePillStyle = {
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "4px 8px",
  background: "#0f172a",
  fontSize: 13,
} satisfies CSSProperties;

const badgeStyle = {
  border: "1px solid #475569",
  borderRadius: 4,
  padding: "3px 6px",
  background: "#1e293b",
  fontSize: 12,
  color: "#94a3b8",
} satisfies CSSProperties;

const searchWrapStyle = {
  flex: 1,
  minWidth: 0,
} satisfies CSSProperties;

const errorStyle = {
  margin: "0 0 8px",
  color: "#f87171",
  fontSize: 13,
} satisfies CSSProperties;

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
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
