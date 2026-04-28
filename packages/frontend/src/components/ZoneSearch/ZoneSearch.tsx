import { useEffect, useMemo, useState } from "react";
import { useZoneSearch } from "../../hooks/useMapData";
import { useMapStore } from "../../store/mapStore";
import { formatZoneType, zoneToNode } from "../zonePresentation";

export function ZoneSearch() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const nodes = useMapStore((s) => s.nodes);
  const addNode = useMapStore((s) => s.addNode);
  const setSelectedNode = useMapStore((s) => s.setSelectedNode);
  const existingNodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(inputValue), 180);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

  const { data: zones = [], isFetching, error } = useZoneSearch(query);
  const shouldShowResults = isOpen && inputValue.trim().length >= 2;

  return (
    <div style={{ position: "relative", width: "min(460px, 100%)" }}>
      <input
        aria-label="Search zones"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search zones to add"
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid #3a3a4d",
          borderRadius: 6,
          background: "#10101f",
          color: "#fff",
          fontSize: 14,
          outline: "none",
          padding: "9px 12px",
        }}
      />

      {shouldShowResults ? (
        <div
          role="listbox"
          aria-label="Zone search results"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid #343448",
            borderRadius: 8,
            background: "#151525",
            boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
          }}
        >
          {isFetching ? (
            <div style={emptyStateStyle}>Searching...</div>
          ) : error ? (
            <div style={errorStateStyle}>Zone search failed</div>
          ) : zones.length === 0 ? (
            <div style={emptyStateStyle}>No matching zones</div>
          ) : (
            zones.map((zone) => {
              const isAdded = existingNodeIds.has(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    addNode(zoneToNode(zone));
                    setSelectedNode(zone.id);
                    setInputValue("");
                    setQuery("");
                    setIsOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    border: 0,
                    borderBottom: "1px solid #242438",
                    background: "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {zone.displayName}
                    </span>
                    <span style={{ color: "#a9a9bc", fontSize: 12 }}>
                      T{zone.tier} - {formatZoneType(zone.zoneType)}
                    </span>
                  </span>
                  <span
                    style={{
                      color: isAdded ? "#88f0b2" : "#c9c9d6",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isAdded ? "On map" : "Add"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

const emptyStateStyle = {
  color: "#a9a9bc",
  fontSize: 13,
  padding: "12px",
};

const errorStateStyle = {
  color: "#ff9c9c",
  fontSize: 13,
  padding: "12px",
};
