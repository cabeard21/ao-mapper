import { useEffect } from "react";
import { useMapStore } from "../store/mapStore";

export function useConnectionTimers() {
  const refreshEdgeLabels = useMapStore((s) => s.refreshEdgeLabels);

  useEffect(() => {
    refreshEdgeLabels();
    const timer = window.setInterval(() => {
      refreshEdgeLabels();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [refreshEdgeLabels]);
}

