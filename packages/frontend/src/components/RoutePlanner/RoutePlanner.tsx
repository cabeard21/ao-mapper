import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { ApiResponse, RouteDirection, RouteResult, Zone } from "@ao-mapper/shared";
import { useZoneSearch } from "../../hooks/useMapData";
import { useMapStore } from "../../store/mapStore";
import { formatZoneType, zoneToNode } from "../zonePresentation";
import {
  centeredRouteScrollTop,
  formatRouteCost,
  formatRouteDirection,
  findPlannerShortcutZone,
  routeHasDirections,
  swapPlannerZones,
} from "./routePresentation";

const directionArrow: Record<RouteDirection, string> = {
  NW: "↖",
  NE: "↗",
  SW: "↙",
  SE: "↘",
};

interface ZonePickerProps {
  label: string;
  selectedZone: Zone | null;
  onSelect: (zone: Zone) => void;
  actions?: ReactNode;
}

function ZonePicker({ label, selectedZone, onSelect, actions }: ZonePickerProps) {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(inputValue), 180);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

  const { data: zones = [], isFetching, error } = useZoneSearch(query);
  const shouldShowResults = isOpen && inputValue.trim().length >= 2;

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, position: "relative" }}>
      <span style={fieldHeaderStyle}>
        <span style={fieldLabelStyle}>{label}</span>
        {actions ? <span style={shortcutRowStyle}>{actions}</span> : null}
      </span>
      <input
        aria-label={`${label} zone`}
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={selectedZone?.displayName ?? "Search zone"}
        style={inputStyle}
      />
      {shouldShowResults ? (
        <div role="listbox" aria-label={`${label} zone results`} style={resultsStyle}>
          {isFetching ? (
            <div style={resultStateStyle}>Searching...</div>
          ) : error ? (
            <div style={{ ...resultStateStyle, color: "#ff9c9c" }}>Search failed</div>
          ) : zones.length === 0 ? (
            <div style={resultStateStyle}>No matching zones</div>
          ) : (
            zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                role="option"
                aria-selected={selectedZone?.id === zone.id}
                onClick={() => {
                  onSelect(zone);
                  setInputValue("");
                  setQuery("");
                  setIsOpen(false);
                }}
                style={resultButtonStyle}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={resultNameStyle}>{zone.displayName}</span>
                  <span style={resultMetaStyle}>
                    T{zone.tier} - {formatZoneType(zone.zoneType)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DirectionChip({
  label,
  direction,
}: {
  label: "Enter" | "Exit";
  direction: RouteDirection | null;
}) {
  const text = formatRouteDirection(label, direction);
  if (!text || !direction) {
    return null;
  }

  return (
    <span style={directionChipStyle}>
      <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
        {directionArrow[direction]}
      </span>
      {text}
    </span>
  );
}

export function RoutePlanner() {
  const [fromZone, setFromZone] = useState<Zone | null>(null);
  const [toZone, setToZone] = useState<Zone | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const nodes = useMapStore((s) => s.nodes);
  const currentZoneId = useMapStore((s) => s.currentZoneId);
  const homeZoneId = useMapStore((s) => s.homeZoneId);
  const addRouteNodes = useMapStore((s) => s.addRouteNodes);
  const clearRoute = useMapStore((s) => s.clearRoute);
  const setRoutePath = useMapStore((s) => s.setRoutePath);

  const routeMutation = useMutation({
    mutationFn: async () => {
      if (!fromZone || !toZone) {
        throw new Error("Select both zones");
      }
      const { data } = await axios.get<ApiResponse<RouteResult>>("/api/route", {
        params: { from: fromZone.id, to: toZone.id },
      });
      if (!data.success || !data.data) {
        throw new Error(data.error ?? "Route search failed");
      }
      return data.data;
    },
    onSuccess: (route) => {
      clearRoute();
      setRoutePath(route.path ?? []);
      addRouteNodes(route.steps.map((step) => zoneToNode(step.zone, "route")));
      setActiveRoute(route);
    },
  });

  const nearestCityMutation = useMutation({
    mutationFn: async () => {
      const fromId = fromZone?.id ?? currentZoneId;
      if (!fromId) throw new Error("No from zone");
      const { data } = await axios.get<ApiResponse<RouteResult>>("/api/route/nearest-city", {
        params: { from: fromId },
      });
      if (!data.success || !data.data) {
        throw new Error(data.error ?? "Nearest city search failed");
      }
      return data.data;
    },
    onSuccess: (route) => {
      const cityZone = route.steps.at(-1)?.zone ?? null;
      const firstZone = route.steps.at(0)?.zone ?? null;
      if (cityZone) setToZone(cityZone);
      if (!fromZone && firstZone) setFromZone(firstZone);
      clearRoute();
      setRoutePath(route.path ?? []);
      addRouteNodes(route.steps.map((step) => zoneToNode(step.zone, "route")));
      setActiveRoute(route);
    },
  });

  const currentShortcutZone = useMemo(
    () => findPlannerShortcutZone(nodes, currentZoneId),
    [currentZoneId, nodes]
  );
  const homeShortcutZone = useMemo(
    () => findPlannerShortcutZone(nodes, homeZoneId),
    [homeZoneId, nodes]
  );

  const nearestRedMutation = useMutation({
    mutationFn: async () => {
      const fromId = fromZone?.id ?? currentZoneId;
      if (!fromId) throw new Error("No from zone");
      const { data } = await axios.get<ApiResponse<RouteResult>>("/api/route/nearest-red", {
        params: { from: fromId },
      });
      if (!data.success || !data.data) {
        throw new Error(data.error ?? "Nearest red zone search failed");
      }
      return data.data;
    },
    onSuccess: (route) => {
      const redZone = route.steps.at(-1)?.zone ?? null;
      const firstZone = route.steps.at(0)?.zone ?? null;
      if (redZone) setToZone(redZone);
      if (!fromZone && firstZone) setFromZone(firstZone);
      clearRoute();
      setRoutePath(route.path ?? []);
      addRouteNodes(route.steps.map((step) => zoneToNode(step.zone, "route")));
      setActiveRoute(route);
    },
  });

  const setPlannerFromZone = (zone: Zone) => {
    setFromZone(zone);
    setActiveRoute(null);
    routeMutation.reset();
    nearestCityMutation.reset();
    nearestRedMutation.reset();
  };

  const setPlannerToZone = (zone: Zone) => {
    setToZone(zone);
    setActiveRoute(null);
    routeMutation.reset();
    nearestCityMutation.reset();
    nearestRedMutation.reset();
  };

  const handleSwapZones = () => {
    const swapped = swapPlannerZones(fromZone, toZone);
    setFromZone(swapped.fromZone);
    setToZone(swapped.toZone);
    setActiveRoute(null);
    routeMutation.reset();
    nearestCityMutation.reset();
    nearestRedMutation.reset();
  };

  const canNearestCity = Boolean(fromZone?.id ?? currentZoneId);

  const summaryRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (!currentZoneId || !activeRoute?.path) return;
    const summaryEl = summaryRef.current;
    const el = stepRefs.current.get(currentZoneId);
    if (!summaryEl || !el) return;
    summaryEl.scrollTo({
      top: centeredRouteScrollTop(summaryEl, el),
      behavior: "smooth",
    });
  }, [currentZoneId, activeRoute]);

  const canSearch = Boolean(fromZone && toZone && fromZone.id !== toZone.id);
  const canSwap = Boolean(fromZone || toZone);
  const selectedLabel = useMemo(() => {
    if (!fromZone || !toZone) {
      return "Route Planner";
    }
    return `${fromZone.displayName} to ${toZone.displayName}`;
  }, [fromZone, toZone]);

  return (
    <section style={plannerStyle} aria-label="Route planner">
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 3 }}>
          <h2 style={titleStyle}>Route Planner</h2>
          <div style={subtitleStyle}>{selectedLabel}</div>
        </div>

        <div style={pickerGridStyle}>
          <ZonePicker
            label="From"
            selectedZone={fromZone}
            onSelect={setPlannerFromZone}
            actions={
              <>
                <button
                  type="button"
                  title="Use home zone as From"
                  disabled={!homeShortcutZone}
                  onClick={(event) => {
                    event.preventDefault();
                    if (homeShortcutZone) setPlannerFromZone(homeShortcutZone);
                  }}
                  style={homeShortcutZone ? shortcutButtonStyle : disabledShortcutButtonStyle}
                >
                  Home
                </button>
                <button
                  type="button"
                  title="Use current zone as From"
                  disabled={!currentShortcutZone}
                  onClick={(event) => {
                    event.preventDefault();
                    if (currentShortcutZone) setPlannerFromZone(currentShortcutZone);
                  }}
                  style={currentShortcutZone ? shortcutButtonStyle : disabledShortcutButtonStyle}
                >
                  Current
                </button>
              </>
            }
          />
          <ZonePicker
            label="To"
            selectedZone={toZone}
            onSelect={setPlannerToZone}
            actions={
              <>
                <button
                  type="button"
                  title="Use home zone as To"
                  disabled={!homeShortcutZone}
                  onClick={(event) => {
                    event.preventDefault();
                    if (homeShortcutZone) setPlannerToZone(homeShortcutZone);
                  }}
                  style={homeShortcutZone ? shortcutButtonStyle : disabledShortcutButtonStyle}
                >
                  Home
                </button>
                <button
                  type="button"
                  title="Use current zone as To"
                  disabled={!currentShortcutZone}
                  onClick={(event) => {
                    event.preventDefault();
                    if (currentShortcutZone) setPlannerToZone(currentShortcutZone);
                  }}
                  style={currentShortcutZone ? shortcutButtonStyle : disabledShortcutButtonStyle}
                >
                  Current
                </button>
                <button
                  type="button"
                  title="Find nearest city from current From zone"
                  disabled={!canNearestCity || nearestCityMutation.isPending}
                  onClick={() => nearestCityMutation.mutate()}
                  style={canNearestCity && !nearestCityMutation.isPending ? shortcutButtonStyle : disabledShortcutButtonStyle}
                >
                  {nearestCityMutation.isPending ? "..." : "City"}
                </button>
                <button
                  type="button"
                  title="Find nearest red zone from current From zone"
                  disabled={!canNearestCity || nearestRedMutation.isPending}
                  onClick={() => nearestRedMutation.mutate()}
                  style={canNearestCity && !nearestRedMutation.isPending ? redShortcutButtonStyle : disabledRedShortcutButtonStyle}
                >
                  {nearestRedMutation.isPending ? "..." : "Red"}
                </button>
              </>
            }
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            title="Swap From and To"
            disabled={!canSwap}
            onClick={handleSwapZones}
            style={{
              ...secondaryButtonStyle,
              opacity: canSwap ? 1 : 0.55,
              cursor: canSwap ? "pointer" : "default",
            }}
          >
            Swap
          </button>
          <button
            type="button"
            disabled={!canSearch || routeMutation.isPending}
            onClick={() => routeMutation.mutate()}
            style={{
              ...primaryButtonStyle,
              opacity: !canSearch || routeMutation.isPending ? 0.55 : 1,
              cursor: !canSearch || routeMutation.isPending ? "default" : "pointer",
            }}
          >
            {routeMutation.isPending ? "Finding..." : "Find route"}
          </button>
          <button
            type="button"
            onClick={() => {
              setFromZone(null);
              setToZone(null);
              setActiveRoute(null);
              clearRoute();
              routeMutation.reset();
              nearestCityMutation.reset();
              nearestRedMutation.reset();
            }}
            style={secondaryButtonStyle}
          >
            Clear
          </button>
        </div>

        {fromZone && toZone && fromZone.id === toZone.id ? (
          <div style={mutedStateStyle}>Choose two different zones.</div>
        ) : null}

        {routeMutation.isError || nearestCityMutation.isError || nearestRedMutation.isError ? (
          <div style={errorStateStyle}>
            {(() => {
              const err = routeMutation.error ?? nearestCityMutation.error ?? nearestRedMutation.error;
              return err instanceof Error ? err.message : "Route search failed";
            })()}
          </div>
        ) : null}

        {activeRoute && activeRoute.path === null ? (
          <div style={mutedStateStyle}>No route found with current known routes.</div>
        ) : null}

        {activeRoute && activeRoute.path ? (
          <div ref={summaryRef} style={summaryStyle}>
            <div style={summaryHeaderStyle}>
              <span>Fastest route</span>
              <span style={{ color: "#f7d77a" }}>{formatRouteCost(activeRoute)}</span>
            </div>
            <ol style={stepListStyle}>
              {activeRoute.steps.map((step, index) => (
                <li
                  key={`${step.zone.id}-${index}`}
                  ref={(el) => {
                    if (el) stepRefs.current.set(step.zone.id, el);
                    else stepRefs.current.delete(step.zone.id);
                  }}
                  style={stepStyle}
                >
                  <span style={stepNumberStyle}>{index + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={zoneNameStyle}>{step.zone.displayName}</span>
                    <span style={zoneMetaStyle}>
                      T{step.zone.tier} - {formatZoneType(step.zone.zoneType)}
                    </span>
                    {routeHasDirections(step) ? (
                      <span style={chipRowStyle}>
                        <DirectionChip label="Enter" direction={step.enterDirection} />
                        <DirectionChip label="Exit" direction={step.exitDirection} />
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const plannerStyle = {
  boxSizing: "border-box" as const,
  borderBottom: "1px solid #2b2b3e",
  background: "#10101e",
  color: "#fff",
  flexShrink: 0,
  overflowY: "visible" as const,
  padding: 14,
  position: "relative" as const,
  zIndex: 20,
};

const titleStyle = {
  margin: 0,
  fontSize: 17,
  lineHeight: 1.2,
};

const subtitleStyle = {
  minHeight: 16,
  color: "#9999b1",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const pickerGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const fieldHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minWidth: 0,
};

const fieldLabelStyle = {
  color: "#cfcfe3",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase" as const,
};

const shortcutRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: 4,
  minWidth: 0,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #343448",
  borderRadius: 6,
  background: "#151525",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  padding: "8px 9px",
};

export const resultsStyle = {
  position: "absolute" as const,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 100,
  maxHeight: 260,
  overflowY: "auto" as const,
  border: "1px solid #343448",
  borderRadius: 8,
  background: "#151525",
  boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
};

const resultStateStyle = {
  color: "#a9a9bc",
  fontSize: 13,
  padding: "10px",
};

const resultButtonStyle = {
  width: "100%",
  display: "grid",
  border: 0,
  borderBottom: "1px solid #242438",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  padding: "9px 10px",
  textAlign: "left" as const,
};

const resultNameStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const resultMetaStyle = {
  color: "#a9a9bc",
  fontSize: 11,
};

const primaryButtonStyle = {
  flex: 1,
  border: "1px solid #806520",
  borderRadius: 6,
  background: "#c49424",
  color: "#14120a",
  fontSize: 13,
  fontWeight: 800,
  padding: "9px 10px",
};

const secondaryButtonStyle = {
  border: "1px solid #343448",
  borderRadius: 6,
  background: "#18182a",
  color: "#dfdff0",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  padding: "9px 10px",
};

const shortcutButtonStyle = {
  border: "1px solid #343448",
  borderRadius: 5,
  background: "#18182a",
  color: "#dfdff0",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
  padding: "5px 6px",
};

const disabledShortcutButtonStyle = {
  ...shortcutButtonStyle,
  opacity: 0.45,
  cursor: "default",
};

const redShortcutButtonStyle = {
  ...shortcutButtonStyle,
  border: "1px solid #7a2020",
  background: "#3a1010",
  color: "#ff9c9c",
};

const disabledRedShortcutButtonStyle = {
  ...redShortcutButtonStyle,
  opacity: 0.45,
  cursor: "default",
};

const mutedStateStyle = {
  border: "1px solid #2c2c40",
  borderRadius: 6,
  color: "#a9a9bc",
  fontSize: 13,
  padding: 10,
};

const errorStateStyle = {
  border: "1px solid #793232",
  borderRadius: 6,
  color: "#ffb8b8",
  fontSize: 13,
  padding: 10,
};

export const summaryStyle = {
  borderTop: "1px solid #28283a",
  maxHeight: "32vh",
  overflowY: "auto" as const,
  paddingTop: 10,
};

const summaryHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#e9e9f5",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 8,
};

const stepListStyle = {
  display: "grid",
  gap: 8,
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const stepStyle = {
  display: "grid",
  gridTemplateColumns: "24px 1fr",
  gap: 9,
  alignItems: "start",
  border: "1px solid #28283a",
  borderRadius: 7,
  background: "#151525",
  padding: 9,
};

const stepNumberStyle = {
  display: "grid",
  placeItems: "center",
  width: 24,
  height: 24,
  borderRadius: 999,
  background: "#25253a",
  color: "#f7d77a",
  fontSize: 12,
  fontWeight: 900,
};

const zoneNameStyle = {
  display: "block",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  overflowWrap: "anywhere" as const,
};

const zoneMetaStyle = {
  display: "block",
  color: "#a9a9bc",
  fontSize: 11,
  marginTop: 2,
};

const chipRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 6,
  marginTop: 7,
};

const directionChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid #4f4021",
  borderRadius: 999,
  background: "#211d14",
  color: "#f7d77a",
  fontSize: 11,
  fontWeight: 800,
  padding: "4px 7px",
};
