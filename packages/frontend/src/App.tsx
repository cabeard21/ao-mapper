import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { MapGraph } from "./components/MapGraph/MapGraph";
import { ZoneInfoPanel } from "./components/ZoneInfoPanel/ZoneInfoPanel";
import { ZoneSearch } from "./components/ZoneSearch/ZoneSearch";
import { useConnections, useRemoveZone } from "./hooks/useMapData";
import { useMapStore } from "./store/mapStore";

const queryClient = new QueryClient();

function MapApp() {
  useConnections();
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const removeZone = useRemoveZone();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditing =
        tagName === "input" || tagName === "textarea" || target?.isContentEditable;
      if (event.key === "Delete" && selectedNodeId && !isEditing) {
        event.preventDefault();
        removeZone.mutate(selectedNodeId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeZone, selectedNodeId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0d0d1a",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <header
        style={{
          padding: "8px 16px",
          background: "#161625",
          borderBottom: "1px solid #333",
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: "minmax(120px, 180px) minmax(260px, 460px)",
          gap: 16,
          alignItems: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          ao-mapper
        </h1>
        <ZoneSearch />
      </header>
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <MapGraph />
        </div>
        <ZoneInfoPanel />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MapApp />
    </QueryClientProvider>
  );
}
