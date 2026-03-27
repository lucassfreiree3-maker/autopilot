import request from "supertest";
import type { Server } from "http";

describe("Express server tests", () => {
  let serverInstance: Server;
  let startServer: (port?: number) => Server;

  beforeAll(async () => {
    const mod = await import("../../server");
    startServer = mod.startServer;
    serverInstance = startServer(0);
  });

  afterAll(() => {
    serverInstance.close();
  });

  test("Health endpoint should return UP", async () => {
    const res = await request(serverInstance).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ status: "UP" });
  });

  test("Ready endpoint should return UP", async () => {
    const res = await request(serverInstance).get("/ready");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ status: "UP" });
  });
});
