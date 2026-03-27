import request from "supertest";
import type { Express } from "express";

describe("icons routes", () => {
  let app: Express;

  beforeAll(async () => {
    const server = await import("../../server");
    app = server.app as Express;
  });

  test("GET /icons/favicon-32x32.png returns png without auth", async () => {
    const res = await request(app).get("/icons/favicon-32x32.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });

  test("GET /icons/invalid.png returns 404", async () => {
    const res = await request(app).get("/icons/invalid.png");
    expect(res.status).toBe(404);
  });
});
