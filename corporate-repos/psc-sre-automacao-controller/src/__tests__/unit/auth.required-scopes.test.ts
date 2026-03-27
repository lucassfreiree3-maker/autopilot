import express from "express";
import request from "supertest";

describe("auth required scopes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SCOPE_EXECUTE_AUTOMATION: "scope:test:execute",
      SCOPE_SEND_LOGS: "scope:test:send",
      SCOPE_READ_STATUS: "scope:test:read",
      SCOPE_REGISTER_AGENT: "scope:test:register",
      AUTH_API_KEYS_SCOPES:
        "test-api-key=scope:test:execute,scope:test:send,scope:test:read,scope:test:register",
      AUTH_API_KEYS_JSON: "",
      AUTH_API_KEY: "",
      SCOPES_SECRET_NAME: "",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function makeApp() {
    const { default: authRouter } = await import("../../routes/auth");
    const app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
    return app;
  }

  test("rejects when api key is missing", async () => {
    const app = await makeApp();
    const res = await request(app).get("/auth/required-scopes");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  test("returns required scopes for protected routes using environment fallback", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/auth/required-scopes")
      .set("x-api-key", "test-api-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toEqual({ kind: "environment" });

    const executeRoute = res.body.routes.find(
      (route: { method: string; path: string; requiredScope: string | null }) =>
        route.method === "POST" && route.path === "/agent/execute",
    );

    expect(executeRoute).toMatchObject({
      method: "POST",
      path: "/agent/execute",
      auth: "bearer-jwt",
      requiredScope: "scope:test:execute",
    });

    const publicRoute = res.body.routes.find(
      (route: { method: string; path: string; requiredScope: string | null }) =>
        route.method === "GET" && route.path === "/agent/list",
    );

    expect(publicRoute).toMatchObject({
      method: "GET",
      path: "/agent/list",
      auth: "public",
      requiredScope: null,
    });
  });

  test("falls back to environment when secret lookup is configured but unavailable", async () => {
    process.env.SCOPES_SECRET_NAME = "psc-sre-automacao-controller-runtime";
    delete process.env.KUBERNETES_API_URL;
    delete process.env.KUBERNETES_SERVICE_HOST;

    const app = await makeApp();
    const res = await request(app)
      .get("/auth/required-scopes")
      .set("x-api-key", "test-api-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toEqual({ kind: "environment" });
  });
});
