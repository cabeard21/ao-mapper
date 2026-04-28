import { ConnectionRepository } from "../repositories/ConnectionRepository";

export class ExpiryService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly notifiedConnectionIds = new Set<string>();

  start(
    repo: ConnectionRepository,
    onExpired: (ids: string[]) => void | Promise<void>,
    intervalMs = 60_000
  ): void {
    this.intervalHandle = setInterval(async () => {
      try {
        const expired = await repo.markExpired();
        const newlyExpired = expired.filter((id) => !this.notifiedConnectionIds.has(id));
        for (const id of this.notifiedConnectionIds) {
          if (!expired.includes(id)) {
            this.notifiedConnectionIds.delete(id);
          }
        }
        if (newlyExpired.length > 0) {
          await onExpired(newlyExpired);
          newlyExpired.forEach((id) => this.notifiedConnectionIds.add(id));
        }
      } catch (err) {
        console.error("[ExpiryService] Error checking expiry:", err);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.notifiedConnectionIds.clear();
  }
}
