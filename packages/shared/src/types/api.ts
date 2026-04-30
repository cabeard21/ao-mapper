import type { Zone } from "./zone";

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export type RouteDirection = "NW" | "NE" | "SW" | "SE";

export type RouteConnectionSource = "active" | "static";

export interface RouteStep {
  zone: Zone;
  enterDirection: RouteDirection | null;
  exitDirection: RouteDirection | null;
  sourceFromPrevious: RouteConnectionSource | null;
  sourceToNext: RouteConnectionSource | null;
}

export interface RouteResult {
  path: string[] | null;
  hops: number | null;
  cost: number | null;
  steps: RouteStep[];
}
