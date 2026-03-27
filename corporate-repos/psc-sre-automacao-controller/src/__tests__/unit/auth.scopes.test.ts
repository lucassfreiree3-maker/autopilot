import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

describe("auth token scopes", () => {
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
        "test-api-key=scope:test:execute,scope:test:send,scope:test:read",
      AUTH_API_KEYS_JSON: "",
      AUTH_API_KEY: "",
      JWT_SECRET: "test-jwt-secret",
      JWT_EXPIRES_IN: "5m",
      JWT_SIGN_ALG: "HS256",
      JWT_ISSUER: "psc-sre-automacao-controller",
      JWT_AUDIENCE: "psc-sre-automacao-agent",
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

  test("rejects when no scopes are requested", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/auth/token")
      .set("x-api-key", "test-api-key")
      .send({ subject: "client" });
    expect(res.status).toBe(400);
  });

  test("rejects invalid scopes", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/auth/token")
      .set("x-api-key", "test-api-key")
      .send({ scope: ["scope:test:read", "scope:invalid"] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid scopes",
      hint:
        "Use GET /auth/required-scopes with x-api-key to discover the current scope values for this environment.",
    });
    expect(res.body.allowed).toBeUndefined();
    expect(res.body.invalid).toBeUndefined();
  });

  test("accepts valid scopes via 'scope'", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/auth/token")
      .set("x-api-key", "test-api-key")
      .send({ subject: "client", scope: ["scope:test:read"] });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(
      res.body.token,
      "test-jwt-secret",
    ) as jwt.JwtPayload;
    expect(decoded.sub).toBe("client");
    expect(decoded.typ).toBe("client");
    expect(decoded.scope).toEqual(["scope:test:read"]);
  });

  test("accepts valid scopes via 'scopes'", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/auth/token")
      .set("x-api-key", "test-api-key")
      .send({ subject: "client", scopes: ["scope:test:read"] });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(
      res.body.token,
      "test-jwt-secret",
    ) as jwt.JwtPayload;
    expect(decoded.sub).toBe("client");
    expect(decoded.typ).toBe("client");
    expect(decoded.scope).toEqual(["scope:test:read"]);
  });

  test("rejects requesting a scope not allowed for the api key", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/auth/token")
      .set("x-api-key", "test-api-key")
      .send({ subject: "client", scope: ["scope:test:register"] });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Scopes not allowed for API key",
      hint:
        "Use GET /auth/required-scopes with x-api-key to discover the current scope values for this environment.",
    });
    expect(res.body.allowed).toBeUndefined();
    expect(res.body.notAllowed).toBeUndefined();
  });
});
