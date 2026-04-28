import { ConnectionRepository } from "../repositories/ConnectionRepository";

export class ExpiryService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  start(
    repo: ConnectionRepository,
    onExpired: (ids: string[]) => void,
    intervalMs = 60_000
  ): void {
    this.intervalHandle = setInterval(async () => {
      try {
        const expired = await repo.markExpired();
        if (expired.length > 0) {
          onExpired(expired);
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
  }
}
