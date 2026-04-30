import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { StaticRoadRepository } from "./StaticRoadRepository";

function writeWorldJson(): string {
  const dir = mkdtempSync(join(tmpdir(), "ao-mapper-static-roads-"));
  const worldJsonPath = join(dir, "world.json");
  writeFileSync(
    worldJsonPath,
    JSON.stringify({
      world: {
        clusters: {
          cluster: [
            {
              "@id": "2310",
              "@displayname": "Drybasin Riverbed",
              exits: {
                exit: {
                  "@id": "dry-to-den",
                  "@targetid": "den-to-dry@BLACKBANK-2310",
                  "@targettype": "Cluster",
                  "@pos": "10 10",
                },
              },
            },
            {
              "@id": "BLACKBANK-2310",
              "@displayname": "Smuggler's Den",
              exits: {
                exit: {
                  "@id": "den-to-dry",
                  "@targetid": "dry-to-den@2310",
                  "@targettype": "Cluster",
                  "@pos": "20 20",
                },
              },
            },
            {
              "@id": "0321",
              "@displayname": "Slakesands Mesa",
              exits: {
                exit: {
                  "@id": "slake-to-den",
                  "@targetid": "den-to-slake@BLACKBANK-0321",
                  "@targettype": "Cluster",
                  "@pos": "30 30",
                },
              },
            },
            {
              "@id": "BLACKBANK-0321",
              "@displayname": "Smuggler's Den",
              exits: {
                exit: {
                  "@id": "den-to-slake",
                  "@targetid": "slake-to-den@0321",
                  "@targettype": "Cluster",
                  "@pos": "40 40",
                },
              },
            },
          ],
        },
      },
    })
  );
  return worldJsonPath;
}

function createPool(rows: object[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

describe("StaticRoadRepository", () => {
  it("does not resolve ambiguous duplicate display names to a single zone", async () => {
    const worldJsonPath = writeWorldJson();
    const pool = createPool([
      { id: "drybasin", unique_name: "Drybasin Riverbed", display_name: "Drybasin Riverbed" },
      { id: "slakesands", unique_name: "Slakesands Mesa", display_name: "Slakesands Mesa" },
      { id: "smuggler-old", unique_name: "Smuggler's Den", display_name: "Smuggler's Den" },
    ]);
    const repo = new StaticRoadRepository(pool, [worldJsonPath]);

    await expect(repo.findEdges()).resolves.toEqual([]);
  });

  it("resolves duplicate display-name clusters by unique cluster id when imported distinctly", async () => {
    const worldJsonPath = writeWorldJson();
    const pool = createPool([
      { id: "drybasin", unique_name: "Drybasin Riverbed", display_name: "Drybasin Riverbed" },
      { id: "slakesands", unique_name: "Slakesands Mesa", display_name: "Slakesands Mesa" },
      { id: "smuggler-dry", unique_name: "BLACKBANK-2310", display_name: "Smuggler's Den" },
      { id: "smuggler-slake", unique_name: "BLACKBANK-0321", display_name: "Smuggler's Den" },
    ]);
    const repo = new StaticRoadRepository(pool, [worldJsonPath]);

    await expect(repo.findEdges()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromZoneId: "drybasin", toZoneId: "smuggler-dry" }),
        expect.objectContaining({ fromZoneId: "slakesands", toZoneId: "smuggler-slake" }),
      ])
    );
  });
});
