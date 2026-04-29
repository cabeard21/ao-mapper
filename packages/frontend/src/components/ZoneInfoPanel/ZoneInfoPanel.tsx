import { useMemo } from "react";
import { useRemoveZone } from "../../hooks/useMapData";
import { useMapStore } from "../../store/mapStore";
import { formatZoneType, getResourceIcon } from "../zonePresentation";

export function formatCityDistance(distance: { hops: number; meters?: number }) {
  return distance.meters === undefined
    ? `${distance.hops} hops`
    : `${distance.hops} hops · ${distance.meters}m`;
}

export function ZoneInfoPanel() {
  const nodes = useMapStore((s) => s.nodes);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const removeZone = useRemoveZone();

  if (!selectedNode) {
    return (
      <aside style={panelStyle}>
        <div style={{ color: "#a9a9bc", fontSize: 14 }}>
          Select a zone on the map to inspect it.
        </div>
      </aside>
    );
  }

  const { zone } = selectedNode;

  return (
    <aside style={panelStyle}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 20,
              lineHeight: 1.2,
              overflowWrap: "anywhere",
            }}
          >
            {zone.displayName}
          </h2>
          <div style={{ color: "#8f8fa6", fontSize: 12, overflowWrap: "anywhere" }}>
            {zone.uniqueName}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={badgeStyle}>T{zone.tier}</span>
          <span style={tagStyle}>{formatZoneType(zone.zoneType)}</span>
        </div>

        <section>
          <h3 style={sectionTitleStyle}>Resources</h3>
          {zone.resources.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {zone.resources.map((resource) => (
                <div
                  key={`${resource.type}-${resource.tier}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <img
                    src={getResourceIcon(resource)}
                    alt=""
                    width={24}
                    height={24}
                    style={{ objectFit: "contain" }}
                  />
                  <span style={{ textTransform: "capitalize" }}>{resource.type}</span>
                  <span style={{ color: "#cfcfe3" }}>T{resource.tier}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={mutedTextStyle}>No resources recorded.</div>
          )}
        </section>

        <section>
          <h3 style={sectionTitleStyle}>City Distances</h3>
          {zone.cityDistances.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {zone.cityDistances.map((distance) => (
                  <tr key={distance.cityName}>
                    <td style={tableCellStyle}>{distance.cityName}</td>
                    <td style={{ ...tableCellStyle, textAlign: "right" }}>
                      {formatCityDistance(distance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={mutedTextStyle}>No city distance data recorded.</div>
          )}
        </section>

        <button
          type="button"
          onClick={() => removeZone.mutate(zone.id)}
          disabled={removeZone.isPending}
          style={{
            border: "1px solid #793232",
            borderRadius: 6,
            background: removeZone.isPending ? "#3a1d1d" : "#4a2020",
            color: "#ffdada",
            cursor: removeZone.isPending ? "default" : "pointer",
            fontWeight: 700,
            padding: "10px 12px",
          }}
        >
          {removeZone.isPending ? "Removing..." : "Remove zone"}
        </button>

        {removeZone.isError ? (
          <div style={{ color: "#ff9c9c", fontSize: 12 }}>
            Failed to remove all connected portal records.
          </div>
        ) : null}
      </div>
    </aside>
  );
}

const panelStyle = {
  width: 320,
  boxSizing: "border-box" as const,
  borderLeft: "1px solid #2b2b3e",
  background: "#121220",
  color: "#fff",
  overflowY: "auto" as const,
  padding: 16,
};

const badgeStyle = {
  borderRadius: 999,
  background: "#284c7d",
  color: "#e8f2ff",
  fontSize: 12,
  fontWeight: 800,
  padding: "5px 9px",
};

const tagStyle = {
  borderRadius: 999,
  background: "#2a2a3e",
  color: "#e4e4f0",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 9px",
};

const sectionTitleStyle = {
  margin: "0 0 10px",
  color: "#d9d9e8",
  fontSize: 13,
  textTransform: "uppercase" as const,
};

const mutedTextStyle = {
  color: "#9a9ab0",
  fontSize: 13,
};

const tableCellStyle = {
  borderTop: "1px solid #28283a",
  color: "#d9d9e8",
  padding: "8px 0",
};
