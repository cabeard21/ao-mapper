import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapGraph } from "./components/MapGraph/MapGraph";
import { useConnections } from "./hooks/useMapData";

const queryClient = new QueryClient();

function MapApp() {
  useConnections();
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
      </header>
      <main style={{ flex: 1, overflow: "hidden" }}>
        <MapGraph />
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
