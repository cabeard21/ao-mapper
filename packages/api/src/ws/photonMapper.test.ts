import { describe, expect, it } from "vitest";
import {
  extractCurrentZoneUniqueName,
  parseSnifferMessage,
} from "./photonMapper";

describe("photonMapper", () => {
  it("extracts a zone unique name from documented photonEvent messages", () => {
    const message = {
      type: "photonEvent",
      data: {
        eventCode: 35,
        parameters: {
          zoneUniqueName: "OPEN_WORLD_BLACK_TharcalFissure",
        },
      },
    };

    expect(extractCurrentZoneUniqueName(message)).toBe("OPEN_WORLD_BLACK_TharcalFissure");
  });

  it("extracts display-name zone values from sidecar zone:current messages", () => {
    const message = {
      type: "photonEvent",
      timestamp: 1679580125,
      data: {
        eventCode: "zone:current",
        parameters: {
          zoneUniqueName: "Drybasin Riverbed",
        },
      },
    };

    expect(extractCurrentZoneUniqueName(message)).toBe("Drybasin Riverbed");
  });

  it("extracts a zone unique name from sniffer packet wrappers", () => {
    const message = {
      type: "packet",
      data: {
        type: "photonEvent",
        data: {
          eventCode: 35,
          parameters: {
            1: "OPEN_WORLD_ROADS_TEST_ZONE",
          },
        },
      },
    };

    expect(extractCurrentZoneUniqueName(message)).toBe("OPEN_WORLD_ROADS_TEST_ZONE");
  });

  it("ignores non-zone photon events", () => {
    const message = {
      type: "photonEvent",
      data: {
        eventCode: 4,
        parameters: {
          silver: 100,
          message: "not a zone",
        },
      },
    };

    expect(extractCurrentZoneUniqueName(message)).toBeNull();
  });

  it("parses valid JSON sniffer messages and rejects invalid JSON", () => {
    expect(parseSnifferMessage('{"type":"status","data":{"active":true}}')).toEqual({
      type: "status",
      data: { active: true },
    });
    expect(parseSnifferMessage("not json")).toBeNull();
  });
}
);
