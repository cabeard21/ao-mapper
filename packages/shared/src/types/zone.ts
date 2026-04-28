export type ZoneType =
  | "royal"
  | "black"
  | "red"
  | "yellow"
  | "blue"
  | "roads"
  | "unknown";

export interface Resource {
  type: string;
  tier: number;
}

export interface CityDistance {
  cityName: string;
  hops: number;
}

export interface Zone {
  id: string;
  uniqueName: string;
  displayName: string;
  tier: number;
  zoneType: ZoneType;
  cityDistances: CityDistance[];
  resources: Resource[];
  metadata: Record<string, unknown>;
  createdAt: string;
}
