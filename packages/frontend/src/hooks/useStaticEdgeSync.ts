import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMapStore, type CytoEdge } from "../store/mapStore";

interface StaticConnection {
  fromZoneId: string;
  toZoneId: string;
}

interface StaticConnectionsResponse {
  success: boolean;
  data: StaticConnection[];
}

export function useStaticEdgeSync() {
  const edges = useMapStore((s) => s.edges);
  const setStaticEdges = useMapStore((s) => s.setStaticEdges);

  const { data: staticConnections } = useQuery<StaticConnection[]>({
    queryKey: ["static-connections"],
    queryFn: async (): Promise<StaticConnection[]> => {
      const res = await fetch("/api/connections/static");
      const json = (await res.json()) as StaticConnectionsResponse;
      return json.data ?? [];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (!staticConnections) return;

    const zonesWithPortals = new Set(
      edges
        .filter((e) => !e.isRouteVisual && e.connType !== "STATIC")
        .flatMap((e) => [e.source, e.target])
    );

    const visible: CytoEdge[] = staticConnections
      .filter(
        (sc) =>
          zonesWithPortals.has(sc.fromZoneId) && zonesWithPortals.has(sc.toZoneId)
      )
      .map((sc) => ({
        id: `static:${sc.fromZoneId}:${sc.toZoneId}`,
        source: sc.fromZoneId,
        target: sc.toZoneId,
        connType: "STATIC" as const,
        label: "",
        durationHours: null,
        expiresAt: null,
      }));

    setStaticEdges(visible);
  }, [edges, staticConnections, setStaticEdges]);
}
