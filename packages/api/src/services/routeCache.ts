import { Socket } from "node:net";

import type { RouteCache } from "./RouteOptimizer";

export class MemoryRouteCache implements RouteCache {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        this.values.delete(key);
      }
    }
  }
}

export class RedisRouteCache implements RouteCache {
  private readonly host: string;
  private readonly port: number;
  private readonly password: string | null;

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.host = parsed.hostname || "localhost";
    this.port = Number(parsed.port || 6379);
    this.password = parsed.password ? decodeURIComponent(parsed.password) : null;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.command(["GET", key]);
    if (typeof value !== "string") {
      return null;
    }
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.command(["SET", key, JSON.stringify(value)]);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const keys = await this.command(["KEYS", `${prefix}*`]);
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }
    await this.command(["DEL", ...keys.map(String)]);
  }

  private async command(args: string[]): Promise<unknown> {
    const commands = this.password
      ? [encodeCommand(["AUTH", this.password]), encodeCommand(args)]
      : [encodeCommand(args)];
    const raw = await sendRedisCommand(this.host, this.port, commands.join(""));
    const parsed = parseRespMessages(raw);
    return parsed[parsed.length - 1] ?? null;
  }
}

export function createRouteCache(redisUrl?: string): RouteCache {
  if (!redisUrl) {
    return new MemoryRouteCache();
  }
  return new RedisRouteCache(redisUrl);
}

function encodeCommand(args: string[]): string {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const value = String(arg);
    parts.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }
  return parts.join("");
}

function sendRedisCommand(
  host: string,
  port: number,
  payload: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    const socket = new Socket();
    socket.setTimeout(1000);
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Redis route cache command timed out"));
    });
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      if (finishTimer) {
        clearTimeout(finishTimer);
      }
      finishTimer = setTimeout(() => {
        socket.destroy();
        resolve(Buffer.concat(chunks));
      }, 10);
    });
    socket.once("end", () => {
      if (finishTimer) {
        clearTimeout(finishTimer);
      }
      resolve(Buffer.concat(chunks));
    });
    socket.connect(port, host, () => {
      socket.write(payload);
      socket.end();
    });
  });
}

function parseRespMessages(buffer: Buffer): unknown[] {
  const text = buffer.toString("utf8");
  const values: unknown[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const [value, next] = parseAt(text, cursor);
    values.push(value);
    cursor = next;
  }
  return values;
}

function parseAt(text: string, offset: number): [unknown, number] {
  const type = text[offset];
  const lineEnd = text.indexOf("\r\n", offset);
  const line = text.slice(offset + 1, lineEnd);
  const next = lineEnd + 2;

  if (type === "+") {
    return [line, next];
  }
  if (type === "-") {
    throw new Error(line);
  }
  if (type === ":") {
    return [Number(line), next];
  }
  if (type === "$") {
    const length = Number(line);
    if (length === -1) {
      return [null, next];
    }
    const value = text.slice(next, next + length);
    return [value, next + length + 2];
  }
  if (type === "*") {
    const count = Number(line);
    const values: unknown[] = [];
    let cursor = next;
    for (let i = 0; i < count; i += 1) {
      const [value, newCursor] = parseAt(text, cursor);
      values.push(value);
      cursor = newCursor;
    }
    return [values, cursor];
  }

  throw new Error("Unexpected Redis response");
}
