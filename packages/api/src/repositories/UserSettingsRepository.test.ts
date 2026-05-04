import { describe, expect, it, vi } from "vitest";
import { UserSettingsRepository } from "./UserSettingsRepository";

const ZONE_ID = "11111111-1111-4111-8111-111111111111";

describe("UserSettingsRepository", () => {
  describe("get", () => {
    it("returns null homeZoneId when no row exists", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.get()).resolves.toEqual({ homeZoneId: null });
    });

    it("returns null homeZoneId when home_zone_id column is null", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [{ home_zone_id: null }] });
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.get()).resolves.toEqual({ homeZoneId: null });
    });

    it("returns homeZoneId when set", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [{ home_zone_id: ZONE_ID }] });
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.get()).resolves.toEqual({ homeZoneId: ZONE_ID });
    });
  });

  describe("setHomeZone", () => {
    it("updates home_zone_id when zone exists", async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1 }) // zone exists check
        .mockResolvedValueOnce({ rowCount: 1 }); // update
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.setHomeZone(ZONE_ID)).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining("UPDATE user_settings"),
        [ZONE_ID]
      );
    });

    it("throws when zone does not exist", async () => {
      const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 });
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.setHomeZone(ZONE_ID)).rejects.toThrow("Zone not found");
    });
  });

  describe("clearHomeZone", () => {
    it("sets home_zone_id to NULL", async () => {
      const query = vi.fn().mockResolvedValue({ rowCount: 1 });
      const repo = new UserSettingsRepository({ query } as never);

      await expect(repo.clearHomeZone()).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("home_zone_id = NULL")
      );
    });
  });
});
