import type { Server } from "node:http";
import { createApp } from "../app";
import { assertTestDatabaseConnection } from "./databaseSafety";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
  api: <T = unknown>(path: string, init?: RequestInit & { token?: string; host?: string }) => Promise<{ status: number; body: T }>;
}

export async function startTestServer(): Promise<TestServer> {
  assertTestDatabaseConnection(process.env);
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    async api(path, init = {}) {
      const headers = new Headers(init.headers);
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      if (init.token) headers.set("authorization", `Bearer ${init.token}`);
      if (init.host) headers.set("x-forwarded-host", init.host);
      const res = await fetch(`${url}${path}`, { ...init, headers });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, body: body as never };
    },
  };
}
